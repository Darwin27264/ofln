/**
 * GGUF metadata sanitizer for Android / emulator loads.
 *
 * llama.rn 0.12 createModelDetails() can fail AFTER a successful native load when
 * a huge chat_template overflows a 16KB stack buffer (mid-UTF-8 → Unknown error),
 * OR when Minja chokes on multimodal Jinja (Qwen3.5 vision macros like
 * `namespace(value=0)` / `image_count`). That leaves `model: {}` without
 * `metadata`, and the next `completion({ messages })` throws:
 *   Cannot read property 'tokenizer.chat_template' of undefined
 *
 * Fix without rebuilding llama.rn: overwrite chat_template VALUE IN-PLACE with a
 * short Jinja stub (v4: enable_thinking=false → empty `<think></think>`) plus
 * `{% if false %}…spaces…{% endif %}` so on-disk length stays identical.
 * Do NOT pad with raw spaces or `{# comments #}` — Minja emits those into the
 * prompt (space-token floods → empty replies / 0 tok/s).
 *
 * Device notes:
 * - Streams metadata (does not load the whole model into JS).
 * - 1MB windowed reads — tokenizer.ggml.tokens is ~250k STRING elems.
 * - Correct GGUF scalar sizes (FLOAT32=6, BOOL=7).
 * - Chunked base64 writes; no Buffer dependency (Hermes-safe).
 * - iOS is a no-op.
 * - Oversized, legacy, and multimodal-under-16KB templates are padded.
 * - Plain text Jinja under 16KB is left intact.
 */

import { Platform } from "react-native";
import RNFS from "react-native-fs";
import {
  getSafeChatTemplateStub,
  SAFE_CHAT_TEMPLATE_STUB as CHATML_STUB,
} from "./inference/familyTemplates";
import { resolveModelFamily, type ModelFamilyId } from "./inference/modelFamily";

const GGUF_MAGIC = 0x46554747; // "GGUF" little-endian
const META_STRING = 8;
const META_ARRAY = 9;

/** Native llama.rn createModelDetails buffer size (see RNLlamaJSI.cpp). */
export const NATIVE_META_STRING_BUF = 16384;

/** Sanitize when template would overflow the native 16KB UTF-8 buffer. */
const SANITIZE_LEN_THRESHOLD = NATIVE_META_STRING_BUF;

/**
 * Default ChatML+think stub (Qwen / generic). Prefer
 * getSafeChatTemplateStub(family) via sanitize options when the model is known.
 * @deprecated Import from familyTemplates — kept for Diagnostics / legacy imports.
 */
export const SAFE_CHAT_TEMPLATE_STUB = CHATML_STUB;

/**
 * Qwen3.5 (and similar) ship a ~7.8KB multimodal Jinja that is under the 16KB
 * buffer limit but still breaks llama.rn template validation / formatting on
 * some Android devices (S25/S26 Ultra). Detect and replace with the text stub.
 */
export function looksLikeMultimodalChatTemplate(preview: string): boolean {
  const p = preview.toLowerCase();
  return (
    p.includes("image_count") ||
    p.includes("video_count") ||
    p.includes("namespace(value=") ||
    p.includes("<|vision") ||
    p.includes("mm_token") ||
    p.includes("media_token") ||
    p.includes("{%- macro")
  );
}

/**
 * Pad strategy (v5): family-aware Jinja stub + dead-branch length pad.
 * v4 was Qwen ChatML-only (wrong for Gemma/Phi after force sanitize).
 */
export const SANITIZE_MARKER = "{% set __ofln_s=5 %}";
/** Prior pads that must be rewritten on next load. */
const LEGACY_SANITIZE_PREFIXES = [
  "<!--ofln-sanitized-v1-->",
  "{#ofln-sanitized-v1#}",
  "{#ofln-sanitized-v2#}",
  "{% set __ofln_s=1 %}",
  "{% set __ofln_s=2 %}",
  "{% set __ofln_s=3 %}",
  "{% set __ofln_s=4 %}",
];

export type SanitizeResult = {
  sanitized: boolean;
  reason: string;
  key?: string;
  originalLength?: number;
  offset?: number;
  preview?: string;
};

export type SanitizeOptions = {
  /**
   * When true, pad any chat_template that is not already a clean ofln stub.
   * Used for load-time recovery after getFormattedChat fails.
   */
  force?: boolean;
  /**
   * Model filename / path so the pad uses a family-matched Jinja stub
   * (Gemma vs ChatML vs Phi) instead of always ChatML.
   */
  modelName?: string;
  /** Override family when already known (skips re-parse from modelName). */
  familyId?: ModelFamilyId;
};

