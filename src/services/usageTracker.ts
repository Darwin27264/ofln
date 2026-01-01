// usageTracker.ts
import RNFS from "react-native-fs";

const usageLogFile = `${RNFS.DocumentDirectoryPath}/usage_log.json`;

export interface UsageMetrics {
  timestamp: number;         // Unix timestamp in milliseconds
  inferenceTime: number;     // In milliseconds
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: "High" | "Medium" | "Low" | "Very Low";
  model: string;             // NEW: identifies the model for the record
}

/**
 * Derive a performance level based on tokens per second.
 * Thresholds:
 * - High: >= 18 tokens/s (great performance)
 * - Medium: >= 12 tokens/s (good performance)
 * - Low: >= 6 tokens/s (below good)
 * - Very Low: < 6 tokens/s (poor performance)
 */
export const getPerformanceLevel = (tps: number): "High" | "Medium" | "Low" | "Very Low" => {
  if (tps >= 18) return "High";
  if (tps >= 12) return "Medium";
  if (tps >= 6) return "Low";
  return "Very Low";
};

/**
 * Record a usage entry by appending it as a JSON line to a usage log file.
 */
export const recordUsage = async (metrics: UsageMetrics) => {
  try {
    const logEntry = JSON.stringify(metrics);
    await RNFS.appendFile(usageLogFile, logEntry + "\n", "utf8");
    console.log("Usage metrics recorded:", logEntry);
  } catch (error) {
    console.error("Error logging usage:", error);
  }
};
