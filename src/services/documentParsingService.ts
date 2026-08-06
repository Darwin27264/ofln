/**
 * Document Parsing Service — React Native-compatible document/image text extraction
 *
 *   1. On-device OCR (ML Kit) for images
 *   2. RNFS for file I/O
 *   3. Bounded, best-effort PDF text-stream scraping (no pdfium)
 *
 * Large / scanned / encrypted PDFs are refused with a clear message rather than
 * loading multi-MB binaries into a JS string (OOM risk on mid-range phones).
 */

import RNFS from 'react-native-fs';
import { extractTextFromImage } from './ocrService';
import { imageToBase64 } from './visionService';
import {
  normalizeMediaToFile,
  cleanupNormalizedMedia,
  truncateForPrompt,
  MAX_OCR_CHARS,
  MAX_PDF_PARSE_BYTES,
  type NormalizedMedia,
} from './mediaNormalizeService';
import {
  DOCUMENT_MESSAGES,
  documentInjectCharBudget,
  inspectPdfSample,
  isInsufficientPdfExtract,
  sanitizeChatDocumentFileName,
} from '../utils/documentHelpers';
import type { ParsedDocument, ParsedPage, MessageAttachment } from '../types/ai';

// ── File Type Detection ────────────────────────────────────────────────────────

type SupportedFileType = 'pdf' | 'image' | 'unsupported';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];
const PDF_EXTENSION = '.pdf';
const PDF_HEADER_SAMPLE_BYTES = 64 * 1024;

function detectFileType(fileName: string): SupportedFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(PDF_EXTENSION)) return 'pdf';
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  return 'unsupported';
}

function pdfRefusalDoc(
  sourceUri: string,
  message: string,
): ParsedDocument {
  return {
    text: message,
    pages: [{ pageNumber: 1, text: '' }],
    pageCount: 1,
    sourceUri,
    sourceType: 'pdf',
  };
}

// ── Image Parsing ────────────────────────────────────────────────────────────────

/**
 * Parse an image file: extract OCR text and optionally prepare base64 for vision.
 * Prefer skipBase64 on memory-constrained paths (native chat uses OCR text only).
 */
async function parseImage(
  filePath: string,
  sourceUri: string,
  options?: { skipOcr?: boolean; skipBase64?: boolean; maxChars?: number },
): Promise<ParsedDocument> {
  const cap = options?.maxChars ?? MAX_OCR_CHARS;
  const ocrText = options?.skipOcr ? '' : await extractTextFromImage(filePath, cap);
  let imageBase64: string | undefined;

  if (!options?.skipBase64) {
    try {
      imageBase64 = await imageToBase64(filePath);
    } catch (error) {
      if (__DEV__) {
        console.warn('[documentParsing] Failed to read image as base64:', error);
      }
    }
  }

  const page: ParsedPage = {
    pageNumber: 1,
    text: ocrText,
    imageBase64,
  };

  return {
    text: ocrText,
    pages: [page],
    pageCount: 1,
    sourceUri,
    sourceType: 'image',
  };
}

// ── PDF Parsing ────────────────────────────────────────────────────────────────

/**
 * Best-effort PDF text extraction from uncompressed text operators.
 * Refuses oversized / encrypted / scanned files with honest messages.
 */
async function parsePdf(
  filePath: string,
  sourceUri: string,
  options?: { maxPages?: number; maxChars?: number },
): Promise<ParsedDocument> {
  const maxChars = options?.maxChars ?? MAX_OCR_CHARS;
  const maxPages = options?.maxPages;

  try {
    const stat = await RNFS.stat(filePath);
    const size = typeof stat.size === 'number' ? Number(stat.size) : 0;
    if (size > MAX_PDF_PARSE_BYTES) {
      return pdfRefusalDoc(
        sourceUri,
        DOCUMENT_MESSAGES.tooLarge(
          (size / (1024 * 1024)).toFixed(1),
          String(MAX_PDF_PARSE_BYTES / (1024 * 1024)),
        ),
      );
    }

    // Header sample first — catch encrypted / non-PDF without loading the whole file.
    const sampleLen = Math.min(size > 0 ? size : PDF_HEADER_SAMPLE_BYTES, PDF_HEADER_SAMPLE_BYTES);
    let sample = '';
    try {
      sample = await RNFS.read(filePath, sampleLen, 0, 'utf8');
    } catch {
      // Fall through to full read path or refuse
    }

    if (sample) {
      const flags = inspectPdfSample(sample);
      if (!flags.isPdf) {
        return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.malformed);
      }
      if (flags.encrypted) {
        return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.encrypted);
      }
    }

    // Only attempt stream scrape on modest files — still loads into JS string.
    const rawContent =
      size > 0 && size <= sampleLen && sample
        ? sample
        : await RNFS.readFile(filePath, 'utf8');

    const fullFlags = inspectPdfSample(rawContent);
    if (!fullFlags.isPdf) {
      return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.malformed);
    }
    if (fullFlags.encrypted) {
      return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.encrypted);
    }

    const textBlocks: string[] = [];
    const btEtPattern = /BT\s([\s\S]*?)ET/g;
    let match: RegExpExecArray | null;

    while ((match = btEtPattern.exec(rawContent)) !== null) {
      const block = match[1];
      const tjPattern = /\(([^)]*)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjPattern.exec(block)) !== null) {
        const text = decodePdfString(tjMatch[1]);
        if (text.trim()) textBlocks.push(text);
      }

      const tjArrayPattern = /\[((?:[^[\]]*|\[[^\]]*\])*)\]\s*TJ/g;
      let tjArrayMatch: RegExpExecArray | null;
      while ((tjArrayMatch = tjArrayPattern.exec(block)) !== null) {
        const array = tjArrayMatch[1];
        const stringPattern = /\(([^)]*)\)/g;
        let strMatch: RegExpExecArray | null;
        const parts: string[] = [];
        while ((strMatch = stringPattern.exec(array)) !== null) {
          parts.push(decodePdfString(strMatch[1]));
        }
        const line = parts.join('');
        if (line.trim()) textBlocks.push(line);
      }
    }

    const joined = textBlocks.join('\n').trim();
    if (isInsufficientPdfExtract(joined)) {
      return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.scanned);
    }

    const extractedText = truncateForPrompt(joined, maxChars);

    let pages: ParsedPage[] = extractedText.split(/\f/).map((pageText, idx) => ({
      pageNumber: idx + 1,
      text: pageText.trim(),
    }));

    if (maxPages && maxPages > 0 && pages.length > maxPages) {
      pages = pages.slice(0, maxPages);
    }

    return {
      text: pages.map((p) => p.text).filter(Boolean).join('\n\n'),
      pages,
      pageCount: pages.length,
      sourceUri,
      sourceType: 'pdf',
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] PDF parsing failed:', error);
    }
    return pdfRefusalDoc(sourceUri, DOCUMENT_MESSAGES.malformed);
  }
}

