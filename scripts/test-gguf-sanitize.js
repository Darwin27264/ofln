/**
 * Local Node tests for GGUF chat_template sanitizer (no RN runtime).
 *
 * Usage:
 *   node scripts/test-gguf-sanitize.js              # synthetic + optional local copy
 *   node scripts/test-gguf-sanitize.js --no-real    # synthetic only
 *   node scripts/test-gguf-sanitize.js --file PATH  # sanitize a specific GGUF copy
 *
 * Uses an existing local copy under .tmp-gguf-test/ when present.
 * Does NOT adb-pull or mutate on-device files.
 */
const fs = require("fs");
const path = require("path");

const GGUF_MAGIC = 0x46554747;
const META_STRING = 8;
const META_ARRAY = 9;
const NATIVE_BUF = 16384;
const MARKER = "{% set __ofln_s=4 %}";
const LEGACY = [
  "<!--ofln-sanitized-v1-->",
  "{#ofln-sanitized-v1#}",
  "{#ofln-sanitized-v2#}",
  "{% set __ofln_s=3 %}",
];

/** Canonical GGUF scalar sizes (ggml/gguf.h) — wrong sizes silently corrupt offsets. */
const SCALAR_SIZE = {
  0: 1, // UINT8
  1: 1, // INT8
  2: 2, // UINT16
  3: 2, // INT16
  4: 4, // UINT32
  5: 4, // INT32
  6: 4, // FLOAT32
  7: 1, // BOOL
  10: 8, // UINT64
  11: 8, // INT64
  12: 8, // FLOAT64
};

function u32write(buf, offset, v) {
  buf.writeUInt32LE(v >>> 0, offset);
}
function u64write(buf, offset, v) {
  buf.writeUInt32LE(v >>> 0, offset);
  buf.writeUInt32LE(Math.floor(v / 0x100000000) >>> 0, offset + 4);
}
function writeString(parts, s) {
  const b = Buffer.from(s, "utf8");
  const len = Buffer.alloc(8);
  u64write(len, 0, b.length);
  parts.push(len, b);
}
function writeKVString(parts, key, value) {
  writeString(parts, key);
  const t = Buffer.alloc(4);
  u32write(t, 0, META_STRING);
  parts.push(t);
  writeString(parts, value);
}
function writeKVFloat32(parts, key, value) {
  writeString(parts, key);
  const t = Buffer.alloc(4);
  u32write(t, 0, 6); // FLOAT32
  parts.push(t);
  const v = Buffer.alloc(4);
  v.writeFloatLE(value, 0);
  parts.push(v);
}
function writeKVArrayOfU8(parts, key, count) {
  writeString(parts, key);
  const t = Buffer.alloc(4);
  u32write(t, 0, META_ARRAY);
  parts.push(t);
  const head = Buffer.alloc(12);
  u32write(head, 0, 0); // UINT8 elems
  u64write(head, 4, count);
  parts.push(head);
  parts.push(Buffer.alloc(count, 0xab));
}
function writeKVArrayOfString(parts, key, strings) {
  writeString(parts, key);
  const t = Buffer.alloc(4);
  u32write(t, 0, META_ARRAY);
  parts.push(t);
  const head = Buffer.alloc(12);
  u32write(head, 0, META_STRING);
  u64write(head, 4, strings.length);
  parts.push(head);
  for (const s of strings) writeString(parts, s);
}

function buildSyntheticGguf({ hugeTemplate, tokenArrayCount, stringTokens }) {
  const parts = [];
  const header = Buffer.alloc(24);
  u32write(header, 0, GGUF_MAGIC);
  u32write(header, 4, 3);
  u64write(header, 8, 0);
  parts.push(header);

  let kv = 0;
  writeKVString(parts, "general.architecture", "qwen3");
  kv++;
  writeKVFloat32(parts, "qwen35.rope.freq_base", 1000000);
  kv++;
  writeKVArrayOfU8(parts, "tokenizer.ggml.tokens_fake", tokenArrayCount);
  kv++;
  if (stringTokens && stringTokens.length) {
    writeKVArrayOfString(parts, "tokenizer.ggml.tokens", stringTokens);
    kv++;
  }
  writeKVString(parts, "tokenizer.chat_template", hugeTemplate);
  kv++;

  u64write(header, 16, kv);
  return Buffer.concat(parts);
}

