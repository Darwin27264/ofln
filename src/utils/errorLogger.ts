// errorLogger.ts
import RNFS from "react-native-fs";
import { Platform, NativeModules } from "react-native";

const errorLogFile = `${RNFS.DocumentDirectoryPath}/error_log.txt`;

/**
 * Build a header string with app and library versions (fetched at runtime).
 * Used at the top of the View Logs screen.
 */
export const getAppEnvironmentInfo = (): string => {
  const lines: string[] = [];
  lines.push("=== App environment ===");
  lines.push("");

  try {
    const pkg = require("../../package.json");
    lines.push(`App: ${pkg.name || "ofln"} ${pkg.version || "?"}`);
  } catch {
    lines.push("App: (unable to read)");
  }

  try {
    const react = require("react");
    lines.push(`React: ${react.version ?? "?"}`);
  } catch {
    lines.push("React: (unable to read)");
  }

  try {
    const rn = require("react-native");
    const v = (rn as { version?: string }).version;
    if (v) {
      lines.push(`React Native: ${v}`);
    } else {
      try {
        const rnPkg = require("react-native/package.json");
        lines.push(`React Native: ${rnPkg.version ?? "?"}`);
      } catch {
        lines.push("React Native: (unable to read)");
      }
    }
  } catch {
    lines.push("React Native: (unable to read)");
  }

  try {
    let llamaVersion = "";
    try {
      const llamaPkg = require("llama.rn/package.json");
      llamaVersion = String(llamaPkg.version ?? "").trim();
    } catch {
      // ignore
    }
    if (llamaVersion) {
      lines.push(`llama.rn: ${llamaVersion}`);
    } else {
      const llamaRn = require("llama.rn");
      const buildInfo = (llamaRn as { BuildInfo?: { number?: string; commit?: string } }).BuildInfo;
      if (buildInfo?.number != null) {
        lines.push(`llama.rn: build ${buildInfo.number}${buildInfo.commit ? ` (${buildInfo.commit})` : ""}`);
      } else {
        lines.push("llama.rn: (unable to read)");
      }
    }
  } catch {
    lines.push("llama.rn: (unable to read)");
  }

  try {
    lines.push(`Platform: ${Platform.OS} ${String(Platform.Version ?? "")}`);
  } catch {
    lines.push("Platform: (unable to read)");
  }

  const constants = (Platform.constants ?? {}) as Record<string, unknown>;
  if (constants.Brand) lines.push(`Device brand: ${constants.Brand}`);
  if (constants.Model) lines.push(`Device model: ${constants.Model}`);
  if (constants.Manufacturer) lines.push(`Manufacturer: ${constants.Manufacturer}`);

  lines.push("");
  lines.push("=== End environment ===");
  lines.push("");
  return lines.join("\n");
};

export interface ErrorLogEntry {
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO";
  category: string;
  message: string;
  error?: {
    name?: string;
    message: string;
    stack?: string;
  };
  context?: {
    [key: string]: any;
  };
  deviceInfo?: {
    platform: string;
    osVersion?: string;
    brand?: string;
    model?: string;
    manufacturer?: string;
  };
}

/**
 * Get device information for error logs
 */
const getDeviceInfo = (): ErrorLogEntry["deviceInfo"] => {
  try {
    const platformConstants = (Platform.constants || {}) as Record<string, unknown>;
    let nativeBrand = "";
    let nativeManufacturer = "";
    let nativeModel = "";
    
    try {
      const deviceInfo = (NativeModules.PlatformConstants || {}) as Record<string, unknown>;
      nativeBrand = String(deviceInfo.Brand || "").toLowerCase();
      nativeManufacturer = String(deviceInfo.Manufacturer || "").toLowerCase();
      nativeModel = String(deviceInfo.Model || "").toLowerCase();
    } catch (e) {
      // NativeModules might not be available
    }
    
    return {
      platform: Platform.OS,
      osVersion: Platform.Version?.toString(),
      brand: String(platformConstants.Brand || nativeBrand || "").toLowerCase(),
      model: String(platformConstants.Model || nativeModel || "").toLowerCase(),
      manufacturer: String(platformConstants.Manufacturer || nativeManufacturer || "").toLowerCase(),
    };
  } catch (error) {
    return {
      platform: Platform.OS,
    };
  }
};

/**
 * Format error log entry as a readable string
 */