function resolveSanitizeFamily(options: SanitizeOptions): ModelFamilyId {
  if (options.familyId) return options.familyId;
  if (options.modelName) {
    return resolveModelFamily(options.modelName).id;
  }
  return "generic";
}

function familyMarker(familyId: ModelFamilyId): string {
  return `{% set __ofln_f='${familyId}' %}`;
}

function isLegacyOrBrokenSanitize(preview: string): boolean {
  return LEGACY_SANITIZE_PREFIXES.some((p) => preview.startsWith(p));
}

/** Clean only when v5 marker + matching family id are present. */
function isCleanSanitize(preview: string, familyId: ModelFamilyId): boolean {
  if (!preview.startsWith(SANITIZE_MARKER)) return false;
  return preview.includes(`__ofln_f='${familyId}'`);
}

/**
 * Same-length replacement: marker + family + stub + `{% if false %} spaces {% endif %}`.
 */
function buildInPlaceTemplateReplacement(
  strLen: number,
  familyId: ModelFamilyId,
): Uint8Array | null {
  const familyStub = getSafeChatTemplateStub(familyId);
  const stub = `${SANITIZE_MARKER}${familyMarker(familyId)}${familyStub}`;
  const stubBytes = encodeUtf8(stub);
  const open = encodeUtf8("{% if false %}");
  const close = encodeUtf8("{% endif %}");
  if (stubBytes.length > strLen) return null;

  const out = new Uint8Array(strLen);
  out.fill(0x20);
  out.set(stubBytes, 0);

  const rem = strLen - stubBytes.length;
  if (rem >= open.length + close.length) {
    out.set(open, stubBytes.length);
    out.set(close, strLen - close.length);
  }
  return out;
}

// ── base64 helpers (no Buffer dependency — Hermes / JSC safe) ───────────────

const B64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const a = bytes[i];
    const b = i + 1 < len ? bytes[i + 1] : 0;
    const c = i + 2 < len ? bytes[i + 2] : 0;
    const triple = (a << 16) | (b << 8) | c;
    out += B64[(triple >> 18) & 63];
    out += B64[(triple >> 12) & 63];
    out += i + 1 < len ? B64[(triple >> 6) & 63] : "=";
    out += i + 2 < len ? B64[triple & 63] : "=";
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\r\n\s]/g, "");
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  const len = ((clean.length * 3) / 4) | 0;
  const out = new Uint8Array(len - padding);
  let o = 0;
  const decode = (ch: string): number => {
    const c = ch.charCodeAt(0);
    if (c >= 65 && c <= 90) return c - 65;
    if (c >= 97 && c <= 122) return c - 71;
    if (c >= 48 && c <= 57) return c + 4;
    if (ch === "+") return 62;
    if (ch === "/") return 63;
    return 0;
  };
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (decode(clean[i]) << 18) |
      (decode(clean[i + 1]) << 12) |
      (decode(clean[i + 2]) << 6) |
      decode(clean[i + 3]);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function encodeUtf8(str: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  // Minimal ASCII/Latin-1 fallback — our stub is ASCII-only.
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      /* fall through */
    }
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

// ── file IO (injectable for Node tests) ─────────────────────────────────────

export type GgufIo = {
  exists: (path: string) => Promise<boolean>;
  size: (path: string) => Promise<number>;
  read: (path: string, position: number, length: number) => Promise<Uint8Array>;
  write: (path: string, position: number, data: Uint8Array) => Promise<void>;
};

const CHUNK = 256 * 1024; // RNFS transfer chunk — safe on low-RAM phones
/** Parse window: large enough to skip token arrays without one bridge call per token. */
const WINDOW = 1024 * 1024; // 1MB — fits low-RAM Android / emulator heaps

