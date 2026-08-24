/**
 * Unified performance tracking for ofln.
 *
 * Single place for:
 * - Building sanitized usage rows from llama.rn timings / wall clock
 * - Persisting / loading / clearing the usage log
 * - Aggregates for the Performance screen
 * - Per-message tok/s helpers for chat UI
 *
 * Does not poll system CPU/RAM — inference metrics only.
 */

import RNFS from "react-native-fs";

export const USAGE_LOG_PATH = `${RNFS.DocumentDirectoryPath}/usage_log.json`;

/** llama.rn completion timings (subset we care about). */
export type CompletionTimings = {
  prompt_n?: number;
  prompt_ms?: number;
  predicted_n?: number;
  predicted_ms?: number;
  predicted_per_second?: number;
};

export type PerformanceLevel = "High" | "Medium" | "Low" | "Very Low";

export interface UsageMetrics {
  timestamp: number;
  /** Prefer decode duration (predicted_ms); else wall-clock ms. */
  inferenceTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: PerformanceLevel;
  model: string;
  accelOn?: boolean;
  accelBackend?: string;
  /** Wall-clock end-to-end ms (prompt + decode), when known. */
  wallTimeMs?: number;
  /** Prompt eval ms from native timings, when known. */
  promptMs?: number;
  /** How TPS was derived. */
  tpsSource?: "native" | "wall";
}

export type UsageAverages = {
  totalInferences: number;
  validInferences: number;
  skippedInferences: number;
  totalTokens: number;
  avgInferenceTimeMs: number;
  avgTokensPerSecond: number;
  avgTokensPerInference: number;
  avgWallTimeMs: number | null;
  medianTokensPerSecond: number | null;
  performanceLevel: PerformanceLevel;
  accelOnShare: number | null;
};

export type ModelPerformanceStats = {
  total: number;
  valid: number;
  avgTime: number;
  avgWallTime: number | null;
  avgTps: number;
  medianTps: number | null;
  avgTokens: number;
  perf: PerformanceLevel;
  tpsData: number[];
  timeData: number[];
  accelOnShare: number | null;
};

/**
 * Derive a performance level based on tokens per second.
 * - High: >= 18 tok/s
 * - Medium: >= 12 tok/s
 * - Low: >= 6 tok/s
 * - Very Low: < 6 tok/s
 */
export function getPerformanceLevel(tps: number): PerformanceLevel {
  if (!Number.isFinite(tps) || tps <= 0) return "Very Low";
  if (tps >= 18) return "High";
  if (tps >= 12) return "Medium";
  if (tps >= 6) return "Low";
  return "Very Low";
}

/** Normalize model id for stable matching (filename only). */
export function normalizeModelName(model: string): string {
  if (!model) return model;
  const base = model.split(/[/\\]/).pop() || model;
  return base.trim();
}

/** Rough token estimate when native predicted_n is unavailable (~4 chars/token). */
export function approxTokenCountFromText(...parts: string[]): number {
  const len = parts.reduce((n, p) => n + (p?.length || 0), 0);
  return Math.max(0, Math.round(len / 4));
}

function finitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function accelFieldsForUsage(): Pick<UsageMetrics, "accelOn" | "accelBackend"> {
  try {
    const {
      getRuntimeAccelerationState,
    } = require("./accelerationCapabilityService") as typeof import("./accelerationCapabilityService");
    const rt = getRuntimeAccelerationState();
    if (!rt) return {};
    return {
      accelOn: rt.on,
      accelBackend: rt.on ? rt.backendLabel : "CPU",
    };
  } catch {
    return {};
  }
}

/**
 * Build a sanitized usage row from native timings + wall clock.
 * Returns null for empty/failed runs so they are not logged.
 */
