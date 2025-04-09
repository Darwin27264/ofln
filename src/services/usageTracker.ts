// usageTracker.ts
import RNFS from "react-native-fs";

const usageLogFile = `${RNFS.DocumentDirectoryPath}/usage_log.json`;

export interface UsageMetrics {
  timestamp: number;         // Unix timestamp in milliseconds
  inferenceTime: number;     // In milliseconds
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: "High" | "Medium" | "Low";
  model: string;             // NEW: identifies the model for the record
}

/**
 * Derive a performance level based on tokens per second.
 * Adjust thresholds as needed.
 */
export const getPerformanceLevel = (tps: number): "High" | "Medium" | "Low" => {
  if (tps >= 50) return "High";
  if (tps >= 30) return "Medium";
  return "Low";
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