function decodePdfString(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface ParseOptions {
  /** Skip OCR even for images (useful when only base64 is needed for vision) */
  skipOcr?: boolean;
  /** Skip base64 encoding (default for OCR-only chat path) */
  skipBase64?: boolean;
  /** Maximum pages to keep from PDF text split */
  maxPages?: number;
  /**
   * Char budget for injected document/OCR text (S27).
   * Prefer `documentInjectCharBudget(n_ctx, n_predict)` from the active model.
   */
  maxChars?: number;
  /** Model context size — used when maxChars is omitted */
  n_ctx?: number;
  /** Model max predict — used when maxChars is omitted */
  n_predict?: number;
}

function resolveMaxChars(options?: ParseOptions): number {
  if (typeof options?.maxChars === 'number' && options.maxChars > 0) {
    return options.maxChars;
  }
  if (
    typeof options?.n_ctx === 'number' &&
    typeof options?.n_predict === 'number'
  ) {
    return documentInjectCharBudget(options.n_ctx, options.n_predict);
  }
  return MAX_OCR_CHARS;
}

/**
 * Parse a document from a file URI.
 * Supports images (JPEG, PNG, WebP, etc.) and modest text PDFs.
 */
export async function parseDocument(
  uri: string,
  fileName: string,
  options?: ParseOptions,
): Promise<ParsedDocument> {
  const fileType = detectFileType(fileName);

  if (fileType === 'unsupported') {
    throw new Error(DOCUMENT_MESSAGES.unsupported(fileName));
  }

  const maxChars = resolveMaxChars(options);
  let media: NormalizedMedia | null = null;
  try {
    media = await normalizeMediaToFile(uri, {
      preferredExt: fileType === 'pdf' ? 'pdf' : undefined,
    });
    const exists = await RNFS.exists(media.path);
    if (!exists) {
      throw new Error(`File not found: ${uri}`);
    }

    if (fileType === 'image') {
      return await parseImage(media.path, uri, {
        skipOcr: options?.skipOcr,
        skipBase64: options?.skipBase64 ?? true,
        maxChars,
      });
    }

    return await parsePdf(media.path, uri, {
      maxPages: options?.maxPages ?? 20,
      maxChars,
    });
  } finally {
    // Always remove content:// copies; UI still holds the original URI for thumbs.
    await cleanupNormalizedMedia(media);
  }
}

/**
 * Convenience: parse an attachment and return text for chat prompt injection.
 * Always returns a string — limitation notices are plain text the model can relay.
 */
export async function extractTextFromAttachment(
  attachment: MessageAttachment,
  options?: ParseOptions,
): Promise<string> {
  const rawName =
    attachment.fileName ||
    attachment.uri.split(/[/\\]/).pop() ||
    (attachment.type === 'pdf' ? 'document.pdf' : 'file');
  // Force a detectable .pdf when the product path marked the attachment as PDF
  // (Android pickers often omit extensions while still reporting PDF MIME).
  const fileName =
    attachment.type === 'pdf'
      ? sanitizeChatDocumentFileName(rawName)
      : rawName;

  try {
    const doc = await parseDocument(attachment.uri, fileName, {
      skipBase64: true,
      maxPages: 20,
      maxChars: resolveMaxChars(options),
      n_ctx: options?.n_ctx,
      n_predict: options?.n_predict,
    });
    return doc.text || DOCUMENT_MESSAGES.readFailed;
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] Attachment parsing failed:', error);
    }
    if (error instanceof Error && error.message.startsWith('[')) {
      return error.message;
    }
    return DOCUMENT_MESSAGES.readFailed;
  }
}

/**
 * Prepare an attachment for vision model input: returns base64 images
 * suitable for embedding in multimodal messages.
 */
export async function prepareAttachmentForVision(
  attachment: MessageAttachment,
  options?: ParseOptions,
): Promise<{ base64Images: string[]; extractedText: string }> {
  const fileName = attachment.fileName || attachment.uri.split('/').pop() || 'file';

  try {
    const doc = await parseDocument(attachment.uri, fileName, {
      skipOcr: false,
      skipBase64: false,
      maxChars: resolveMaxChars(options),
      n_ctx: options?.n_ctx,
      n_predict: options?.n_predict,
    });
    const base64Images = doc.pages
      .map((p) => p.imageBase64)
      .filter((b): b is string => !!b);

    return {
      base64Images,
      extractedText: doc.text,
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] Vision prep failed:', error);
    }
    return { base64Images: [], extractedText: DOCUMENT_MESSAGES.readFailed };
  }
}
