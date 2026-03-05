/**
 * Acceleration capability detection for llama.rn on Android.
 *
 * llama.rn 0.11.2 supports:
 * - OpenCL (GPU): Qualcomm Adreno 700+, Q4_0 / Q6_K models
 * - Hexagon (NPU): Qualcomm SM8450+ (8 Gen 1 or newer), HTP devices
 *
 * Uses getBackendDevicesInfo() from llama.rn to detect available backends at runtime.
 * The manifest must include libOpenCL.so and libcdsprpc.so (required=false).
 */

import { Platform } from "react-native";
import { getBackendDevicesInfo } from "llama.rn";
import type { NativeBackendDeviceInfo } from "llama.rn";

export type AccelerationConfig = {
  /** Raw backend devices from llama.rn */
  devices: NativeBackendDeviceInfo[];
  /** True if Hexagon HTP (NPU) devices are available */
  hasHTP: boolean;
  /** True if OpenCL-capable GPU is available (deviceName may include "Adreno", "OpenCL", etc.) */
  hasOpenCL: boolean;
  /** Recommended devices param for initLlama: ['HTP0'] or ['HTP*'] when HTP available */
  preferredDevices: string[] | undefined;
  /** Recommended max n_gpu_layers when acceleration is used (99 for full offload) */
  suggestedMaxGpuLayers: number;
  /** Human-readable summary for UI */
  summary: string;
};

let cachedConfig: AccelerationConfig | null = null;

/**
 * Check device capabilities for OpenCL (GPU) and Hexagon (NPU) acceleration.
 * Caches result for the session. Call clearAccelerationCache() to force recheck.
 */
export async function getAccelerationConfig(): Promise<AccelerationConfig> {
  if (Platform.OS !== "android") {
    return {
      devices: [],
      hasHTP: false,
      hasOpenCL: false,
      preferredDevices: undefined,
      suggestedMaxGpuLayers: 0,
      summary: "Acceleration is Android-only (OpenCL/Hexagon).",
    };
  }

  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const devices = await getBackendDevicesInfo();
    const htpDevices = devices.filter((d) => d.deviceName?.startsWith?.("HTP"));
    const hasHTP = htpDevices.length > 0;
    const hasOpenCL =
      devices.some((d) =>
        (d.deviceName || "").toLowerCase().includes("adreno")
      ) ||
      devices.some((d) =>
        (d.backend || "").toLowerCase().includes("opencl")
      ) ||
      (devices.length > 0 && !hasHTP); // Fallback: any device that isn't HTP may be OpenCL

    let preferredDevices: string[] | undefined;
    if (hasHTP) {
      preferredDevices = ["HTP0"];
    }
    const suggestedMaxGpuLayers = hasHTP || hasOpenCL ? 99 : 0;

    let summary: string;
    if (hasHTP) {
      summary = `Hexagon NPU available (${htpDevices.map((d) => d.deviceName).join(", ")}). Use devices: ['HTP0'] for best performance.`;
    } else if (hasOpenCL || devices.length > 0) {
      summary = `OpenCL/GPU available. ${devices.length} backend(s): ${devices.map((d) => d.deviceName || d.backend).join(", ")}.`;
    } else {
      summary =
        "No GPU/NPU backends detected. Model will run on CPU only. Check manifest for libOpenCL.so / libcdsprpc.so.";
    }

    cachedConfig = {
      devices,
      hasHTP,
      hasOpenCL,
      preferredDevices,
      suggestedMaxGpuLayers,
      summary,
    };

    if (__DEV__) {
      console.log("[accelCapability]", cachedConfig);
    }

    return cachedConfig;
  } catch (error) {
    if (__DEV__) {
      console.warn("[accelCapability] getBackendDevicesInfo failed:", error);
    }
    cachedConfig = {
      devices: [],
      hasHTP: false,
      hasOpenCL: false,
      preferredDevices: undefined,
      suggestedMaxGpuLayers: 0,
      summary:
        "Could not query backend devices. Acceleration may not be available.",
    };
    return cachedConfig;
  }
}

/**
 * Clear cached acceleration config so the next call rechecks.
 */
export function clearAccelerationCache(): void {
  cachedConfig = null;
}