/** Canonical GGUF scalar sizes (ggml/gguf.h). Wrong sizes silently corrupt offsets. */
const SCALAR_SIZE: Record<number, number> = {
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

async function rnfsReadRaw(
  path: string,
  position: number,
  length: number
): Promise<Uint8Array> {
  if (length <= 0) return new Uint8Array(0);
  if (length <= CHUNK) {
    const b64 = await RNFS.read(path, length, position, "base64");
    return base64ToBytes(b64);
  }
  const out = new Uint8Array(length);
  let filled = 0;
  while (filled < length) {
    const n = Math.min(CHUNK, length - filled);
    const part = await rnfsReadRaw(path, position + filled, n);
    out.set(part, filled);
    filled += part.length;
  }
  return out;
}

async function rnfsWrite(
  path: string,
  position: number,
  data: Uint8Array
): Promise<void> {
  // Write in chunks — large btoa of 50KB+ can strain older Hermes heaps.
  let offset = 0;
  while (offset < data.length) {
    const n = Math.min(CHUNK, data.length - offset);
    const slice = data.subarray(offset, offset + n);
    await RNFS.write(path, bytesToBase64(slice), position + offset, "base64");
    offset += n;
  }
}

/**
 * Buffered GgufIo — one RNFS read fills WINDOW bytes; subsequent peek/skip
 * of tokenizer.ggml.tokens (150k STRING elems) stays in JS instead of 150k
 * bridge round-trips (would hang emulator / low-end phones).
 */
function createWindowedIo(inner: GgufIo, fileSize: number): GgufIo {
  let winStart = -1;
  let win = new Uint8Array(0);

  const invalidate = (position: number, length: number) => {
    if (winStart < 0) return;
    const end = position + length;
    const wEnd = winStart + win.length;
    if (!(end <= winStart || position >= wEnd)) {
      winStart = -1;
      win = new Uint8Array(0);
    }
  };

  return {
    exists: inner.exists,
    size: inner.size,
    read: async (path, position, length) => {
      if (length <= 0) return new Uint8Array(0);
      if (position < 0 || position + length > fileSize) {
        throw new Error(
          `read past EOF pos=${position} len=${length} size=${fileSize}`
        );
      }
      if (
        winStart >= 0 &&
        position >= winStart &&
        position + length <= winStart + win.length
      ) {
        return win.subarray(
          position - winStart,
          position - winStart + length
        );
      }
      // Prefer filling a full window starting at position (metadata walks forward).
      const fetch = Math.min(
        Math.max(length, WINDOW),
        fileSize - position
      );
      win = await inner.read(path, position, fetch);
      winStart = position;
      if (win.length < length) {
        throw new Error(
          `Short read at ${position}: got ${win.length}/${length}`
        );
      }
      return win.subarray(0, length);
    },
    write: async (path, position, data) => {
      invalidate(position, data.length);
      await inner.write(path, position, data);
    },
  };
}

const bareRnfsIo: GgufIo = {
  exists: (p) => RNFS.exists(p),
  size: async (p) => {
    const s = await RNFS.stat(p);
    return Number(s.size) || 0;
  },
  read: rnfsReadRaw,
  write: rnfsWrite,
};

// ── binary helpers ──────────────────────────────────────────────────────────

function u32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)
  ) >>> 0;
}

function u64(bytes: Uint8Array, offset: number): number {
  const lo = u32(bytes, offset);
  const hi = u32(bytes, offset + 4);
  // Metadata lengths we care about fit in 2^32; reject absurd values early.
  if (hi > 0xff) {
    throw new Error(`GGUF u64 too large at ${offset}`);
  }
  return hi * 0x100000000 + lo;
}

async function readExact(
  io: GgufIo,
  path: string,
  position: number,
  length: number
): Promise<Uint8Array> {
  const data = await io.read(path, position, length);
  if (data.length < length) {
    throw new Error(`Short read at ${position}: got ${data.length}/${length}`);
  }
  return data;
}

/**
 * Advance past a typed GGUF value without materializing large payloads.
 * Scalar arrays use O(1) arithmetic; STRING arrays walk lengths via the
 * windowed reader (still O(n) CPU, but ~O(n/WINDOW) I/O).
 */
async function skipValue(
  io: GgufIo,
  path: string,
  type: number,
  position: number,
  fileSize: number
): Promise<number> {
  const scalar = SCALAR_SIZE[type];
  if (scalar != null) {
    const next = position + scalar;
    if (next > fileSize) throw new Error("scalar past EOF");
    return next;
  }
  switch (type) {
    case META_STRING: {
      const lenBuf = await readExact(io, path, position, 8);
      const len = u64(lenBuf, 0);
      const next = position + 8 + len;
      if (next > fileSize) throw new Error("STRING value past EOF");
      return next;
    }
    case META_ARRAY: {
      const head = await readExact(io, path, position, 12);
      const elemType = u32(head, 0);
      const count = u64(head, 4);
      let cursor = position + 12;
      if (count > 50_000_000) {
        throw new Error(`ARRAY count too large: ${count}`);
      }
      const elemScalar = SCALAR_SIZE[elemType];
      if (elemScalar != null) {
        const next = cursor + count * elemScalar;
        if (next > fileSize) throw new Error("ARRAY past EOF");
        return next;
      }
      for (let i = 0; i < count; i++) {
        cursor = await skipValue(io, path, elemType, cursor, fileSize);
      }
      return cursor;
    }
    default:
      throw new Error(`Unsupported GGUF type ${type}`);
  }
}