export function buildUsageMetrics(opts: {
  model: string;
  wallTimeMs: number;
  /** Stream callback / char-heuristic counts — fallback only. */
  streamTokenCount?: number;
  timings?: CompletionTimings | null;
}): UsageMetrics | null {
  const timings = opts.timings ?? null;
  const wallTimeMs = finitePositive(opts.wallTimeMs) ? opts.wallTimeMs : 0;

  const predictedN = finitePositive(timings?.predicted_n)
    ? Math.round(timings!.predicted_n!)
    : 0;
  const streamN =
    typeof opts.streamTokenCount === "number" &&
    Number.isFinite(opts.streamTokenCount) &&
    opts.streamTokenCount > 0
      ? Math.round(opts.streamTokenCount)
      : 0;
  const tokenCount = predictedN > 0 ? predictedN : streamN;

  const nativeTps = finitePositive(timings?.predicted_per_second)
    ? timings!.predicted_per_second!
    : 0;
  const predictedMs = finitePositive(timings?.predicted_ms)
    ? timings!.predicted_ms!
    : 0;
  const promptMs = finitePositive(timings?.prompt_ms) ? timings!.prompt_ms! : 0;

  let tokensPerSecond = 0;
  let tpsSource: "native" | "wall" = "wall";
  let inferenceTime = wallTimeMs;

  if (nativeTps > 0) {
    tokensPerSecond = nativeTps;
    tpsSource = "native";
    if (predictedMs > 0) {
      inferenceTime = predictedMs;
    } else if (tokenCount > 0) {
      inferenceTime = (tokenCount / nativeTps) * 1000;
    }
  } else if (tokenCount > 0 && wallTimeMs > 0) {
    tokensPerSecond = (tokenCount / wallTimeMs) * 1000;
    tpsSource = "wall";
    inferenceTime = wallTimeMs;
  }

  if (
    tokenCount <= 0 ||
    tokensPerSecond <= 0 ||
    !Number.isFinite(tokensPerSecond) ||
    !Number.isFinite(inferenceTime) ||
    inferenceTime <= 0
  ) {
    return null;
  }

  if (tokensPerSecond > 500) {
    tokensPerSecond = 500;
  }

  return {
    timestamp: Date.now(),
    inferenceTime: Math.round(inferenceTime),
    tokenCount,
    tokensPerSecond: parseFloat(tokensPerSecond.toFixed(2)),
    performanceLevel: getPerformanceLevel(tokensPerSecond),
    model: normalizeModelName(opts.model),
    wallTimeMs: wallTimeMs > 0 ? Math.round(wallTimeMs) : undefined,
    promptMs: promptMs > 0 ? Math.round(promptMs) : undefined,
    tpsSource,
    ...accelFieldsForUsage(),
  };
}

/** Persist a usage row. No-ops on null (failed/empty runs). */
export async function recordUsage(
  metrics: UsageMetrics | null | undefined,
): Promise<void> {
  if (!metrics) return;
  try {
    await RNFS.appendFile(USAGE_LOG_PATH, JSON.stringify(metrics) + "\n", "utf8");
    if (__DEV__) {
      console.log("[performanceTracking] recorded", metrics);
    }
  } catch (error) {
    console.error("[performanceTracking] record failed:", error);
  }
}

/**
 * Build + persist in one call. Returns the metrics (or null) for UI tok/s.
 */
export async function recordCompletionUsage(opts: {
  model: string;
  wallTimeMs: number;
  streamTokenCount?: number;
  timings?: CompletionTimings | null;
}): Promise<UsageMetrics | null> {
  const metrics = buildUsageMetrics(opts);
  await recordUsage(metrics);
  return metrics;
}

/** Loose parse check — keeps legacy rows loadable; aggregates filter strictly. */
export function isParseableUsageRecord(record: unknown): record is UsageMetrics {
  if (!record || typeof record !== "object") return false;
  const r = record as UsageMetrics;
  return (
    typeof r.timestamp === "number" &&
    typeof r.inferenceTime === "number" &&
    typeof r.tokenCount === "number" &&
    typeof r.tokensPerSecond === "number" &&
    typeof r.performanceLevel === "string" &&
    typeof r.model === "string"
  );
}

