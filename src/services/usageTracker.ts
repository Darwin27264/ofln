/**
 * @deprecated Import from `./performanceTracking` instead.
 * Kept as a thin re-export so older imports keep working.
 */
export {
  USAGE_LOG_PATH,
  getPerformanceLevel,
  normalizeModelName,
  approxTokenCountFromText,
  buildUsageMetrics,
  recordUsage,
  recordCompletionUsage,
  isParseableUsageRecord,
  isValidUsageRecord,
  loadUsageRecords,
  clearUsageRecords,
  clearUsageRecordsForModel,
  filterRecordsForModel,
  computeUsageAverages,
  computeModelPerformanceStats,
  tokensPerSecondFromMessages,
  type CompletionTimings,
  type PerformanceLevel,
  type UsageMetrics,
  type UsageAverages,
  type ModelPerformanceStats,
} from "./performanceTracking";
