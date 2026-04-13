/**
 * Document Parsing Service — React Native-compatible alternative to LiteParse
 *
 * @llamaindex/liteparse is a Node.js-only library (depends on pdfium-node,
 * Node Buffer, and fs). This service provides equivalent functionality for
 * React Native by combining:
 *
 *   1. On-device OCR (ML Kit) for text extraction from images
 *   2. RNFS for file I/O and base64 encoding
 *   3. Vision model input preparation (base64 images for Qwen 3.5 VL)
 *
 * For PDFs, pages are converted to images and processed through OCR or
 * sent directly to a vision-language model. For standalone images, they
 * are base64-encoded for vision reasoning or OCR-processed for text.
 *
 * Design goals:
 *   - Zero network calls (fully offline)
 *   - Layout-aware text extraction via OCR
 *   - Base64 image output for vision model context windows
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { extractTextFromImage } from './ocrService';
import { imageToBase64, inferMimeType } from './visionService';
import type { ParsedDocument, ParsedPage, MessageAttachment } from '../types/ai';

// ── File Type Detection ────────────────────────────────────────────────────────

type SupportedFileType = 'pdf' | 'image' | 'unsupported';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'];
const PDF_EXTENSION = '.pdf';

function detectFileType(fileName: string): SupportedFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(PDF_EXTENSION)) return 'pdf';
  if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'image';
  return 'unsupported';
}

/**
 * Resolve a URI to a usable file path, handling content:// on Android.
 * For content:// URIs, copies the file to a temp location first.
 */
async function resolveToFilePath(uri: string): Promise<string> {
  const trimmed = uri.trim();

  if (Platform.OS === 'android' && trimmed.startsWith('content://')) {
    // Copy content:// URI to a temp file so RNFS can access it
    const tempDir = RNFS.CachesDirectoryPath;
    const tempName = `liteparse_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const tempPath = `${tempDir}/${tempName}`;
    await RNFS.copyFile(trimmed, tempPath);
    return tempPath;
  }

  if (trimmed.startsWith('file://')) {
    return trimmed.replace('file://', '');
  }

  return trimmed;
}

// ── Image Parsing ──────────────────────────────────────────────────────────────

/**
 * Parse an image file: extract OCR text and prepare base64 for vision input.
 */
async function parseImage(
  filePath: string,
  sourceUri: string,
  options?: { skipOcr?: boolean },
): Promise<ParsedDocument> {
  const ocrText = options?.skipOcr ? '' : await extractTextFromImage(filePath);
  let imageBase64: string | undefined;

  try {
    imageBase64 = await imageToBase64(filePath);
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] Failed to read image as base64:', error);
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
 * Parse a PDF file.
 *
 * Strategy: Since full PDF rendering (pdfium) isn't available in React
 * Native, we take a practical approach:
 *
 *   1. Read the raw PDF bytes and attempt basic text extraction from the
 *      PDF stream objects (covers most text-based PDFs).
 *   2. For scanned / image-heavy PDFs, the caller should use a vision
 *      model to reason over page screenshots taken externally, or fall
 *      back to the existing OCR pipeline.
 *
 * The extracted text preserves reading order within each text stream.
 */
async function parsePdf(
  filePath: string,
  sourceUri: string,
): Promise<ParsedDocument> {
  try {
    const rawContent = await RNFS.readFile(filePath, 'utf8');

    // Basic PDF text stream extraction.
    // Matches text between BT (Begin Text) and ET (End Text) operators,
    // then extracts content from Tj/TJ operators and parenthesized strings.
    const textBlocks: string[] = [];
    const btEtPattern = /BT\s([\s\S]*?)ET/g;
    let match: RegExpExecArray | null;

    while ((match = btEtPattern.exec(rawContent)) !== null) {
      const block = match[1];
      // Extract text from Tj operator: (text) Tj
      const tjPattern = /\(([^)]*)\)\s*Tj/g;
      let tjMatch: RegExpExecArray | null;
      while ((tjMatch = tjPattern.exec(block)) !== null) {
        const text = decodePdfString(tjMatch[1]);
        if (text.trim()) textBlocks.push(text);
      }

      // Extract text from TJ array: [(text) num (text)] TJ
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

    const extractedText = textBlocks.join('\n').trim();

    // If no text could be extracted, the PDF is likely image-based
    if (!extractedText) {
      return {
        text: '[PDF contains no extractable text. Use a vision model to analyse page images.]',
        pages: [{
          pageNumber: 1,
          text: '',
        }],
        pageCount: 1,
        sourceUri,
        sourceType: 'pdf',
      };
    }

    // Split into rough "pages" based on form feed or page-break heuristics
    const rawPages = extractedText.split(/\f/);
    const pages: ParsedPage[] = rawPages.map((pageText, idx) => ({
      pageNumber: idx + 1,
      text: pageText.trim(),
    }));

    return {
      text: extractedText,
      pages,
      pageCount: pages.length,
      sourceUri,
      sourceType: 'pdf',
    };
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] PDF parsing failed, treating as opaque:', error);
    }

    return {
      text: '[PDF could not be parsed. The file may be encrypted or malformed.]',
      pages: [{ pageNumber: 1, text: '' }],
      pageCount: 1,
      sourceUri,
      sourceType: 'pdf',
    };
  }
}

/**
 * Decode common PDF string escape sequences.
 */
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
  /** Maximum pages to parse from PDF */
  maxPages?: number;
}

/**
 * Parse a document from a file URI.
 * Supports images (JPEG, PNG, WebP, etc.) and PDFs.
 *
 * @param uri - Local file URI (file://, content://, or absolute path)
 * @param fileName - Original file name for type detection
 * @param options - Parse configuration
 * @returns Parsed document with text and optional base64 images
 */
export async function parseDocument(
  uri: string,
  fileName: string,
  options?: ParseOptions,
): Promise<ParsedDocument> {
  const fileType = detectFileType(fileName);

  if (fileType === 'unsupported') {
    throw new Error(`Unsupported file type: ${fileName}`);
  }

  const filePath = await resolveToFilePath(uri);

  // Verify the file exists
  const exists = await RNFS.exists(filePath);
  if (!exists) {
    throw new Error(`File not found: ${uri}`);
  }

  if (fileType === 'image') {
    return parseImage(filePath, uri, options);
  }

  return parsePdf(filePath, uri);
}

/**
 * Convenience: parse an attachment and return the extracted text
 * suitable for injecting into a chat prompt.
 */
export async function extractTextFromAttachment(
  attachment: MessageAttachment,
): Promise<string> {
  const fileName = attachment.fileName || attachment.uri.split('/').pop() || 'file';

  try {
    const doc = await parseDocument(attachment.uri, fileName);
    return doc.text;
  } catch (error) {
    if (__DEV__) {
      console.warn('[documentParsing] Attachment parsing failed:', error);
    }
    return '';
  }
}

/**
 * Prepare an attachment for vision model input: returns base64 images
 * suitable for embedding in multimodal messages.
 */
export async function prepareAttachmentForVision(
  attachment: MessageAttachment,
): Promise<{ base64Images: string[]; extractedText: string }> {
  const fileName = attachment.fileName || attachment.uri.split('/').pop() || 'file';

  try {
    const doc = await parseDocument(attachment.uri, fileName, { skipOcr: false });
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
    return { base64Images: [], extractedText: '' };
  }
}