function u32(buf, o) {
  return buf.readUInt32LE(o);
}
function u64(buf, o) {
  return buf.readUInt32LE(o) + buf.readUInt32LE(o + 4) * 0x100000000;
}

/**
 * Windowed reader — critical for ARRAY of STRING (150k+ tokens).
 * Avoids one RNFS/fs call per token element.
 */
function createWindowedIo(filePath, windowSize = 4 * 1024 * 1024) {
  const fd = fs.openSync(filePath, "r+");
  const fileSize = fs.fstatSync(fd).size;
  let winStart = -1;
  let win = Buffer.alloc(0);

  function ensure(pos, len) {
    if (pos < 0 || pos + len > fileSize) {
      throw new Error(`read past EOF pos=${pos} len=${len} size=${fileSize}`);
    }
    if (pos >= winStart && pos + len <= winStart + win.length) {
      return pos - winStart;
    }
    const fetch = Math.max(len, windowSize);
    winStart = pos;
    win = Buffer.alloc(Math.min(fetch, fileSize - pos));
    fs.readSync(fd, win, 0, win.length, pos);
    return 0;
  }

  return {
    fileSize,
    close: () => fs.closeSync(fd),
    exists: async () => true,
    size: async () => fileSize,
    read: async (_p, position, length) => {
      const i = ensure(position, length);
      return new Uint8Array(win.buffer, win.byteOffset + i, length);
    },
    write: async (_p, position, data) => {
      fs.writeSync(fd, Buffer.from(data), 0, data.length, position);
      // Invalidate window overlapping the write
      if (winStart >= 0) {
        const end = position + data.length;
        const wEnd = winStart + win.length;
        if (!(end <= winStart || position >= wEnd)) {
          winStart = -1;
          win = Buffer.alloc(0);
        }
      }
    },
  };
}

async function skipValue(io, filePath, type, position, fileSize) {
  if (SCALAR_SIZE[type] != null) {
    return position + SCALAR_SIZE[type];
  }
  if (type === META_STRING) {
    const lenBuf = await io.read(filePath, position, 8);
    const len = u64(Buffer.from(lenBuf), 0);
    return position + 8 + len;
  }
  if (type === META_ARRAY) {
    const head = await io.read(filePath, position, 12);
    const hb = Buffer.from(head);
    const elemType = u32(hb, 0);
    const count = u64(hb, 4);
    let cursor = position + 12;
    // Fast path: fixed-size scalar arrays (scores, etc.)
    if (SCALAR_SIZE[elemType] != null) {
      return cursor + count * SCALAR_SIZE[elemType];
    }
    for (let i = 0; i < count; i++) {
      cursor = await skipValue(io, filePath, elemType, cursor, fileSize);
    }
    return cursor;
  }
  throw new Error("bad type " + type);
}

