/**
 * Native thermal status + adaptive token-stream yields.
 * Android: PowerManager · iOS: NSProcessInfo.thermalState
 *
 * Hot path: when status is cool/unknown, yield helpers return immediately
 * (cache read only). Native bridge + delays run only when elevated or stale.
 */

import { NativeModules } from 'react-native';

export type ThermalLevel = 'nominal' | 'fair' | 'serious' | 'critical' | 'unknown';

type ThermalNative = {
  getThermalState?: () => Promise<string>;
};

const native = NativeModules.ThermalStatus as ThermalNative | undefined;

let cached: { level: ThermalLevel; at: number } | null = null;
const CACHE_MS = 1500;
let lastLogged: ThermalLevel | null = null;
/** Prevent stacking refresh promises from the token hot path. */
let refreshInFlight: Promise<ThermalLevel> | null = null;

function normalize(raw: string | null | undefined): ThermalLevel {
  const s = (raw || '').toLowerCase().trim();
  if (
    s === 'nominal' ||
    s === 'fair' ||
    s === 'serious' ||
    s === 'critical' ||
    s === 'unknown'
  ) {
    return s;
  }
  return 'unknown';
}

function cacheFresh(now = Date.now()): boolean {
  return !!(cached && now - cached.at < CACHE_MS);
}

export async function getThermalLevel(opts?: { force?: boolean }): Promise<ThermalLevel> {
  const now = Date.now();
  if (!opts?.force && cacheFresh(now) && cached) {
    return cached.level;
  }
  if (!opts?.force && refreshInFlight) {
    return refreshInFlight;
  }

  const run = (async () => {
    let level: ThermalLevel = 'unknown';
    try {
      if (typeof native?.getThermalState === 'function') {
        level = normalize(await native.getThermalState());
      }
    } catch {
      level = 'unknown';
    }
    cached = { level, at: Date.now() };
    if (
      level !== lastLogged &&
      (level === 'serious' || level === 'critical' || lastLogged != null)
    ) {
      console.warn('[Thermal] status →', level);
      lastLogged = level;
    } else if (lastLogged == null) {
      lastLogged = level;
    }
    return level;
  })();

  refreshInFlight = run;
  try {
    return await run;
  } finally {
    if (refreshInFlight === run) {
      refreshInFlight = null;
    }
  }
}

/** High / critical thermal → yield between tokens. */
export function shouldYieldForThermal(level: ThermalLevel): boolean {
  return level === 'serious' || level === 'critical';
}

/** Title-case label for Diagnostics / Settings UI. */
export function formatThermalLabel(level: ThermalLevel): string {
  switch (level) {
    case 'nominal':
      return 'Nominal';
    case 'fair':
      return 'Fair';
    case 'serious':
      return 'Serious';
    case 'critical':
      return 'Critical';
    default:
      return 'Unknown';
  }
}

/**
 * Map OS thermal to a 4-level graph axis (Cool / Warm / Hot / Crit).
 * Matches native PowerManager / NSProcessInfo bands 1:1.
 */
export function thermalLevelToGraphValue(level: ThermalLevel): 1 | 2 | 3 | 4 {
  switch (level) {
    case 'fair':
      return 2;
    case 'serious':
      return 3;
    case 'critical':
      return 4;
    case 'nominal':
    case 'unknown':
    default:
      return 1;
  }
}

/** Y-axis / legend labels for the 4 thermal bands (high → low). */
export const THERMAL_GRAPH_BANDS = ['Crit', 'Hot', 'Warm', 'Cool'] as const;

export function formatThermalGraphBand(value: number): string {
  if (value >= 3.5) {
    return 'Crit';
  }
  if (value >= 2.5) {
    return 'Hot';
  }
  if (value >= 1.5) {
    return 'Warm';
  }
  return 'Cool';
}

/**
 * Semantic color for a thermal level (UI + chart stroke/fill).
 * Hex keeps chart-kit independent of ThemeContext.
 */
export function thermalLevelColor(level: ThermalLevel): string {
  switch (level) {
    case 'nominal':
      return '#34C759';
    case 'fair':
      return '#FF9F0A';
    case 'serious':
      return '#FF6B00';
    case 'critical':
      return '#FF453A';
    default:
      return '#8E8E93';
  }
}

/** Color for a numeric graph band (1–4). */
export function thermalGraphValueColor(value: number): string {
  if (value >= 3.5) {
    return thermalLevelColor('critical');
  }
  if (value >= 2.5) {
    return thermalLevelColor('serious');
  }
  if (value >= 1.5) {
    return thermalLevelColor('fair');
  }
  return thermalLevelColor('nominal');
}

/** Graph Y value where streaming yields begin (serious). */
export const THERMAL_YIELD_THRESHOLD = 3;

/** Short calm copy under the thermal value. */
export function formatThermalHint(level: ThermalLevel): string {
  switch (level) {
    case 'nominal':
      return 'Cool — full speed';
    case 'fair':
      return 'Warm — monitoring';
    case 'serious':
      return 'Hot — streaming yields briefly';
    case 'critical':
      return 'Very hot — stronger yield';
    default:
      return 'Native thermal API unavailable until rebuild';
  }
}

/** 5–10ms adaptive delay. */
export function thermalYieldMs(level: ThermalLevel): number {
  if (level === 'critical') {
    return 10;
  }
  if (level === 'serious') {
    return 5 + Math.floor(Math.random() * 4); // 5–8
  }
  return 0;
}

/**
 * Async yield for streamText loops.
 * Cool + fresh cache → no native call, no delay.
 */
export async function maybeYieldForThermal(): Promise<void> {
  const now = Date.now();
  if (cacheFresh(now) && cached) {
    const ms = thermalYieldMs(cached.level);
    if (ms <= 0) {
      return;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
    return;
  }
  const level = await getThermalLevel();
  const ms = thermalYieldMs(level);
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Sync yield for llama.rn token callbacks (cannot await).
 * Cool path is O(1) cache read — no bridge, no busy-wait.
 * Busy-wait only when already known hot (rare).
 */
export function maybeYieldForThermalSync(): void {
  const now = Date.now();
  if (!cacheFresh(now)) {
    // Single in-flight refresh; do not await on the token path.
    getThermalLevel().catch(() => {});
  }
  const level = cached?.level ?? 'unknown';
  const ms = thermalYieldMs(level);
  if (ms <= 0) {
    return;
  }
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* intentional thermal throttle — serious/critical only */
  }
}

/** Test helper */
export function __resetThermalCacheForTests(): void {
  cached = null;
  lastLogged = null;
  refreshInFlight = null;
}
