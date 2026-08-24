/**
 * RAM fit chips — conservative local tiers vs device total memory.
 * Estimates loadability from on-disk GGUF size (not a guarantee).
 */

import { NativeModules } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { parseSizeToBytes } from '../utils/diskPreflight';

export type RamFitTier = 'fits' | 'tight' | 'wont_fit';

export type RamFitResult = {
  tier: RamFitTier;
  label: string;
  /** Device total RAM in bytes (when known). */
  totalMemoryBytes: number;
  /** Model file size used for the estimate. */
  fileBytes: number;
};

/** Soft ceiling per device-RAM bucket: [fitsMaxFile, tightMaxFile] in bytes. */
type DeviceRamBucket = {
  /** Min total device RAM for this bucket (inclusive). */
  minDeviceRam: number;
  /** File size ≤ this → Fits. */
  fitsMaxFile: number;
  /** File size ≤ this → Tight; above → Won't fit. */
  tightMaxFile: number;
};

const GB = 1024 ** 3;

/**
 * Conservative ceilings: GGUF on disk is lighter than peak load RAM
 * (KV cache, scratch, OS). Buckets favor smaller models on low-RAM phones.
 */
export const RAM_FIT_BUCKETS: DeviceRamBucket[] = [
  // < 3 GB device (many AVDs / old phones)
  { minDeviceRam: 0, fitsMaxFile: 0.55 * GB, tightMaxFile: 0.95 * GB },
  // 3–4 GB
  { minDeviceRam: 3 * GB, fitsMaxFile: 1.1 * GB, tightMaxFile: 1.7 * GB },
  // 4–6 GB
  { minDeviceRam: 4 * GB, fitsMaxFile: 1.9 * GB, tightMaxFile: 2.8 * GB },
  // 6–8 GB
  { minDeviceRam: 6 * GB, fitsMaxFile: 2.8 * GB, tightMaxFile: 4.0 * GB },
  // 8 GB+
  { minDeviceRam: 8 * GB, fitsMaxFile: 4.2 * GB, tightMaxFile: 6.0 * GB },
];

export const RAM_FIT_LABELS: Record<RamFitTier, string> = {
  fits: 'Fits',
  tight: 'Tight',
  wont_fit: "Won't fit",
};

/** Short GB label for alerts (1 decimal when needed). */
export function formatRamGb(bytes: number): string {
  const gb = bytes / GB;
  if (gb >= 10) return `${Math.round(gb)} GB`;
  return `${gb.toFixed(gb >= 1 ? 1 : 2)} GB`;
}

/**
 * User-facing explanation for a fit rating (shown when the status dot is tapped).
 */
export function explainRamFit(result: RamFitResult): { title: string; message: string } {
  const file = formatRamGb(result.fileBytes);
  const ram = formatRamGb(result.totalMemoryBytes);
  const bucket = bucketForDeviceRam(result.totalMemoryBytes);
  const fitsMax = formatRamGb(bucket.fitsMaxFile);
  const tightMax = formatRamGb(bucket.tightMaxFile);

  const title = `RAM fit: ${RAM_FIT_LABELS[result.tier]}`;
  const base =
    `Model file: ${file}. Phone RAM: ${ram}.\n\n` +
    `Peak load needs more than the file size (context + runtime). ` +
    `For your RAM class: comfortable up to ~${fitsMax}, tight up to ~${tightMax}.`;

  let verdict: string;
  if (result.tier === 'fits') {
    verdict = `\n\nShould load comfortably at default settings.`;
  } else if (result.tier === 'tight') {
    verdict = `\n\nMay load with less headroom. Lower context or pick a smaller model if load fails.`;
  } else {
    verdict = `\n\nLikely too large. Prefer a smaller model or lower quant.`;
  }

  return { title, message: base + verdict };
}

export function isDeviceInfoAvailable(): boolean {
  return (
    NativeModules?.RNDeviceInfo != null ||
    // Some builds expose via TurboModule name
    (NativeModules as { DeviceInfo?: unknown })?.DeviceInfo != null
  );
}

/** Pick the highest bucket whose minDeviceRam ≤ totalMemoryBytes. */
export function bucketForDeviceRam(totalMemoryBytes: number): DeviceRamBucket {
  let chosen = RAM_FIT_BUCKETS[0];
  for (const b of RAM_FIT_BUCKETS) {
    if (totalMemoryBytes >= b.minDeviceRam) chosen = b;
  }
  return chosen;
}

/** Pure classify — used by UI and unit tests. */
export function classifyRamFit(
  fileBytes: number,
  totalMemoryBytes: number,
): RamFitTier {
  if (!(fileBytes > 0) || !(totalMemoryBytes > 0)) {
    return 'wont_fit';
  }
  const bucket = bucketForDeviceRam(totalMemoryBytes);
  if (fileBytes <= bucket.fitsMaxFile) return 'fits';
  if (fileBytes <= bucket.tightMaxFile) return 'tight';
  return 'wont_fit';
}

export function classifyRamFitFromSize(
  size: string | number | null | undefined,
  totalMemoryBytes: number | null | undefined,
): RamFitResult | null {
  if (totalMemoryBytes == null || !(totalMemoryBytes > 0)) return null;
  const fileBytes = parseSizeToBytes(size);
  if (fileBytes == null) return null;
  const tier = classifyRamFit(fileBytes, totalMemoryBytes);
  return {
    tier,
    label: RAM_FIT_LABELS[tier],
    totalMemoryBytes,
    fileBytes,
  };
}

let cachedTotalMemory: number | null | undefined;

/** Cached total device RAM (bytes). null = unavailable. */
export async function getTotalMemoryBytes(): Promise<number | null> {
  if (cachedTotalMemory !== undefined) return cachedTotalMemory;

  try {
    // Bridgeless builds may not expose RNDeviceInfo on NativeModules until linked;
    // still attempt getTotalMemory and treat failures as "unknown" (no chip).
    const n = await DeviceInfo.getTotalMemory();
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
      cachedTotalMemory = Math.floor(n);
      return cachedTotalMemory;
    }
  } catch {
    /* native module missing until full rebuild — stay quiet */
  }

  cachedTotalMemory = null;
  return null;
}

/** Test helper — clears cached total RAM. */
export function __resetRamFitCacheForTests(): void {
  cachedTotalMemory = undefined;
}
