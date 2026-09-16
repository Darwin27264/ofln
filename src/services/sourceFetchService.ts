/**
 * Fetch a URL and extract plain text for Source Monitor tasks.
 *
 * Employs modern browser emulation headers, charset auto-detection,
 * structured metadata extraction (OpenGraph/JSON-LD), boilerplate removal,
 * and RSS/Atom feed parsing.
 */

import axios, { AxiosError } from 'axios';
import { DOCUMENT_MAX_INJECT_CHARS } from '../utils/documentHelpers';
import {
  extractWebContent,
  htmlToStructuredText,
  smartTruncateText,
  WebExtractionResult,
} from './webContentExtractor';

export const SOURCE_FETCH_TIMEOUT_MS = 25_000;
export const SOURCE_FETCH_MAX_BYTES = 200 * 1024;
export const SOURCE_TEXT_MAX_CHARS = DOCUMENT_MAX_INJECT_CHARS;

export const DEFAULT_BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Mobile; rv:128.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

export type SourceFetchResult = {
  text: string;
  contentType: string | null;
  truncated: boolean;
  byteLength: number;
  title?: string;
  description?: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  isFeed?: boolean;
};

/**
 * Strip tags / scripts / styles; format semantic structure and decode entities.
 */
export function htmlToPlainText(html: string): string {
  return htmlToStructuredText(html);
}

/**
 * Smartly truncate source text at sentence or paragraph boundaries.
 */
export function truncateSourceText(
  text: string,
  maxChars: number = SOURCE_TEXT_MAX_CHARS,
): { text: string; truncated: boolean } {
  return smartTruncateText(text, maxChars);
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
 * Detect text encoding/charset from Content-Type header or meta tags.
 */
export function detectCharset(contentTypeHeader: string | null, rawBytes: Uint8Array): string {
  if (contentTypeHeader) {
    const m = contentTypeHeader.match(/charset\s*=\s*["']?([a-zA-Z0-9_-]+)/i);
    if (m && m[1]) return m[1].trim().toLowerCase();
  }

  // Scan initial bytes for <meta charset="...">
  const preview = String.fromCharCode(...Array.from(rawBytes.slice(0, 1024)));
  const metaMatch = preview.match(/<meta[^>]+charset=["']?([a-zA-Z0-9_-]+)/i);
  if (metaMatch && metaMatch[1]) return metaMatch[1].trim().toLowerCase();

  return 'utf-8';
}

/**
 * Decode byte buffer into a string using the detected charset.
 */
export function decodeBuffer(buf: ArrayBuffer, charset: string = 'utf-8'): string {
  const bytes = new Uint8Array(buf);
  try {
    return new TextDecoder(charset, { fatal: false }).decode(bytes);
  } catch {
    // If charset is unsupported by TextDecoder, fallback to utf-8
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return String.fromCharCode(...Array.from(bytes));
    }
  }
}

/**
 * Build a formatted LLM document with a clean metadata header.
 */
export function buildFormattedSourceDocument(
  sourceUrl: string,
  extracted: WebExtractionResult,
): string {
  const { text, metadata, isFeed } = extracted;
  if (isFeed) {
    return text;
  }

  const headerLines: string[] = [];
  if (metadata.title) headerLines.push(`Title: ${metadata.title}`);
  headerLines.push(`Source: ${sourceUrl}`);
  if (metadata.siteName && metadata.siteName !== metadata.title) {
    headerLines.push(`Site: ${metadata.siteName}`);
  }
  if (metadata.author) headerLines.push(`Author: ${metadata.author}`);
  if (metadata.publishedTime) headerLines.push(`Date: ${metadata.publishedTime}`);
  if (metadata.description && !text.includes(metadata.description)) {
    headerLines.push(`Summary: ${metadata.description}`);
  }

  if (headerLines.length > 1) {
    return `${headerLines.join('\n')}\n\n---\n\n${text}`.trim();
  }
  return text.trim();
}

/**
 * GET the URL and return clean, structured plain text suitable for LLM analysis.
 */
export async function fetchSourceText(url: string): Promise<SourceFetchResult> {
  const parsed = assertSafeSourceUrl(url);

  let response;
  try {
    response = await axios.get<ArrayBuffer>(parsed.toString(), {
      timeout: SOURCE_FETCH_TIMEOUT_MS,
      responseType: 'arraybuffer',
      maxContentLength: SOURCE_FETCH_MAX_BYTES,
      maxBodyLength: SOURCE_FETCH_MAX_BYTES,
      maxRedirects: 5,
      headers: {
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,text/plain,application/json;q=0.8,*/*;q=0.7',
        'Accept-Language': 'en-US,en;q=0.9',
        'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
        'Sec-Ch-Ua-Mobile': '?1',
        'Sec-Ch-Ua-Platform': '"Android"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Upgrade-Insecure-Requests': '1',
        'User-Agent': DEFAULT_BROWSER_USER_AGENT,
      },
      validateStatus: (s) => s >= 200 && s < 400,
    });
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 403) {
        throw new Error(
          'Access denied by website (HTTP 403 Forbidden). The site may block automated requests or require browser verification.',
        );
      }
      if (axiosErr.response?.status === 429) {
        throw new Error(
          'Rate limit exceeded (HTTP 429). The website is temporarily throttling requests.',
        );
      }
      if (axiosErr.code === 'ECONNABORTED' || axiosErr.message?.toLowerCase().includes('timeout')) {
        throw new Error(
          `Request timed out after ${Math.round(SOURCE_FETCH_TIMEOUT_MS / 1000)} seconds.`,
        );
      }
      if (axiosErr.code === 'ENOTFOUND' || axiosErr.code === 'ECONNREFUSED') {
        throw new Error(`Unable to connect to source server: ${parsed.hostname}`);
      }
      if (axiosErr.response?.status) {
        throw new Error(`HTTP error ${axiosErr.response.status} from ${parsed.hostname}`);
      }
    }
    throw err;
  }

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

  const rawBytes = new Uint8Array(buf);
  const charset = detectCharset(contentType, rawBytes);
  const raw = decodeBuffer(buf, charset);

  const extracted = extractWebContent(raw, contentType);
  const formattedText = buildFormattedSourceDocument(parsed.toString(), extracted);

  if (!formattedText.trim()) {
    throw new Error('No readable text extracted from source');
  }

  const { text, truncated } = truncateSourceText(formattedText);

  return {
    text,
    contentType,
    truncated,
    byteLength,
    title: extracted.metadata.title,
    description: extracted.metadata.description,
    author: extracted.metadata.author,
    publishedTime: extracted.metadata.publishedTime,
    siteName: extracted.metadata.siteName,
    isFeed: extracted.isFeed,
  };
}