const formatLogEntry = (entry: ErrorLogEntry): string => {
  const lines: string[] = [];
  
  lines.push("=".repeat(80));
  lines.push(`[${entry.timestamp}] ${entry.level} - ${entry.category}`);
  lines.push("-".repeat(80));
  lines.push(`Message: ${entry.message}`);
  
  if (entry.error) {
    lines.push(`Error: ${entry.error.name || "Error"}: ${entry.error.message}`);
    if (entry.error.stack) {
      lines.push("Stack Trace:");
      lines.push(entry.error.stack);
    }
  }
  
  if (entry.deviceInfo) {
    lines.push("Device Info:");
    lines.push(`  Platform: ${entry.deviceInfo.platform}`);
    if (entry.deviceInfo.osVersion) {
      lines.push(`  OS Version: ${entry.deviceInfo.osVersion}`);
    }
    if (entry.deviceInfo.brand) {
      lines.push(`  Brand: ${entry.deviceInfo.brand}`);
    }
    if (entry.deviceInfo.model) {
      lines.push(`  Model: ${entry.deviceInfo.model}`);
    }
    if (entry.deviceInfo.manufacturer) {
      lines.push(`  Manufacturer: ${entry.deviceInfo.manufacturer}`);
    }
  }
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    lines.push("Context:");
    for (const [key, value] of Object.entries(entry.context)) {
      lines.push(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  
  lines.push("=".repeat(80));
  lines.push(""); // Empty line for readability
  
  return lines.join("\n");
};

/**
 * Log an error to the error log file
 * 
 * @param category - Category of the error (e.g., "ModelLoading", "Inference", "FileAccess")
 * @param message - Human-readable error message
 * @param error - Error object (optional)
 * @param context - Additional context information (optional)
 * @param level - Log level (default: "ERROR")
 */
export const logError = async (
  category: string,
  message: string,
  error?: Error | unknown,
  context?: { [key: string]: any },
  level: "ERROR" | "WARN" | "INFO" = "ERROR"
): Promise<void> => {
  try {
    const timestamp = new Date().toISOString();
    
    const errorEntry: ErrorLogEntry = {
      timestamp,
      level,
      category,
      message,
      deviceInfo: getDeviceInfo(),
      context,
    };
    
    // Extract error information if provided
    if (error) {
      if (error instanceof Error) {
        errorEntry.error = {
          name: error.name,
          message: error.message,
          stack: error.stack,
        };
      } else {
        errorEntry.error = {
          message: String(error),
        };
      }
    }
    
    // Format and write to log file
    const logEntry = formatLogEntry(errorEntry);
    
    // Append to log file (create if doesn't exist)
    await RNFS.appendFile(errorLogFile, logEntry, "utf8");
    
    // Also log to console for immediate visibility
    console.error(`[${category}] ${message}`, error || "");
    
    // Keep log file size manageable (max 1MB, keep last 1000 lines)
    try {
      const fileExists = await RNFS.exists(errorLogFile);
      if (fileExists) {
        const stat = await RNFS.stat(errorLogFile);
        if (stat.size > 1024 * 1024) { // 1MB
          const content = await RNFS.readFile(errorLogFile, "utf8");
          const lines = content.split("\n");
          // Keep last 1000 lines
          const recentLines = lines.slice(-1000);
          await RNFS.writeFile(errorLogFile, recentLines.join("\n"), "utf8");
        }
      }
    } catch (sizeError) {
      // If size management fails, just continue - don't break error logging
      console.warn("Failed to manage log file size:", sizeError);
    }
  } catch (logError) {
    // If logging itself fails, at least log to console
    console.error("Failed to write error log:", logError);
    console.error(`Original error [${category}]: ${message}`, error || "");
  }
};

/**
 * Get the path to the error log file
 * Useful for displaying to users or exporting
 */
export const getErrorLogPath = (): string => {
  return errorLogFile;
};

/**
 * Read the error log file (errors only, no environment header).
 */
export const readErrorLog = async (): Promise<string> => {
  try {
    const exists = await RNFS.exists(errorLogFile);
    if (!exists) {
      return "No error log file found.";
    }
    return await RNFS.readFile(errorLogFile, "utf8");
  } catch (error) {
    console.error("Failed to read error log:", error);
    return `Failed to read error log: ${error instanceof Error ? error.message : "Unknown error"}`;
  }
};

/**
 * Get full log content for the View Logs screen: environment info at top, then error log.
 * Fetches environment at runtime (not hardcoded).
 */
export const getFullLogContent = async (): Promise<string> => {
  const header = getAppEnvironmentInfo();
  const errors = await readErrorLog();
  return header + "--- Error log ---\n\n" + errors;
};

/**
 * Clear the error log file
 */
export const clearErrorLog = async (): Promise<void> => {
  try {
    const exists = await RNFS.exists(errorLogFile);
    if (exists) {
      await RNFS.unlink(errorLogFile);
    }
  } catch (error) {
    console.error("Failed to clear error log:", error);
    throw error;
  }
};