/** Strict validity for averages / charts. */
export function isValidUsageRecord(record: unknown): record is UsageMetrics {
  if (!isParseableUsageRecord(record)) return false;
  return (
    Number.isFinite(record.inferenceTime) &&
    record.inferenceTime > 0 &&
    record.tokenCount > 0 &&
    Number.isFinite(record.tokensPerSecond) &&
    record.tokensPerSecond > 0 &&
    ["High", "Medium", "Low", "Very Low"].includes(record.performanceLevel) &&
    record.model.length > 0
  );
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Load all parseable rows from the usage log (empty array if missing). */
export async function loadUsageRecords(): Promise<UsageMetrics[]> {
  try {
    if (!(await RNFS.exists(USAGE_LOG_PATH))) return [];
    const content = await RNFS.readFile(USAGE_LOG_PATH, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(isParseableUsageRecord);
  } catch (error) {
    console.error("[performanceTracking] load failed:", error);
    return [];
  }
}

/** Delete the usage log file. */
export async function clearUsageRecords(): Promise<void> {
  try {
    if (await RNFS.exists(USAGE_LOG_PATH)) {
      await RNFS.unlink(USAGE_LOG_PATH);
    }
  } catch (error) {
    console.error("[performanceTracking] clear failed:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Remove usage rows for one model. Rewrites the log (or deletes it if empty).
 * Returns the remaining records.
 */
export async function clearUsageRecordsForModel(
  model: string,
): Promise<UsageMetrics[]> {
  const key = normalizeModelName(model);
  if (!key) return loadUsageRecords();

  const records = await loadUsageRecords();
  const remaining = records.filter(
    (r) => normalizeModelName(r.model) !== key,
  );

  try {
    if (remaining.length === 0) {
      if (await RNFS.exists(USAGE_LOG_PATH)) {
        await RNFS.unlink(USAGE_LOG_PATH);
      }
    } else {
      const content =
        remaining.map((r) => JSON.stringify(r)).join("\n") + "\n";
      await RNFS.writeFile(USAGE_LOG_PATH, content, "utf8");
    }
    return remaining;
  } catch (error) {
    console.error("[performanceTracking] clear-for-model failed:", error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

export function filterRecordsForModel(
  records: UsageMetrics[],
  model: string | null | undefined,
): UsageMetrics[] {
  if (!model) return [];
  const key = normalizeModelName(model);
  return records.filter((r) => normalizeModelName(r.model) === key);
}

/**
 * Aggregate averages. Skips invalid/zero runs. TPS is token-weighted.
 */
export function computeUsageAverages(
  records: UsageMetrics[],
): UsageAverages | null {
  if (!records.length) return null;

  const valid = records.filter(isValidUsageRecord);
  if (!valid.length) return null;

  const totalTokens = valid.reduce((s, r) => s + r.tokenCount, 0);
  const avgInferenceTimeMs =
    valid.reduce((s, r) => s + r.inferenceTime, 0) / valid.length;

  const weightedTps =
    totalTokens > 0
      ? valid.reduce((s, r) => s + r.tokensPerSecond * r.tokenCount, 0) /
        totalTokens
      : valid.reduce((s, r) => s + r.tokensPerSecond, 0) / valid.length;

  const wallSamples = valid
    .map((r) => r.wallTimeMs)
    .filter((n): n is number => finitePositive(n));
  const avgWallTimeMs =
    wallSamples.length > 0
      ? wallSamples.reduce((s, n) => s + n, 0) / wallSamples.length
      : null;

  const withAccel = valid.filter((r) => typeof r.accelOn === "boolean");
  const accelOnShare =
    withAccel.length > 0
      ? withAccel.filter((r) => r.accelOn).length / withAccel.length
      : null;

  return {
    totalInferences: records.length,
    validInferences: valid.length,
    skippedInferences: records.length - valid.length,
    totalTokens,
    avgInferenceTimeMs,
    avgTokensPerSecond: weightedTps,
    avgTokensPerInference: totalTokens / valid.length,
    avgWallTimeMs,
    medianTokensPerSecond: median(valid.map((r) => r.tokensPerSecond)),
    performanceLevel: getPerformanceLevel(weightedTps),
    accelOnShare,
  };
}

/** Per-model stats for the Performance screen (charts + cards). */
export function computeModelPerformanceStats(
  records: UsageMetrics[],
  model: string | null | undefined,
): ModelPerformanceStats | null {
  const filtered = filterRecordsForModel(records, model);
  if (!filtered.length) return null;

  const averages = computeUsageAverages(filtered);
  if (!averages) return null;

  // Chronological for chart sparklines (oldest → newest).
  const validRows = filtered
    .filter(isValidUsageRecord)
    .sort((a, b) => a.timestamp - b.timestamp);
  return {
    total: averages.totalInferences,
    valid: averages.validInferences,
    avgTime: averages.avgInferenceTimeMs,
    avgWallTime: averages.avgWallTimeMs,
    avgTps: averages.avgTokensPerSecond,
    medianTps: averages.medianTokensPerSecond,
    avgTokens: averages.avgTokensPerInference,
    perf: averages.performanceLevel,
    tpsData: validRows.map((r) => r.tokensPerSecond),
    timeData: validRows.map((r) => r.inferenceTime),
    accelOnShare: averages.accelOnShare,
  };
}

/** One completed run for personal history lists (Stages screen). */
export type UsageHistoryEntry = {
  timestamp: number;
  tokensPerSecond: number;
  tokenCount: number;
  inferenceTime: number;
  performanceLevel: PerformanceLevel;
  accelOn?: boolean;
};

/**
 * Recent valid runs for a model, newest first (personal tok/s history).
 * Pure — does not touch disk.
 */
export function buildUsageHistory(
  records: UsageMetrics[],
  model: string | null | undefined,
  limit = 12,
): UsageHistoryEntry[] {
  if (!model || limit <= 0) return [];
  const rows = filterRecordsForModel(records, model)
    .filter(isValidUsageRecord)
    .sort((a, b) => a.timestamp - b.timestamp);
  const take = rows.slice(-limit).reverse();
  return take.map((r) => ({
    timestamp: r.timestamp,
    tokensPerSecond: r.tokensPerSecond,
    tokenCount: r.tokenCount,
    inferenceTime: r.inferenceTime,
    performanceLevel: r.performanceLevel,
    accelOn: r.accelOn,
  }));
}

export type UsageTrendDirection = "up" | "down" | "flat";

export type UsageTrend = {
  direction: UsageTrendDirection;
  /** Percent change of recent half vs older half of the series. */
  deltaPct: number | null;
  sampleCount: number;
  olderAvg: number | null;
  recentAvg: number | null;
};

/**
 * Simple half-vs-half trend on a chronological tok/s series (oldest first).
 * Flat when under minSamples or change is within ±flatPct.
 */
export function computeUsageTrend(
  tpsSeriesChronological: number[],
  opts?: { minSamples?: number; flatPct?: number },
): UsageTrend {
  const minSamples = opts?.minSamples ?? 4;
  const flatPct = opts?.flatPct ?? 5;
  const series = tpsSeriesChronological.filter(
    (n) => typeof n === "number" && Number.isFinite(n) && n > 0,
  );
  if (series.length < minSamples) {
    return {
      direction: "flat",
      deltaPct: null,
      sampleCount: series.length,
      olderAvg: null,
      recentAvg: null,
    };
  }

  const mid = Math.floor(series.length / 2);
  const older = series.slice(0, mid);
  const recent = series.slice(mid);
  const olderAvg = older.reduce((s, n) => s + n, 0) / older.length;
  const recentAvg = recent.reduce((s, n) => s + n, 0) / recent.length;
  const deltaPct =
    olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : null;

  let direction: UsageTrendDirection = "flat";
  if (deltaPct != null && Math.abs(deltaPct) >= flatPct) {
    direction = deltaPct > 0 ? "up" : "down";
  }

  return {
    direction,
    deltaPct: deltaPct != null ? parseFloat(deltaPct.toFixed(1)) : null,
    sampleCount: series.length,
    olderAvg: parseFloat(olderAvg.toFixed(2)),
    recentAvg: parseFloat(recentAvg.toFixed(2)),
  };
}

/** Extract per-turn tok/s from chat messages for in-conversation display. */
export function tokensPerSecondFromMessages(
  messages: Array<{ role?: string; tokensPerSecond?: number }>,
): number[] {
  return messages
    .filter(
      (m): m is { role: string; tokensPerSecond: number } =>
        m.role === "assistant" && typeof m.tokensPerSecond === "number",
    )
    .map((m) => m.tokensPerSecond);
}
