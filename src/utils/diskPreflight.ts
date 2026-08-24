/**
 * Disk space preflight before model downloads.
 * Requires free space ≥ expectedSize × 1.1 + pad.
 */

import RNFS from 'react-native-fs';

/** Extra headroom beyond the 10% multiplier (bytes). */
export const DISK_PREFLIGHT_PAD_BYTES = 256 * 1024 * 1024; // 256 MB

export type DiskPreflightResult =
  | { ok: true; freeBytes: number; needBytes: number }
  | { ok: false; freeBytes: number; needBytes: number; reason: 'insufficient' }
  | { ok: true; skipped: true; reason: 'unknown_size' | 'fs_unavailable' };

/** Parse display sizes ("2.1GB", "850 MB") or raw byte counts. */
export function parseSizeToBytes(size?: string | number | null): number | null {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
    return Math.floor(size);
  }
  if (!size || typeof size !== 'string') return null;

  const m = size.trim().match(/^([\d.]+)\s*(t|tb|g|gb|m|mb|k|kb|b)?$/i);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  const unit = (m[2] || 'b').toLowerCase();
  const mult =
    unit === 't' || unit === 'tb'
      ? 1024 ** 4
      : unit === 'g' || unit === 'gb'
        ? 1024 ** 3
        : unit === 'm' || unit === 'mb'
          ? 1024 ** 2
          : unit === 'k' || unit === 'kb'
            ? 1024
            : 1;
  return Math.floor(n * mult);
}

export function requiredBytesForDownload(fileBytes: number): number {
  return Math.ceil(fileBytes * 1.1) + DISK_PREFLIGHT_PAD_BYTES;
}

export function formatBytesShort(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Returns whether the device has enough free space for a download of `size`.
 * If size cannot be parsed, skips the check (ok) so downloads are not blocked blindly.
 */
export async function checkDiskSpaceForDownload(
  size?: string | number | null,
): Promise<DiskPreflightResult> {
  const fileBytes = parseSizeToBytes(size);
  if (fileBytes == null) {
    return { ok: true, skipped: true, reason: 'unknown_size' };
  }

  const needBytes = requiredBytesForDownload(fileBytes);
  try {
    const info = await RNFS.getFSInfo();
    const freeBytes = Number(info?.freeSpace) || 0;
    if (freeBytes >= needBytes) {
      return { ok: true, freeBytes, needBytes };
    }
    return { ok: false, freeBytes, needBytes, reason: 'insufficient' };
  } catch {
    return { ok: true, skipped: true, reason: 'fs_unavailable' };
  }
}

export function diskPreflightAlertMessage(result: Extract<DiskPreflightResult, { ok: false }>): {
  title: string;
  message: string;
} {
  return {
    title: 'Storage full',
    message: `This download needs about ${formatBytesShort(result.needBytes)} free (file + margin). You have ${formatBytesShort(result.freeBytes)} available. Free up space, then try again.`,
  };
}
