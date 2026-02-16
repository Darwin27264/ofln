import { Platform, NativeModules } from "react-native";

/**
 * Best-effort runtime environment utilities.
 *
 * NOTE:
 * - This intentionally avoids new native/device-info dependencies.
 * - Detection is heuristic and may produce false positives/negatives.
 * - Callers MUST treat results as hints, not hard guarantees.
 */

type AndroidBuildInfo = {
  BRAND?: string;
  DEVICE?: string;
  FINGERPRINT?: string;
  HARDWARE?: string;
  MODEL?: string;
  PRODUCT?: string;
};

const ANDROID_EMULATOR_SUBSTRINGS = [
  "generic",
  "sdk_gphone",
  "sdk_phone",
  "emulator",
  "android sdk built for",
  "vbox",
  "test-keys",
];

let cachedIsAndroidEmulator: boolean | null = null;

/**
 * Extract a lightweight Android build object from React Native's PlatformConstants
 * or other available native modules, without adding new dependencies.
 */
const getAndroidBuildInfo = (): AndroidBuildInfo | null => {
  if (Platform.OS !== "android") return null;

  // React Native exposes some constants under PlatformConstants on Android
  const platformConstants = (NativeModules.PlatformConstants ??
    NativeModules.RNCPlatformConstants ??
    {}) as any;

  // Some RN versions expose "Manufacturer" / "Model" etc. under PlatformConstants.
  const buildFromPlatform: AndroidBuildInfo = {
    BRAND: platformConstants.Manufacturer,
    MODEL: platformConstants.Model,
    DEVICE: platformConstants.Device,
    PRODUCT: platformConstants.Product,
  };

  // If we have at least one field, treat it as usable
  if (
    buildFromPlatform.BRAND ||
    buildFromPlatform.MODEL ||
    buildFromPlatform.DEVICE ||
    buildFromPlatform.PRODUCT
  ) {
    return buildFromPlatform;
  }

  // Fallback: no additional info available without a dedicated device-info lib
  return null;
};

/**
 * Heuristic emulator detection.
 *
 * Rules:
 * - Non-Android: always false.
 * - Android:
 *   - Look for known emulator substrings in MODEL / DEVICE / PRODUCT.
 *   - __DEV__ override: if global.__OFN_FORCE_EMULATOR === true, treat as emulator.
 *
 * This function is synchronous and avoids I/O for simplicity and reliability.
 */
export const isAndroidEmulator = (): boolean => {
  if (Platform.OS !== "android") {
    return false;
  }

  if (cachedIsAndroidEmulator !== null) {
    return cachedIsAndroidEmulator;
  }

  // DEV-only override hook to simulate emulator behavior on real devices.
  // This is intentionally undocumented in the UI and only for internal testing.
  if (__DEV__ && (global as any).__OFN_FORCE_EMULATOR === true) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[deviceEnv] __OFN_FORCE_EMULATOR override active");
    }
    cachedIsAndroidEmulator = true;
    return cachedIsAndroidEmulator;
  }

  const build = getAndroidBuildInfo();
  const haystackParts: string[] = [];

  if (build?.BRAND) haystackParts.push(build.BRAND);
  if (build?.MODEL) haystackParts.push(build.MODEL);
  if (build?.DEVICE) haystackParts.push(build.DEVICE);
  if (build?.PRODUCT) haystackParts.push(build.PRODUCT);

  const haystack = haystackParts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  let detected = false;

  if (haystack.length > 0) {
    detected = ANDROID_EMULATOR_SUBSTRINGS.some((substr) =>
      haystack.includes(substr)
    );
  }

  if (__DEV__) {
    // DEV-only logging to understand what the app sees at runtime.
    // This helps tune heuristics without impacting production behavior.
    // eslint-disable-next-line no-console
    console.log("[deviceEnv] Android build info", {
      build,
      haystack,
      detectedEmulator: detected,
    });
  }

  cachedIsAndroidEmulator = detected;
  return detected;
};

