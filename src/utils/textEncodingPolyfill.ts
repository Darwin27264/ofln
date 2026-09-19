/**
 * Global polyfills for TextDecoder and TextEncoder in React Native / Hermes.
 *
 * Prevents "Property 'TextDecoder' doesn't exist" errors from libraries like
 * @ai-sdk/provider-utils and utf8 parsers.
 */

/* eslint-disable no-bitwise */
if (typeof global.TextDecoder === 'undefined') {
  (global as any).TextDecoder = class TextDecoder {
    encoding: string;
    fatal: boolean;
    ignoreBOM: boolean;

    constructor(encoding = 'utf-8', options?: { fatal?: boolean; ignoreBOM?: boolean }) {
      this.encoding = encoding.toLowerCase();
      this.fatal = !!options?.fatal;
      this.ignoreBOM = !!options?.ignoreBOM;
    }

    decode(bytes?: ArrayBuffer | Uint8Array | null): string {
      if (!bytes) return '';
      const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      let out = '';
      let i = 0;
      const len = arr.length;
      while (i < len) {
        const c = arr[i++];
        if (c < 128) {
          out += String.fromCharCode(c);
        } else if (c > 191 && c < 224) {
          out += String.fromCharCode(((c & 31) << 6) | (arr[i++] & 63));
        } else if (c > 223 && c < 240) {
          out += String.fromCharCode(((c & 15) << 12) | ((arr[i++] & 63) << 6) | (arr[i++] & 63));
        } else if (c > 239 && c < 248) {
          const u =
            (((c & 7) << 18) | ((arr[i++] & 63) << 12) | ((arr[i++] & 63) << 6) | (arr[i++] & 63)) -
            0x10000;
          out += String.fromCharCode((u >> 10) + 0xd800, (u & 0x3ff) + 0xdc00);
        }
      }
      return out;
    }
  };
}

if (typeof global.TextEncoder === 'undefined') {
  (global as any).TextEncoder = class TextEncoder {
    encoding = 'utf-8';

    encode(str?: string): Uint8Array {
      if (!str) return new Uint8Array(0);
      const utf8: number[] = [];
      for (let i = 0; i < str.length; i++) {
        let charcode = str.charCodeAt(i);
        if (charcode < 0x80) {
          utf8.push(charcode);
        } else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
        } else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12), 0x80 | ((charcode >> 6) & 0x3f), 0x80 | (charcode & 0x3f));
        } else {
          i++;
          charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff));
          utf8.push(
            0xf0 | (charcode >> 18),
            0x80 | ((charcode >> 12) & 0x3f),
            0x80 | ((charcode >> 6) & 0x3f),
            0x80 | (charcode & 0x3f),
          );
        }
      }
      return new Uint8Array(utf8);
    }
  };
}
