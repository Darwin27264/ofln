// errorLogger.ts
import RNFS from "react-native-fs";
import { Platform, NativeModules } from "react-native";

const errorLogFile = `${RNFS.DocumentDirectoryPath}/error_log.txt`;

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
    const platformConstants = Platform.constants || {};
    let nativeBrand = "";
    let nativeManufacturer = "";
    let nativeModel = "";
    
    try {
      const deviceInfo = NativeModules.PlatformConstants || {};
      nativeBrand = deviceInfo.Brand || "";
      nativeManufacturer = deviceInfo.Manufacturer || "";
      nativeModel = deviceInfo.Model || "";
    } catch (e) {
      // NativeModules might not be available
    }
    
    return {
      platform: Platform.OS,
      osVersion: Platform.Version?.toString(),
      brand: (platformConstants.Brand || nativeBrand || "").toLowerCase(),
      model: (platformConstants.Model || nativeModel || "").toLowerCase(),
      manufacturer: (platformConstants.Manufacturer || nativeManufacturer || "").toLowerCase(),
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
 * Read the error log file
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

