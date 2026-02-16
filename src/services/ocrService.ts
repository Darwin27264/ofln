/**
 * On-device OCR via ML Kit Text Recognition.
 * No network calls; all processing is local.
 */
import { Platform } from "react-native";
import TextRecognition from "@react-native-ml-kit/text-recognition";

/**
 * Normalize image URI for the current platform.
 * ML Kit expects a file path or file:// URI on both platforms.
 */
function normalizeImageUri(uri: string): string {
  const trimmed = (uri || "").trim();
  if (!trimmed) return trimmed;
  // Android may return content:// or file://; iOS often returns file://
  // ML Kit recognize() accepts file path or file:// URI
  if (Platform.OS === "android" && trimmed.startsWith("content://")) {
    return trimmed;
  }
  if (!trimmed.startsWith("file://") && !trimmed.startsWith("/")) {
    return trimmed.startsWith("file:") ? trimmed : `file://${trimmed}`;
  }
  return trimmed;
}

/**
 * Collapse excessive blank lines (3+ newlines) to at most 2, preserve meaningful line breaks.
 */
function collapseBlankLines(text: string): string {
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Extract text from an image using on-device ML Kit OCR.
 * @param uri - Local file URI or path (e.g. from image picker)
 * @returns Extracted text, or empty string on failure (caller should show error UX)
 */
export async function extractTextFromImage(uri: string): Promise<string> {
  const normalizedUri = normalizeImageUri(uri);
  if (!normalizedUri) {
    if (__DEV__) console.warn("[ocrService] Empty or invalid image URI");
    return "";
  }

  try {
    const result = await TextRecognition.recognize(normalizedUri);
    const raw = (result?.text ?? "").trim();
    const text = collapseBlankLines(raw);
    if (__DEV__ && raw) {
      console.log("[ocrService] Extracted length:", text.length);
    }
    return text;
  } catch (error) {
    if (__DEV__) {
      console.warn("[ocrService] OCR failed:", error);
    }
    return "";
  }
}
