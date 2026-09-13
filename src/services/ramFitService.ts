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
  if (gb >= 10) {return `${Math.round(gb)} GB`;}
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
    'Peak load needs more than the file size (context + runtime). ' +
    `For your RAM class: comfortable up to ~${fitsMax}, tight up to ~${tightMax}.`;

  let verdict: string;
  if (result.tier === 'fits') {
    verdict = '\n\nShould load comfortably at default settings.';
  } else if (result.tier === 'tight') {
    verdict = '\n\nMay load with less headroom. Lower context or pick a smaller model if load fails.';
  } else {
    verdict = '\n\nLikely too large. Prefer a smaller model or lower quant.';
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
    if (totalMemoryBytes >= b.minDeviceRam) {chosen = b;}
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
  if (fileBytes <= bucket.fitsMaxFile) {return 'fits';}
  if (fileBytes <= bucket.tightMaxFile) {return 'tight';}
  return 'wont_fit';
}

export function classifyRamFitFromSize(
  size: string | number | null | undefined,
  totalMemoryBytes: number | null | undefined,
): RamFitResult | null {
  if (totalMemoryBytes == null || !(totalMemoryBytes > 0)) {return null;}
  const fileBytes = parseSizeToBytes(size);
  if (fileBytes == null) {return null;}
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
  if (cachedTotalMemory !== undefined) {return cachedTotalMemory;}

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

/** Best-effort used memory (bytes). null if unavailable. */
export async function getUsedMemoryBytes(): Promise<number | null> {
  try {
    const getUsed = (DeviceInfo as { getUsedMemory?: () => Promise<number> })
      .getUsedMemory;
    if (typeof getUsed !== 'function') {return null;}
    const n = await getUsed.call(DeviceInfo);
    if (typeof n === 'number' && Number.isFinite(n) && n >= 0) {
      return Math.floor(n);
    }
  } catch {
    /* optional API */
  }
  return null;
}

/**
 * Best-effort available RAM. Prefers total − used; falls back to ~40% of total
 * when used is unknown (conservative for load gating).
 */
export async function getAvailableMemoryBytes(): Promise<number | null> {
  const total = await getTotalMemoryBytes();
  if (total == null || !(total > 0)) {return null;}
  const used = await getUsedMemoryBytes();
  if (used != null && used >= 0 && used < total) {
    return Math.max(0, total - used);
  }
  return Math.floor(total * 0.4);
}

const MB = 1024 ** 2;
const HEADROOM_BYTES = 500 * MB;

/** Discrete context sizes (matches modelSettingsService SETTING_RANGES.n_ctx). */
export const N_CTX_LADDER = [512, 1024, 2048, 4096, 8192] as const;

export type KvCacheQuant = 'q8_0' | 'q4_0' | 'f16';

export type EstimateKvOpts = {
  nLayers?: number;
  nKvHeads?: number;
  /** Affects bytes/element: q4_0≈0.5, q8_0≈1, f16≈2. Default q8_0. */
  cacheType?: KvCacheQuant;
};

/**
 * Conservative KV-cache size estimate (bytes) for load preflight.
 * Assumes ~32 layers × n_kv_heads × 128 dim × 2 (K+V) × elemBytes, scaled by n_ctx.
 * Not exact — errs high via 1.25× overhead.
 */
export function estimateKvCacheBytes(
  nCtx: number,
  nLayersOrOpts: number | EstimateKvOpts = 32,
  nKvHeads = 8,
): number {
  const opts: EstimateKvOpts =
    typeof nLayersOrOpts === 'object' && nLayersOrOpts != null
      ? nLayersOrOpts
      : { nLayers: nLayersOrOpts as number, nKvHeads };
  const ctx = Number.isFinite(nCtx) && nCtx > 0 ? nCtx : 2048;
  const layers = Math.max(1, opts.nLayers ?? 32);
  const heads = Math.max(1, opts.nKvHeads ?? nKvHeads);
  const headDim = 128;
  const elemBytes =
    opts.cacheType === 'q4_0' ? 0.5 : opts.cacheType === 'f16' ? 2 : 1;
  const bytesPerToken = layers * heads * headDim * 2 * elemBytes * 1.25;
  return Math.floor(ctx * bytesPerToken);
}

export type LoadRamPreflight = {
  ok: boolean;
  availableBytes: number | null;
  modelBytes: number;
  expectedKvBytes: number;
  headroomBytes: number;
  requiredBytes: number;
  reason?: string;
};

/**
 * Require availableRAM > modelSize + expectedKV + 500MB before initLlama/prepare.
 */
export async function preflightLoadRam(opts: {
  modelBytes: number;
  nCtx: number;
  nLayers?: number;
  cacheType?: KvCacheQuant;
}): Promise<LoadRamPreflight> {
  const expectedKvBytes = estimateKvCacheBytes(opts.nCtx, {
    nLayers: opts.nLayers,
    cacheType: opts.cacheType,
  });
  const requiredBytes = opts.modelBytes + expectedKvBytes + HEADROOM_BYTES;
  const availableBytes = await getAvailableMemoryBytes();

  if (availableBytes == null) {
    // Unknown RAM — do not hard-block; caller should still log.
    return {
      ok: true,
      availableBytes: null,
      modelBytes: opts.modelBytes,
      expectedKvBytes,
      headroomBytes: HEADROOM_BYTES,
      requiredBytes,
      reason: 'available_ram_unknown',
    };
  }

  const ok = availableBytes > requiredBytes;
  return {
    ok,
    availableBytes,
    modelBytes: opts.modelBytes,
    expectedKvBytes,
    headroomBytes: HEADROOM_BYTES,
    requiredBytes,
    reason: ok
      ? undefined
      : `insufficient_ram avail=${availableBytes} required=${requiredBytes}`,
  };
}

/**
 * Pure: largest ladder n_ctx ≤ requested that fits in availableBytes.
 * Returns 512 if nothing larger fits (caller may still fail preflight).
 */
export function pickLargestNCtxThatFits(opts: {
  availableBytes: number;
  modelBytes: number;
  requestedNCtx: number;
  nLayers?: number;
  cacheType?: KvCacheQuant;
  headroomBytes?: number;
}): number {
  const headroom = opts.headroomBytes ?? HEADROOM_BYTES;
  const requested =
    Number.isFinite(opts.requestedNCtx) && opts.requestedNCtx > 0
      ? opts.requestedNCtx
      : 2048;
  const candidates = N_CTX_LADDER.filter((n) => n <= requested).slice().reverse();
  const ladder = candidates.length > 0 ? candidates : [512];

  for (const nCtx of ladder) {
    const kv = estimateKvCacheBytes(nCtx, {
      nLayers: opts.nLayers,
      cacheType: opts.cacheType,
    });
    const required = opts.modelBytes + kv + headroom;
    if (opts.availableBytes > required) {
      return nCtx;
    }
  }
  return 512;
}

/**
 * Dynamic context length from available system memory (not a hardcoded 4K/8K).
 * Unknown available RAM → snap requested down to nearest ladder ≤ requested.
 */
export async function suggestNCtxForRam(opts: {
  modelBytes: number;
  requestedNCtx: number;
  nLayers?: number;
  cacheType?: KvCacheQuant;
}): Promise<number> {
  const requested =
    Number.isFinite(opts.requestedNCtx) && opts.requestedNCtx > 0
      ? opts.requestedNCtx
      : 2048;
  const snapped =
    [...N_CTX_LADDER].reverse().find((n) => n <= requested) ?? 512;

  const availableBytes = await getAvailableMemoryBytes();
  if (availableBytes == null) {
    return snapped;
  }

  return pickLargestNCtxThatFits({
    availableBytes,
    modelBytes: opts.modelBytes,
    requestedNCtx: requested,
    nLayers: opts.nLayers,
    cacheType: opts.cacheType,
  });
}

/** True when free RAM is below a healthy OCR threshold (model should unload first). */
export async function isRamTightForOcr(thresholdBytes = 600 * MB): Promise<boolean> {
  const avail = await getAvailableMemoryBytes();
  if (avail == null) {return false;}
  return avail < thresholdBytes;
}

/** Test helper — clears cached total RAM. */
export function __resetRamFitCacheForTests(): void {
  cachedTotalMemory = undefined;
}
