/**
 * Safe Mode boot recovery — detect crash loops during launch / model load.
 *
 * Sets `@ofln/boot_in_progress` at launch; clears after STABLE_MS of foreground UI.
 * If the next cold start finds the flag still set, offer Safe Mode once (flag is
 * consumed immediately so Fast Refresh / early remounts cannot loop the dialog).
 *
 * Separately, `@ofln/model_load_in_progress` is set immediately before native
 * prepare/initLlama and cleared only after warm-up succeeds (or a JS failure path).
 * An uncleared load flag on the next launch means a likely native crash/OOM during
 * the previous load — suppress autoload even if the boot flag was already cleared.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

export const BOOT_IN_PROGRESS_KEY = '@ofln/boot_in_progress';
export const SUPPRESS_AUTOLOAD_KEY = '@ofln/suppress_model_autoload';
export const MODEL_LOAD_IN_PROGRESS_KEY = '@ofln/model_load_in_progress';

/** Continuous foreground time before clearing the boot flag. */
export const BOOT_STABLE_MS = 5000;

export type SafeBootLaunchResult = {
  /** Previous launch did not clear boot_in_progress — likely crash. */
  offerSafeMode: boolean;
  /** Previous launch died while model prepare/init was in progress. */
  priorModelLoadCrash: boolean;
};

/** Survives React remount / Fast Refresh so the 5s clear is not cancelled mid-flight. */
let sharedBootWatch: { cancel: () => void } | null = null;

/**
 * Call once at cold start (before model auto-load).
 *
 * - Uncleared `model_load_in_progress` → Safe Mode (likely native crash/OOM during load).
 * - Uncleared `boot_in_progress` alone → clear quietly (common after Fast Refresh, early
 *   kill, or remount before the 5s stability window — not worth a blocking dialog).
 */
export async function checkAndMarkBootStart(): Promise<SafeBootLaunchResult> {
  try {
    const prev = await AsyncStorage.getItem(BOOT_IN_PROGRESS_KEY);
    const priorLoad = await AsyncStorage.getItem(MODEL_LOAD_IN_PROGRESS_KEY);
    const priorModelLoadCrash = priorLoad === 'true';

    if (priorModelLoadCrash) {
      console.warn(
        '[SafeBoot] Uncleared model_load_in_progress — prior load crash/OOM likely',
      );
      await clearModelLoadInProgress();
      await setSuppressModelAutoload(true);
      // Fresh boot mark + Safe Mode for a real load crash.
      await AsyncStorage.setItem(BOOT_IN_PROGRESS_KEY, 'true');
      return { offerSafeMode: true, priorModelLoadCrash: true };
    }

    if (prev === 'true') {
      // Sticky boot flag without a load crash — almost always a false positive in RN
      // (reload / kill before STABLE_MS). Clear and continue without blocking the user.
      console.warn(
        '[SafeBoot] Clearing sticky boot_in_progress (no model-load crash) — skipping Safe Mode dialog',
      );
      await clearBootInProgress();
    }

    await AsyncStorage.setItem(BOOT_IN_PROGRESS_KEY, 'true');
    console.log('[SafeBoot] boot_in_progress=true');
    return { offerSafeMode: false, priorModelLoadCrash: false };
  } catch (e) {
    console.warn('[SafeBoot] checkAndMarkBootStart failed', e);
    return { offerSafeMode: false, priorModelLoadCrash: false };
  }
}

/** Clear boot flag after successful Safe Mode handling, then start the stability watch. */
export async function acknowledgeSafeModeAndContinue(): Promise<void> {
  await clearBootInProgress();
  await AsyncStorage.setItem(BOOT_IN_PROGRESS_KEY, 'true');
  console.log('[SafeBoot] Safe Mode acknowledged; boot watch restarted');
}

export async function clearBootInProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(BOOT_IN_PROGRESS_KEY);
    console.log('[SafeBoot] boot_in_progress cleared');
  } catch (e) {
    console.warn('[SafeBoot] clearBootInProgress failed', e);
  }
}

/** Call immediately before native prepare / initLlama. */
export async function markModelLoadInProgress(): Promise<void> {
  try {
    await AsyncStorage.setItem(MODEL_LOAD_IN_PROGRESS_KEY, 'true');
    console.log('[SafeBoot] model_load_in_progress=true');
  } catch (e) {
    console.warn('[SafeBoot] markModelLoadInProgress failed', e);
  }
}

/** Call after warm-up/probe success, or on JS failure paths (not on process death). */
export async function clearModelLoadInProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(MODEL_LOAD_IN_PROGRESS_KEY);
    console.log('[SafeBoot] model_load_in_progress cleared');
  } catch (e) {
    console.warn('[SafeBoot] clearModelLoadInProgress failed', e);
  }
}

export async function setSuppressModelAutoload(suppress: boolean): Promise<void> {
  try {
    if (suppress) {
      await AsyncStorage.setItem(SUPPRESS_AUTOLOAD_KEY, 'true');
      console.warn('[SafeBoot] suppress_model_autoload=true (active model config cleared)');
    } else {
      await AsyncStorage.removeItem(SUPPRESS_AUTOLOAD_KEY);
      console.log('[SafeBoot] suppress_model_autoload cleared');
    }
  } catch (e) {
    console.warn('[SafeBoot] setSuppressModelAutoload failed', e);
  }
}

export async function isModelAutoloadSuppressed(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SUPPRESS_AUTOLOAD_KEY)) === 'true';
  } catch {
    return false;
  }
}

/**
 * After marking boot in progress, clear the flag once the app stays in foreground
 * for BOOT_STABLE_MS continuously.
 *
 * Uses a module-level singleton so React Fast Refresh / Strict Mode remounts do not
 * cancel the timer and leave a sticky boot_in_progress (which used to re-offer Safe Mode).
 */
export function beginNormalBootWatch(
  onCleared?: () => void,
): { cancel: () => void } {
  if (sharedBootWatch) {
    return sharedBootWatch;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let sub: NativeEventSubscription | null = null;
  let cancelled = false;

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const arm = () => {
    clearTimer();
    if (cancelled) return;
    if (AppState.currentState !== 'active') return;
    timer = setTimeout(() => {
      if (cancelled) return;
      if (AppState.currentState !== 'active') return;
      clearBootInProgress()
        .then(() => {
          if (sharedBootWatch) {
            sharedBootWatch.cancel();
          }
          onCleared?.();
        })
        .catch(() => {});
    }, BOOT_STABLE_MS);
  };

  const onChange = (next: AppStateStatus) => {
    if (next === 'active') {
      arm();
    } else {
      clearTimer();
    }
  };

  arm();
  sub = AppState.addEventListener('change', onChange);

  sharedBootWatch = {
    cancel: () => {
      cancelled = true;
      clearTimer();
      sub?.remove();
      sub = null;
      if (sharedBootWatch) {
        sharedBootWatch = null;
      }
    },
  };

  return sharedBootWatch;
}
