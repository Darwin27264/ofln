/**
 * On-device OCR via ML Kit Text Recognition (fully offline).
 *
 * Always runs URIs through mediaNormalizeService first so Android
 * content:// picks become real files — ML Kit is unreliable otherwise.
 */
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  normalizeMediaToFile,
  cleanupNormalizedMedia,
  truncateForPrompt,
  toFileUri,
  MAX_OCR_CHARS,
  type NormalizedMedia,
} from './mediaNormalizeService';
import { withOcrRamHeadroom } from './ocrRamGuard';

/** Collapse 3+ newlines to at most two. */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extract text from an image using on-device ML Kit OCR.
 * @param maxChars Char budget for inject (defaults to MAX_OCR_CHARS).
 * @returns Length-capped text, or "" on failure (caller handles UX)
 */
export async function extractTextFromImage(
  uri: string,
  maxChars: number = MAX_OCR_CHARS,
): Promise<string> {
  const trimmed = (uri || '').trim();
  if (!trimmed) {
    console.warn('[ocrService] Empty or invalid image URI');
    return '';
  }

  const { result, unloadedModel } = await withOcrRamHeadroom(async () => {
    let media: NormalizedMedia | null = null;
    try {
      media = await normalizeMediaToFile(trimmed);
      const ocr = await TextRecognition.recognize(toFileUri(media.path));
      const raw = (ocr?.text ?? '').trim();
      const text = truncateForPrompt(collapseBlankLines(raw), maxChars);
      console.log('[ocrService] Extracted length:', text.length, '(raw:', raw.length, ')');
      return text;
    } catch (error) {
      console.warn('[ocrService] OCR failed:', error);
      return '';
    } finally {
      await cleanupNormalizedMedia(media);
    }
  });
  if (unloadedModel) {
    console.log('[ocrService] LLM was unloaded for OCR peak-RAM headroom');
  }
  return result;
}