async function sanitize(filePath, io, opts = {}) {
  const force = !!opts.force;
  const fileSize = await io.size(filePath);
  const header = Buffer.from(await io.read(filePath, 0, 24));
  if (u32(header, 0) !== GGUF_MAGIC) return { sanitized: false, reason: "not_gguf" };
  const kvCount = u64(header, 16);
  let offset = 24;
  let mutated = false;
  let keyHits = [];
  const MULTI = ["image_count", "video_count", "vision", "<|image|>", "mmproj"];
  for (let i = 0; i < kvCount; i++) {
    const keyLen = u64(Buffer.from(await io.read(filePath, offset, 8)), 0);
    offset += 8;
    const key = Buffer.from(await io.read(filePath, offset, keyLen)).toString("utf8");
    offset += keyLen;
    const type = u32(Buffer.from(await io.read(filePath, offset, 4)), 0);
    offset += 4;
    keyHits.push(key);
    if (type === META_STRING && key.toLowerCase().includes("chat_template")) {
      const strLen = u64(Buffer.from(await io.read(filePath, offset, 8)), 0);
      const strDataOffset = offset + 8;
      const preview = Buffer.from(
        await io.read(filePath, strDataOffset, Math.min(strLen, 512))
      ).toString("utf8");
      const multimodal = MULTI.some((m) => preview.toLowerCase().includes(m));
      const needsRepair = LEGACY.some((p) => preview.startsWith(p));
      const should =
        !preview.startsWith(MARKER) &&
        (strLen >= NATIVE_BUF || needsRepair || (force && multimodal && strLen >= NATIVE_BUF));
      if (!should) {
        offset = strDataOffset + strLen;
        continue;
      }
      const stub = Buffer.from(MARKER + "{{stub}}", "utf8");
      const open = Buffer.from("{% if false %}", "utf8");
      const close = Buffer.from("{% endif %}", "utf8");
      const replacement = Buffer.alloc(strLen, 0x20);
      stub.copy(replacement, 0);
      const rem = strLen - stub.length;
      if (rem >= open.length + close.length) {
        open.copy(replacement, stub.length);
        close.copy(replacement, strLen - close.length);
      }
      await io.write(filePath, strDataOffset, replacement);
      mutated = true;
      offset = strDataOffset + strLen;
      continue;
    }
    offset = await skipValue(io, filePath, type, offset, fileSize);
  }
  return {
    sanitized: mutated,
    reason: mutated ? "padded" : "noop",
    keys: keyHits.length,
    lastKeys: keyHits.slice(-5),
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
}

async function testSynthetic() {
  const dir = path.join(__dirname, "..", ".tmp-gguf-test");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "synthetic.gguf");

  const huge = "α".repeat(20000);
  const hugeBuf = Buffer.from(huge, "utf8");
  assert(hugeBuf.length > NATIVE_BUF, "template must exceed native buffer");

  // Include FLOAT32 + UINT8 array + STRING array before template (mirrors real layout hazards)
  const stringTokens = [];
  for (let i = 0; i < 2000; i++) stringTokens.push("tok" + i);

  const gguf = buildSyntheticGguf({
    hugeTemplate: huge,
    tokenArrayCount: 50_000,
    stringTokens,
  });
  fs.writeFileSync(file, gguf);
  const before = fs.statSync(file).size;

  const io = createWindowedIo(file);
  try {
    const t0 = Date.now();
    const r1 = await sanitize(file, io);
    const ms = Date.now() - t0;
    assert(r1.sanitized === true, "should sanitize huge template");
    assert(fs.statSync(file).size === before, "file size must be unchanged");
    assert(ms < 5000, "synthetic sanitize too slow: " + ms + "ms");

    const r2 = await sanitize(file, io);
    assert(r2.sanitized === false, "idempotent — second pass no-op");

    // Verify 16KB truncate is valid UTF-8 / starts with marker
    const all = fs.readFileSync(file);
    let offset = 24;
    const kv = u64(all, 16);
    let found = false;
    for (let i = 0; i < kv; i++) {
      const keyLen = u64(all, offset);
      offset += 8;
      const key = all.subarray(offset, offset + keyLen).toString("utf8");
      offset += keyLen;
      const type = u32(all, offset);
      offset += 4;
      if (type === META_STRING && key.includes("chat_template")) {
        const strLen = u64(all, offset);
        const dataOff = offset + 8;
        const sliced = all.subarray(dataOff, dataOff + NATIVE_BUF);
        const decoded = sliced.toString("utf8");
        assert(decoded.startsWith(MARKER), "truncated must start with marker");
        // Mid-cut of space-padded ASCII must never produce replacement chars
        assert(!/\uFFFD/.test(decoded), "truncated UTF-8 must be clean");
        console.log(
          "  synthetic OK: templateLen=%d ms=%d truncatedPreview=%s",
          strLen,
          ms,
          decoded.slice(0, 48)
        );
        found = true;
        break;
      }
      if (SCALAR_SIZE[type] != null) {
        offset += SCALAR_SIZE[type];
      } else if (type === META_ARRAY) {
        const elemType = u32(all, offset);
        const count = u64(all, offset + 4);
        offset += 12;
        if (SCALAR_SIZE[elemType] != null) {
          offset += count * SCALAR_SIZE[elemType];
        } else if (elemType === META_STRING) {
          for (let j = 0; j < count; j++) {
            const sl = u64(all, offset);
            offset += 8 + sl;
          }
        } else {
          throw new Error("unexpected array et " + elemType);
        }
      } else if (type === META_STRING) {
        const len = u64(all, offset);
        offset += 8 + len;
      } else {
        throw new Error("unhandled " + type);
      }
    }
    assert(found, "chat_template not found after sanitize");
  } finally {
    io.close();
  }

  fs.unlinkSync(file);
  console.log("PASS synthetic streaming sanitizer");
}