/**
 * Overwrite tokenizer.chat_template string values in-place when needed.
 * Idempotent. Safe to run on every Android load.
 */
export async function sanitizeGgufChatTemplateInPlace(
  filePath: string,
  io?: GgufIo,
  options: SanitizeOptions = {}
): Promise<SanitizeResult> {
  const familyId = resolveSanitizeFamily({
    ...options,
    modelName: options.modelName || filePath.split(/[/\\]/).pop() || "",
  });
  const baseIo = io ?? bareRnfsIo;
  const exists = await baseIo.exists(filePath);
  if (!exists) {
    return { sanitized: false, reason: "file_missing" };
  }

  const fileSize = await baseIo.size(filePath);
  if (fileSize < 24) {
    return { sanitized: false, reason: "file_too_small" };
  }

  // Windowed reads are required on-device: tokenizer.ggml.tokens is often
  // 100k+ STRING elements sitting before chat_template.
  const activeIo = io ?? createWindowedIo(bareRnfsIo, fileSize);

  const header = await readExact(activeIo, filePath, 0, 24);
  if (u32(header, 0) !== GGUF_MAGIC) {
    return { sanitized: false, reason: "not_gguf" };
  }

  const version = u32(header, 4);
  if (version < 2 || version > 3) {
    return { sanitized: false, reason: `unsupported_gguf_version_${version}` };
  }

  const kvCount = u64(header, 16);
  let offset = 24;
  let mutated = false;
  let multimodalPadded = false;
  let lastKey: string | undefined;
  let patchedKey: string | undefined;
  let patchedLen: number | undefined;
  let patchedOffset: number | undefined;
  let patchedPreview: string | undefined;
  let foundTemplateKey: string | undefined;
  let foundTemplateLen: number | undefined;
  let foundTemplateOffset: number | undefined;
  let foundTemplatePreview: string | undefined;
  let skipReason: string | undefined;

  for (let i = 0; i < kvCount; i++) {
    if (offset + 12 > fileSize) {
      return {
        sanitized: mutated,
        reason: "truncated_metadata",
        key: lastKey,
      };
    }

    const keyLenBuf = await readExact(activeIo, filePath, offset, 8);
    const keyLen = u64(keyLenBuf, 0);
    offset += 8;
    if (keyLen > 1024 || offset + keyLen + 4 > fileSize) {
      return { sanitized: mutated, reason: "bad_key_length", key: lastKey };
    }

    const keyBytes = await readExact(activeIo, filePath, offset, keyLen);
    const key = decodeUtf8(keyBytes);
    offset += keyLen;
    lastKey = key;

    const typeBuf = await readExact(activeIo, filePath, offset, 4);
    const type = u32(typeBuf, 0);
    offset += 4;

    if (type === META_STRING && key.toLowerCase().includes("chat_template")) {
      const strLenBuf = await readExact(activeIo, filePath, offset, 8);
      const strLen = u64(strLenBuf, 0);
      const strDataOffset = offset + 8;
      if (strDataOffset + strLen > fileSize) {
        return { sanitized: mutated, reason: "chat_template_past_eof", key };
      }

      const previewLen = Math.min(
        strLen,
        Math.max(SANITIZE_MARKER.length + 8, 512)
      );
      const preview = decodeUtf8(
        await readExact(activeIo, filePath, strDataOffset, previewLen)
      );

      foundTemplateKey = key;
      foundTemplateLen = strLen;
      foundTemplateOffset = strDataOffset;
      foundTemplatePreview = preview.slice(0, 120);

      if (isCleanSanitize(preview, familyId)) {
        // Confirm dead-branch trailer is present; rewrite if a prior write was truncated.
        const tail = decodeUtf8(
          await readExact(
            activeIo,
            filePath,
            strDataOffset + Math.max(0, strLen - 24),
            Math.min(24, strLen)
          )
        );
        if (tail.includes("endif") || /%\s*}/.test(tail)) {
          skipReason = "already_v5_clean";
          offset = strDataOffset + strLen;
          continue;
        }
        skipReason = "v5_missing_endif_trailer";
      }

      const oversized = strLen >= SANITIZE_LEN_THRESHOLD;
      const needsRepair =
        isLegacyOrBrokenSanitize(preview) ||
        skipReason === "v5_missing_endif_trailer" ||
        // Wrong family stub, or pre-v5 ofln pad.
        (preview.startsWith("{% set __ofln_s=") &&
          !isCleanSanitize(preview, familyId));
      const multimodal = looksLikeMultimodalChatTemplate(preview);
      // Pad oversized, broken, multimodal-under-16KB, or force-rewrite any
      // remaining template (recovery after getFormattedChat fails).
      const shouldPad = oversized || needsRepair || multimodal || !!options.force;
      if (!shouldPad) {
        skipReason = "pristine_under_16kb";
        offset = strDataOffset + strLen;
        continue;
      }
      if (options.force && !oversized && !needsRepair && !multimodal) {
        skipReason = "force_pad";
      } else if (multimodal && !oversized && !needsRepair) {
        skipReason = "multimodal_jinja_under_16kb";
      }

      const replacement = buildInPlaceTemplateReplacement(strLen, familyId);
      if (!replacement) {
        offset = strDataOffset + strLen;
        continue;
      }

      // Chunked write — avoid one giant base64 of 40KB+ on low-RAM phones.
      let writeOff = 0;
      while (writeOff < replacement.length) {
        const n = Math.min(CHUNK, replacement.length - writeOff);
        await activeIo.write(
          filePath,
          strDataOffset + writeOff,
          replacement.subarray(writeOff, writeOff + n)
        );
        writeOff += n;
      }

      mutated = true;
      if (multimodal && !oversized && !needsRepair) {
        multimodalPadded = true;
      }
      patchedKey = key;
      patchedLen = strLen;
      patchedOffset = strDataOffset;
      patchedPreview = decodeUtf8(
        replacement.subarray(0, Math.min(120, replacement.length))
      );
      offset = strDataOffset + strLen;
      continue;
    }

    offset = await skipValue(activeIo, filePath, type, offset, fileSize);
  }

  return {
    sanitized: mutated,
    reason: mutated
      ? multimodalPadded
        ? "multimodal_jinja_padded"
        : skipReason === "force_pad"
          ? "chat_template_force_padded"
          : "chat_template_padded"
      : skipReason ??
        (foundTemplateKey ? "no_change_needed" : "chat_template_not_found"),
    key: patchedKey ?? foundTemplateKey ?? lastKey,
    originalLength: patchedLen ?? foundTemplateLen,
    offset: patchedOffset ?? foundTemplateOffset,
    preview: patchedPreview ?? foundTemplatePreview,
  };
}

