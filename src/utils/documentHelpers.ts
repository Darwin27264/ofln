/**
 * Pure helpers for document/OCR hardening (S27).
 * No RNFS / ML Kit — unit-testable budget + honest refusal copy.
 */

import { CONTEXT_CHARS_PER_TOKEN } from './contextFullness';

/** Hard cap on OCR / PDF text injected into a chat turn. */
export const DOCUMENT_MAX_INJECT_CHARS = 8000;

/** Soft cap for reading a PDF into JS (bytes). Larger files are refused. */
export const DOCUMENT_MAX_PDF_BYTES = 4 * 1024 * 1024;

/** Below this extract length, treat a “text PDF” as non-extractable (often scanned). */
export const DOCUMENT_MIN_MEANINGFUL_CHARS = 32;

/** Share of usable context reserved for document/OCR text (rest = history + system + reply). */
export const DOCUMENT_CONTEXT_SHARE = 0.4;

export const DOCUMENT_MESSAGES = {
  tooLarge: (sizeMb: string, limitMb: string) =>
    `[PDF too large to parse on-device (${sizeMb} MB). Limit is ${limitMb} MB. Try a smaller text PDF or paste key excerpts.]`,
  scanned:
    '[PDF has no extractable text (likely scanned or image-only). Export pages as images and attach those, or paste the text.]',
  encrypted:
    '[PDF is encrypted or password-protected. Remove the password and try again, or paste the text.]',
  malformed:
    '[PDF could not be parsed. The file may be compressed in an unsupported way, corrupted, or not a valid PDF.]',
  unsupported: (name: string) =>
    `[Unsupported file type: ${name}. Attach a PDF or image, or paste text.]`,
  readFailed: '[Could not read this file on-device. Try another file or paste the text.]',
  truncatedNote: (dropped: number) =>
    `\n\n[…truncated ${dropped} characters to fit context limits]`,
} as const;

/**
 * How many characters of document/OCR text to inject given model context settings.
 * Aligns with contextTrim (~3.5 chars/token) and leaves room for system + reply + history.
 */
export function documentInjectCharBudget(
  n_ctx: number,
  n_predict: number,
  maxCap: number = DOCUMENT_MAX_INJECT_CHARS,
): number {
  const ctx = Number.isFinite(n_ctx) && n_ctx > 0 ? n_ctx : 2048;
  const predict = Number.isFinite(n_predict) && n_predict > 0 ? n_predict : 256;
  // Reserve tokens for generation + system/formatting overhead.
  const usableTokens = Math.max(128, ctx - predict - 256);
  const docTokens = Math.floor(usableTokens * DOCUMENT_CONTEXT_SHARE);
  const byContext = Math.floor(docTokens * CONTEXT_CHARS_PER_TOKEN);
  return Math.max(256, Math.min(maxCap, byContext));
}

/** Truncate document text using inject budget; appends a clear truncation mark. */
export function truncateDocumentForInject(
  text: string,
  maxChars: number,
): string {
  const trimmed = (text || '').trim();
  if (trimmed.length <= maxChars) return trimmed;
  const kept = trimmed.slice(0, Math.max(0, maxChars));
  return `${kept}${DOCUMENT_MESSAGES.truncatedNote(trimmed.length - kept.length)}`;
}

export type PdfSampleFlags = {
  isPdf: boolean;
  encrypted: boolean;
};

/** Inspect a small ASCII sample from a PDF (header or full modest file). */
export function inspectPdfSample(sample: string): PdfSampleFlags {
  const s = sample || '';
  return {
    isPdf: s.includes('%PDF'),
    encrypted: /\/Encrypt[\s/>]/.test(s) || /\/Encrypt\b/.test(s),
  };
}

/** True when extracted PDF text is empty / noise — honest “scanned” refusal. */
export function isInsufficientPdfExtract(text: string): boolean {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  return t.length < DOCUMENT_MIN_MEANINGFUL_CHARS;
}

/** True when inject/OCR body is an app limitation notice (not source document text). */
export function isDocumentLimitationMessage(text: string): boolean {
  const t = (text || '').trim();
  if (!t.startsWith('[')) return false;
  return (
    /PDF too large/i.test(t) ||
    /no extractable text/i.test(t) ||
    /encrypted or password/i.test(t) ||
    /could not be parsed/i.test(t) ||
    /Could not read this file/i.test(t) ||
    /Unsupported file type/i.test(t) ||
    /scanned/i.test(t)
  );
}

export type AttachmentPromptKind = 'image' | 'pdf';

/**
 * Build the nativeCompletion `textForPrompt` body for an image OCR or PDF extract turn.
 * Keeps display text separate; model sees labeled document + user sections.
 */
export function buildAttachmentTextForPrompt(
  kind: AttachmentPromptKind,
  extractedText: string,
  userText: string,
): string {
  const user = (userText || '').trim() || '(No additional text)';
  if (kind === 'pdf') {
    const body = (extractedText || '').trim() || DOCUMENT_MESSAGES.readFailed;
    return `[Document]\n${body}\n\n[User]\n${user}`;
  }
  const body = (extractedText || '').trim() || '(No text detected.)';
  return `[Attached Image OCR]\n${body}\n\n[User]\n${user}`;
}

/**
 * Safe display / copy name for a chat PDF. Strips path segments, odd control
 * chars, and forces a `.pdf` suffix so detectFileType does not miss it.
 */
export function sanitizeChatDocumentFileName(name?: string | null): string {
  let base = (name || 'document.pdf').trim();
  base = base.replace(/^.*[/\\]/, '');
  base = base.replace(/[\u0000-\u001f\u007f]/g, '');
  base = base.replace(/[^\w.\-()+ ]+/g, '_').trim();
  if (!base || /^\.+$/.test(base)) {
    base = 'document';
  }
  // Collapse "name.pdf.pdf" only if the true extension is already .pdf once.
  if (!base.toLowerCase().endsWith('.pdf')) {
    base = `${base.replace(/\.+$/, '')}.pdf`;
  }
  if (base.length > 120) {
    const stem = base.slice(0, 116).replace(/\.pdf$/i, '');
    base = `${stem || 'document'}.pdf`;
  }
  return base;
}

/** True when picker metadata suggests a PDF (name and/or MIME). */
export function isLikelyPdfMeta(
  fileName?: string | null,
  mimeType?: string | null,
): boolean {
  const name = (fileName || '').toLowerCase();
  const mime = (mimeType || '').toLowerCase();
  if (name.endsWith('.pdf')) return true;
  return (
    mime === 'application/pdf' ||
    mime === 'application/x-pdf' ||
    mime.endsWith('/pdf')
  );
}