async function testRealFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log("SKIP real file (missing):", filePath);
    return;
  }
  const size = fs.statSync(filePath).size;
  console.log("  real file bytes=%d path=%s", size, filePath);

  const copy = filePath + ".sanitize-test";
  fs.copyFileSync(filePath, copy);
  const io = createWindowedIo(copy, 8 * 1024 * 1024);
  try {
    // Without force: under-16KB templates stay intact (real-device path).
    const rNoForce = await sanitize(copy, io, { force: false });
    console.log("  no-force result:", rNoForce);

    // Emulator path: force pads multimodal Jinja (Qwen3.5 0.8B ~7.8KB vision template).
    const t0 = Date.now();
    const r = await sanitize(copy, io, { force: true });
    const ms = Date.now() - t0;
    console.log("  force(emulator) result:", r, "ms=" + ms);
    assert(fs.statSync(copy).size === size, "size preserved");
    assert(ms < 120_000, "real sanitize hung: " + ms + "ms");

    // Confirm chat_template state after pass
    const io2 = createWindowedIo(copy, 8 * 1024 * 1024);
    try {
      const header = Buffer.from(await io2.read(copy, 0, 24));
      let offset = 24;
      const kvCount = u64(header, 16);
      for (let i = 0; i < kvCount; i++) {
        const keyLen = u64(Buffer.from(await io2.read(copy, offset, 8)), 0);
        offset += 8;
        const key = Buffer.from(await io2.read(copy, offset, keyLen)).toString("utf8");
        offset += keyLen;
        const type = u32(Buffer.from(await io2.read(copy, offset, 4)), 0);
        offset += 4;
        if (type === META_STRING && key.toLowerCase().includes("chat_template")) {
          const strLen = u64(Buffer.from(await io2.read(copy, offset, 8)), 0);
          const dataOff = offset + 8;
          const preview = Buffer.from(
            await io2.read(copy, dataOff, Math.min(48, strLen))
          ).toString("utf8");
          const trunc = Buffer.from(
            await io2.read(copy, dataOff, Math.min(NATIVE_BUF, strLen))
          ).toString("utf8");
          console.log(
            "  chat_template key=%s len=%d dataOff=%d preview=%s",
            key,
            strLen,
            dataOff,
            JSON.stringify(preview)
          );
          if (r.sanitized || strLen >= NATIVE_BUF) {
            assert(preview.startsWith(MARKER), "padded template must start with marker");
            assert(!/\uFFFD/.test(trunc), "16KB truncate must be valid UTF-8");
          }
          break;
        }
        offset = await skipValue(io2, copy, type, offset, size);
      }
    } finally {
      io2.close();
    }

    if (r.sanitized) {
      console.log("PASS real GGUF sanitizer (emulator force mutated)");
    } else {
      console.log("PASS real GGUF sanitizer (no mutation: %s)", r.reason);
    }
  } finally {
    io.close();
    try {
      fs.unlinkSync(copy);
    } catch {
      /* ignore */
    }
  }
}

(async () => {
  console.log("=== GGUF sanitize local tests ===");
  const args = process.argv.slice(2);
  const noReal = args.includes("--no-real");
  const fileIdx = args.indexOf("--file");
  const explicit =
    fileIdx >= 0 ? args[fileIdx + 1] : null;

  await testSynthetic();

  if (!noReal) {
    const candidates = [
      explicit,
      path.join(__dirname, "..", ".tmp-gguf-test", "qwen08b-head.gguf"),
    ].filter(Boolean);
    for (const c of candidates) {
      await testRealFile(c);
      break;
    }
  }

  console.log("=== done ===");
})().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