/**
 * Ensure the model file is safe for llama.rn init on Android.
 * No-op on iOS. Mutates the file on disk when needed; returns the same path.
 */
export async function ensureGgufSafeForAndroidLoad(
  filePath: string,
  options: SanitizeOptions = {},
): Promise<string> {
  if (Platform.OS !== "android") {
    return filePath;
  }
  const opts: SanitizeOptions = {
    ...options,
    modelName: options.modelName || filePath.split(/[/\\]/).pop() || "",
  };
  try {
    const result = await sanitizeGgufChatTemplateInPlace(filePath, undefined, opts);
    // Always persist a short breadcrumb so Diagnostics → Copy Log shows load state.
    const { logError } = await import("../utils/errorLogger");
    await logError(
      "GgufSanitize",
      result.sanitized
        ? `Repaired chat_template (${result.reason})`
        : `chat_template unchanged (${result.reason})`,
      undefined,
      {
        file: filePath.split("/").pop(),
        key: result.key,
        templateLength: result.originalLength,
        offset: result.offset,
        previewHead: result.preview?.slice(0, 100),
        decision: result.reason,
        force: !!opts.force,
        familyId: resolveSanitizeFamily(opts),
      },
      "INFO"
    );
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[GgufSanitize]", result);
    }
  } catch (err) {
    // Never block model load on sanitizer failure — log and continue.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        "[GgufSanitize] failed (continuing with original file):",
        err instanceof Error ? err.message : err
      );
    }
  }
  return filePath;
}
