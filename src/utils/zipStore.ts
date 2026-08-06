/**
 * Minimal ZIP store (no compression) for OFLN backup archives.
 * STORE method only — reliable for small JSON payloads on device.
 * Pure / Jest-safe (no RN imports).
 */

/** CRC-32 (IEEE) — required by ZIP local/central headers. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n: number): Uint8Array {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function encodeUtf8(str: string): Uint8Array {
  // Prefer TextEncoder when available (RN/Hermes); fallback for older envs.
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(str);
  }
  const out: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c < 0x80) out.push(c);
    else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c < 0xd800 || c >= 0xe000) {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    } else {
      i++;
      c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
      out.push(
        0xf0 | (c >> 18),
        0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f),
        0x80 | (c & 0x3f),
      );
    }
  }
  return new Uint8Array(out);
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8').decode(bytes);
  }
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

export type ZipEntry = {
  name: string;
  data: Uint8Array;
};

function isSafeZipEntryName(name: string): boolean {
  if (!name || name.length > 256) return false;
  if (name.includes('\\') || name.includes('\0')) return false;
  if (name.startsWith('/') || name.startsWith('../') || name.includes('/../')) {
    return false;
  }
  if (name.includes('..')) return false;
  // OFLN backups are flat (no nested dirs).
  if (name.includes('/')) return false;
  return /^[A-Za-z0-9._-]+$/.test(name);
}

/**
 * Build an uncompressed ZIP archive from named file entries.
 */
export function createZipStore(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!isSafeZipEntryName(entry.name)) {
      throw new Error(`Unsafe ZIP entry name: ${entry.name}`);
    }
    const nameBytes = encodeUtf8(entry.name);
    const data = entry.data;
    const crc = crc32(data);
    const size = data.length;

    // Local file header (30) + name + data
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20), // version needed
      u16(0), // flags
      u16(0), // method STORE
      u16(0), // mod time
      u16(0), // mod date
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0), // extra length
      nameBytes,
    ]);

    const localOffset = offset;
    localParts.push(localHeader, data);
    offset += localHeader.length + data.length;

    const central = concatBytes([
      u32(0x02014b50),
      u16(20), // version made by
      u16(20), // version needed
      u16(0),
      u16(0), // STORE
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(localOffset),
      nameBytes,
    ]);
    centralParts.push(central);
  }

  const centralDir = concatBytes(centralParts);
  const centralOffset = offset;
  const end = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(centralOffset),
    u16(0),
  ]);

  return concatBytes([...localParts, centralDir, end]);
}

function readU16(buf: Uint8Array, off: number): number {
  return buf[off] | (buf[off + 1] << 8);
}

function readU32(buf: Uint8Array, off: number): number {
  return (
    (buf[off] |
      (buf[off + 1] << 8) |
      (buf[off + 2] << 16) |
      (buf[off + 3] << 24)) >>>
    0
  );
}

/**
 * Extract STORE-method zip entries. Rejects compressed / path-traversal names.
 */
export function extractZipStore(buf: Uint8Array): ZipEntry[] {
  if (buf.length < 22) {
    throw new Error('File is too small to be a valid backup archive');
  }

  // Find end of central directory (scan from end; comment length ≤ 64k).
  let eocd = -1;
  const scanStart = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= scanStart; i--) {
    if (readU32(buf, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('Invalid ZIP: missing end of central directory');
  }

  const entryCount = readU16(buf, eocd + 10);
  let cdOffset = readU32(buf, eocd + 16);
  const out: ZipEntry[] = [];

  for (let n = 0; n < entryCount; n++) {
    if (cdOffset + 46 > buf.length || readU32(buf, cdOffset) !== 0x02014b50) {
      throw new Error('Invalid ZIP: corrupt central directory');
    }
    const method = readU16(buf, cdOffset + 10);
    const crc = readU32(buf, cdOffset + 16);
    const compSize = readU32(buf, cdOffset + 20);
    const uncompSize = readU32(buf, cdOffset + 24);
    const nameLen = readU16(buf, cdOffset + 28);
    const extraLen = readU16(buf, cdOffset + 30);
    const commentLen = readU16(buf, cdOffset + 32);
    const localHeaderOffset = readU32(buf, cdOffset + 42);
    const nameBytes = buf.subarray(cdOffset + 46, cdOffset + 46 + nameLen);
    const name = decodeUtf8(nameBytes);

    if (!isSafeZipEntryName(name)) {
      throw new Error(`Rejected unsafe entry in archive: ${name}`);
    }
    if (method !== 0) {
      throw new Error(
        `Compressed ZIP entries are not supported (entry: ${name}). Use an OFLN-created backup.`,
      );
    }
    if (compSize !== uncompSize) {
      throw new Error(`ZIP size mismatch for ${name}`);
    }

    if (localHeaderOffset + 30 > buf.length || readU32(buf, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid ZIP local header for ${name}`);
    }
    const localNameLen = readU16(buf, localHeaderOffset + 26);
    const localExtraLen = readU16(buf, localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + uncompSize;
    if (dataEnd > buf.length) {
      throw new Error(`ZIP data overrun for ${name}`);
    }
    const data = buf.subarray(dataStart, dataEnd);
    if (crc32(data) !== crc) {
      throw new Error(`ZIP CRC mismatch for ${name} — file may be corrupted`);
    }
    out.push({ name, data: new Uint8Array(data) });

    cdOffset += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

/** Detect ZIP local/EOCD signature at start or common positions. */
export function looksLikeZip(buf: Uint8Array): boolean {
  if (buf.length < 4) return false;
  return readU32(buf, 0) === 0x04034b50;
}

export function utf8ToBytes(str: string): Uint8Array {
  return encodeUtf8(str);
}

export function bytesToUtf8(bytes: Uint8Array): string {
  return decodeUtf8(bytes);
}

/** Base64 encode / decode for RNFS I/O. */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  const btoaFn =
    typeof globalThis.btoa === 'function'
      ? globalThis.btoa.bind(globalThis)
      : null;
  if (!btoaFn) {
    throw new Error('base64 encode unavailable');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    const sub = bytes.subarray(i, i + chunk);
    binary += String.fromCharCode(...sub);
  }
  return btoaFn(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const atobFn =
    typeof globalThis.atob === 'function'
      ? globalThis.atob.bind(globalThis)
      : null;
  if (!atobFn) {
    throw new Error('base64 decode unavailable');
  }
  const binary = atobFn(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
