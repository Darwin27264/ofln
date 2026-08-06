/**
 * Media normalize — safe cross-device prep for OCR / vision / attachment IO.
 *
 * Goals:
 *  - Copy Android content:// into app cache (ML Kit + RNFS need real files)
 *  - Bound image size at pick time (via shared ImagePicker options)
 *  - Cap OCR text length so huge scanned pages don't blow n_ctx
 *  - Clean up temp files after use
 */

import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import type { ImageLibraryOptions, CameraOptions } from 'react-native-image-picker';
import {
  DOCUMENT_MAX_INJECT_CHARS,
  DOCUMENT_MAX_PDF_BYTES,
  truncateDocumentForInject,
} from '../utils/documentHelpers';

/** Max edge length passed to the image picker (keeps OCR / decode memory bounded). */
export const MEDIA_MAX_EDGE = 1600;

/** JPEG quality for picked/captured photos (0–1). */
export const MEDIA_JPEG_QUALITY = 0.75;

/** Hard cap on OCR text injected into the chat prompt (S27 single source). */
export const MAX_OCR_CHARS = DOCUMENT_MAX_INJECT_CHARS;

/** Soft cap for naive PDF text reads (bytes). Larger files are refused. */
export const MAX_PDF_PARSE_BYTES = DOCUMENT_MAX_PDF_BYTES;

const TEMP_PREFIX = 'ofln_media_';

export type NormalizedMedia = {
  /** Absolute filesystem path (no file:// prefix). */
  path: string;
  /** file:// URI suitable for display / ML Kit. */
  uri: string;
  /** True when we copied into cache and the caller should delete after use. */
  isTemp: boolean;
};

/** Ensure a path or URI is a file:// URI (ML Kit is picky on some OEMs). */
export function toFileUri(pathOrUri: string): string {
  const s = (pathOrUri || '').trim();
  if (!s) return s;
  if (s.startsWith('file://')) return s;
  if (s.startsWith('/')) return `file://${s}`;
  return s;
}

/**
 * Shared ImagePicker options for library + camera.
 * Resizes on-device before returning the URI — critical on low-RAM phones.
 */
export const IMAGE_PICKER_OPTIONS: ImageLibraryOptions & CameraOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  maxWidth: MEDIA_MAX_EDGE,
  maxHeight: MEDIA_MAX_EDGE,
  quality: MEDIA_JPEG_QUALITY,
  includeBase64: false,
};

/**
 * Resolve any picker URI to a readable file path under our control.
 * Android content:// is copied into CachesDirectoryPath.
 */
export async function normalizeMediaToFile(
  uri: string,
  options?: { preferredExt?: string },
): Promise<NormalizedMedia> {
  const trimmed = (uri || '').trim();
  if (!trimmed) {
    throw new Error('Empty media URI');
  }

  if (Platform.OS === 'android' && trimmed.startsWith('content://')) {
    const preferred = (options?.preferredExt || '')
      .replace(/^\./, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    const guessed = guessExtFromUri(trimmed);
    const ext =
      preferred ||
      guessed ||
      'jpg'; // default image-safe for library path; PDFs pass preferredExt
    const tempPath = `${RNFS.CachesDirectoryPath}/${TEMP_PREFIX}${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext === 'jpeg' ? 'jpg' : ext}`;
    await RNFS.copyFile(trimmed, tempPath);
    return {
      path: tempPath,
      uri: toFileUri(tempPath),
      isTemp: true,
    };
  }

  const path = trimmed.startsWith('file://')
    ? trimmed.replace(/^file:\/\//, '')
    : trimmed;

  return {
    path,
    uri: toFileUri(path),
    isTemp: false,
  };
}

function guessExtFromUri(uri: string): string | null {
  const lower = uri.toLowerCase();
  // Prefer matching a real extension at the end of a path segment when present.
  const match = lower.match(/\.([a-z0-9]{3,4})(?:\?|$)/);
  if (match) {
    const ext = match[1];
    return ext === 'jpeg' ? 'jpg' : ext;
  }
  return null;
}

/** Best-effort delete of a temp media file created by normalizeMediaToFile. */
export async function cleanupNormalizedMedia(media: NormalizedMedia | null | undefined): Promise<void> {
  if (!media?.isTemp || !media.path) return;
  try {
    if (await RNFS.exists(media.path)) {
      await RNFS.unlink(media.path);
    }
  } catch {
    // ignore — OS cache eviction will clean up eventually
  }
}

/** Truncate OCR / document text for safe injection into limited n_ctx windows. */
export function truncateForPrompt(text: string, maxChars: number = MAX_OCR_CHARS): string {
  return truncateDocumentForInject(text, maxChars);
}

/**
 * Delete old ofln_media_* temps older than `maxAgeMs` (default 24h).
 * Safe to call opportunistically after picking a photo.
 */
export async function cleanupStaleMediaTemps(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<void> {
  try {
    const entries = await RNFS.readDir(RNFS.CachesDirectoryPath);
    const now = Date.now();
    const stale = entries.filter((e) => {
      if (!e.isFile() || !e.name.startsWith(TEMP_PREFIX)) return false;
      const mtime = e.mtime ? new Date(e.mtime).getTime() : 0;
      return !mtime || now - mtime > maxAgeMs;
    });
    await Promise.all(stale.map((e) => RNFS.unlink(e.path).catch(() => {})));
  } catch {
    // ignore
  }
}
