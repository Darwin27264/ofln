/**
 * Vision Service — Qwen 3.5 multimodal message formatting
 *
 * Qwen 3.5 VL (Vision-Language) uses a native multimodal architecture
 * with dedicated vision tokens:
 *   <|vision_start|> <|image_pad|>... <|vision_end|>
 *
 * When using llama.rn / @react-native-ai/llama, images are embedded
 * in the message content array as `{ type: 'image', image: base64 }`
 * parts. The underlying llama.cpp handles the token injection.
 *
 * This service provides helpers to:
 * 1. Convert local image URIs to base64 data
 * 2. Format multimodal messages for the Vercel AI SDK
 * 3. Detect whether a model supports native vision
 */

import RNFS from 'react-native-fs';
import type {
  ChatMessage,
  MessageAttachment,
  ContentPart,
  TextPart,
  ImagePart,
  AIMessage,
  FormattedVisionMessage,
} from '../types/ai';
import {
  normalizeMediaToFile,
  cleanupNormalizedMedia,
} from './mediaNormalizeService';

// ── Model Detection ────────────────────────────────────────────────────────────

/**
 * Patterns for models whose message format accepts images via a Qwen-VL
 * -compatible schema (`{ type: 'image', image: base64 }` content parts).
 *
 * Excluded on purpose (as of llama.rn 0.12.x):
 *   • Gemma 3 / Gemma 3n / Gemma 4 — capable of vision but require a
 *     separate mmproj projector file which the app's downloader does not
 *     yet fetch. Attempting to send images through Qwen's content-part
 *     schema would corrupt the chat template. These models fall back
 *     cleanly to OCR / document-text extraction via
 *     `documentParsingService.extractTextFromAttachment`.
 *   • Llama 3.2 Vision — uses Meta's own vision format.
 *
 * Add a new entry ONLY after verifying the model's chat template accepts
 * the exact content-parts schema emitted by `formatMessagesForVision`.
 */
const VISION_MODEL_PATTERNS = [
  /qwen3[\.\-]?5?\s*vl/i,
  /qwen3[\.\-]?vl/i,
  /qwen2[\.\-]?5?\s*vl/i,
  /llava/i,
  /minicpm[\-]?v/i,
  /internvl/i,
  /phi[\-]?3[\.\-]?5?\s*vision/i,
];

/**
 * Check whether a model name suggests native vision-language support
 * compatible with this app's multimodal pipeline. When true, images can
 * be embedded directly in the message payload rather than being OCR'd.
 */
export function isVisionModel(modelName: string): boolean {
  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(modelName));
}

/**
 * Detect if the model is a Qwen 3.5 variant (for thinking/reasoning
 * parameter compatibility as well as vision formatting).
 */
export function isQwen35Model(modelName: string): boolean {
  const n = modelName.toLowerCase();
  return /qwen3[.\-]?5/.test(n) || /qwen3\.5/.test(n);
}

// ── Image Processing ───────────────────────────────────────────────────────────

/**
 * Read a local image file and return its base64 representation.
 * Handles file://, content:// (Android), and bare paths via mediaNormalizeService.
 */
export async function imageToBase64(uri: string): Promise<string> {
  const media = await normalizeMediaToFile(uri);
  try {
    return await RNFS.readFile(media.path, 'base64');
  } finally {
    await cleanupNormalizedMedia(media);
  }
}

/**
 * Infer MIME type from file extension.
 */
export function inferMimeType(uriOrName: string): string {
  const lower = uriOrName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

/**
 * Build a base64 data URI from raw base64 + mime type.
 */
export function toDataUri(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

// ── Message Formatting ─────────────────────────────────────────────────────────

/**
 * Convert an array of app-level ChatMessages into the AI SDK message
 * format, embedding images as content parts where attachments exist.
 *
 * For text-only messages, the content stays as a plain string.
 * For messages with image attachments AND a vision model, the content
 * becomes an array of TextPart + ImagePart.
 */
export async function formatMessagesForVision(
  messages: ChatMessage[],
  modelName: string,
): Promise<AIMessage[]> {
  const supportsVision = isVisionModel(modelName);
  const formatted: AIMessage[] = [];

  for (const msg of messages) {
    const imageAttachments = (msg.attachments || []).filter(
      (a) => a.type === 'image',
    );

    if (imageAttachments.length > 0 && supportsVision && msg.role === 'user') {
      const parts: ContentPart[] = [];

      // Add text part first (if any)
      if (msg.content && msg.content.trim()) {
        parts.push({ type: 'text', text: msg.content });
      }

      // Add image parts
      for (const attachment of imageAttachments) {
        try {
          const base64 = await imageToBase64(attachment.uri);
          const mimeType = attachment.mimeType || inferMimeType(attachment.uri);
          parts.push({
            type: 'image',
            image: toDataUri(base64, mimeType),
            mimeType,
          });
        } catch (error) {
          if (__DEV__) {
            console.warn('[visionService] Failed to read image:', attachment.uri, error);
          }
          // Fall back to a text note about the failed image
          parts.push({
            type: 'text',
            text: `[Image could not be loaded: ${attachment.fileName || attachment.uri}]`,
          });
        }
      }

      // If we only have text (all images failed), flatten to string
      if (parts.length === 1 && parts[0].type === 'text') {
        formatted.push({ role: msg.role, content: (parts[0] as TextPart).text });
      } else {
        formatted.push({ role: msg.role, content: parts });
      }
    } else {
      // Plain text message (or non-vision model, or non-user role)
      formatted.push({ role: msg.role, content: msg.content });
    }
  }

  return formatted;
}

/**
 * Create a single user message with image(s) for vision reasoning.
 * Useful for document page analysis where each page image is sent
 * alongside a prompt.
 */
export async function createVisionMessage(
  prompt: string,
  imageUris: string[],
): Promise<FormattedVisionMessage> {
  const parts: ContentPart[] = [];

  if (prompt) {
    parts.push({ type: 'text', text: prompt });
  }

  for (const uri of imageUris) {
    try {
      const base64 = await imageToBase64(uri);
      const mimeType = inferMimeType(uri);
      parts.push({
        type: 'image',
        image: toDataUri(base64, mimeType),
        mimeType,
      });
    } catch (error) {
      if (__DEV__) {
        console.warn('[visionService] Failed to read image for vision message:', uri);
      }
    }
  }

  return { role: 'user', content: parts };
}
