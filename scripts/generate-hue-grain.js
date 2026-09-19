/**
 * Generates src/assets/hue-grain.png — the tiled dither/grain texture used by
 * the ambient hue field.
 *
 * The hue gradients run at very low alpha (the outer falloff of a blob spans
 * only a handful of 8-bit levels), so quantization shows up as concentric
 * contour rings. Overlaying uniform noise randomizes which side of a
 * quantization boundary each pixel lands on, which replaces the rings with
 * texture the eye reads as nothing at all.
 *
 * Deterministic: a fixed seed means re-running this never churns the asset.
 *
 * Usage: node scripts/generate-hue-grain.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 128;
const SEED = 0x9e3779b9;

/** mulberry32 — small, fast, good enough distribution for grain. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function buildGrayscalePng(size, pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // color type: grayscale
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  // One filter byte (0 = None) per scanline. Noise does not benefit from
  // predictive filters, so None keeps it simple and compresses the same.
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size + 1);
    raw[rowStart] = 0;
    pixels.copy(raw, rowStart + 1, y * size, (y + 1) * size);
  }

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function main() {
  const rand = mulberry32(SEED);
  const pixels = Buffer.alloc(SIZE * SIZE);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = Math.floor(rand() * 256);
  }

  const outDir = path.join(__dirname, '..', 'src', 'assets');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'hue-grain.png');
  const png = buildGrayscalePng(SIZE, pixels);
  fs.writeFileSync(outFile, png);

  console.log(`Wrote ${outFile} (${SIZE}x${SIZE}, ${png.length} bytes)`);
}

main();
