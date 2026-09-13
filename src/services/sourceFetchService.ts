/**
 * Fetch a URL and extract plain text for Source Monitor tasks.
 */

import axios from 'axios';
import { DOCUMENT_MAX_INJECT_CHARS } from '../utils/documentHelpers';

export const SOURCE_FETCH_TIMEOUT_MS = 25_000;
export const SOURCE_FETCH_MAX_BYTES = 200 * 1024;
export const SOURCE_TEXT_MAX_CHARS = DOCUMENT_MAX_INJECT_CHARS;

export type SourceFetchResult = {
  text: string;
  contentType: string | null;
  truncated: boolean;
  byteLength: number;
};

/** Strip tags / scripts / styles; collapse whitespace. Pure helper. */
export function htmlToPlainText(html: string): string {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<\/(p|div|br|li|h[1-6]|tr|section|article)>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) ? String.fromCharCode(code) : ' ';
    });
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.replace(/[ \t]{2,}/g, ' ');
  return s.trim();
}

export function truncateSourceText(
  text: string,
  maxChars: number = SOURCE_TEXT_MAX_CHARS,
): { text: string; truncated: boolean } {
  const t = (text || '').trim();
  if (t.length <= maxChars) return { text: t, truncated: false };
  return {
    text: `${t.slice(0, maxChars)}\n\n[…truncated ${t.length - maxChars} characters to fit analysis limits]`,
    truncated: true,
  };
}

export function assertSafeSourceUrl(url: string): URL {
  const trimmed = (url || '').trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http(s) URLs are supported');
  }
  if (parsed.username || parsed.password) {
    throw new Error('URLs with credentials are not allowed');
  }
  return parsed;
}

/**
 * GET the URL and return plain text suitable for LLM analysis.
 */
export async function fetchSourceText(url: string): Promise<SourceFetchResult> {
  const parsed = assertSafeSourceUrl(url);

  const response = await axios.get<ArrayBuffer>(parsed.toString(), {
    timeout: SOURCE_FETCH_TIMEOUT_MS,
    responseType: 'arraybuffer',
    maxContentLength: SOURCE_FETCH_MAX_BYTES,
    maxBodyLength: SOURCE_FETCH_MAX_BYTES,
    headers: {
      Accept: 'text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': 'ofln-source-monitor/1.0',
    },
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const buf = response.data as ArrayBuffer;
  const byteLength = buf?.byteLength ?? 0;
  if (byteLength <= 0) {
    throw new Error('Empty response from source');
  }
  if (byteLength > SOURCE_FETCH_MAX_BYTES) {
    throw new Error(
      `Source is too large (${Math.round(byteLength / 1024)} KB). Limit is ${Math.round(SOURCE_FETCH_MAX_BYTES / 1024)} KB.`,
    );
  }

  const contentType =
    typeof response.headers?.['content-type'] === 'string'
      ? response.headers['content-type']
      : null;

  // Decode as UTF-8 (best-effort for latin1 pages)
  let raw = '';
  try {
    raw = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(buf));
  } catch {
    raw = String.fromCharCode(...Array.from(new Uint8Array(buf)));
  }

  const lowerType = (contentType || '').toLowerCase();
  let plain: string;
  if (
    lowerType.includes('html') ||
    /<\s*html[\s>]/i.test(raw) ||
    /<\s*body[\s>]/i.test(raw)
  ) {
    plain = htmlToPlainText(raw);
  } else if (lowerType.includes('json') || raw.trim().startsWith('{') || raw.trim().startsWith('[')) {
    try {
      plain = JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      plain = raw;
    }
  } else {
    plain = raw;
  }

  if (!plain.trim()) {
    throw new Error('No readable text extracted from source');
  }

  const { text, truncated } = truncateSourceText(plain);
  return { text, contentType, truncated, byteLength };
}
