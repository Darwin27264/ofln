/**
 * Screen keep-awake while generating (S17).
 * Talks to @sayem314/react-native-keep-awake’s TurboModule by name so a
 * Metro reload before native rebuild no-ops instead of crashing on import.
 */

import { TurboModuleRegistry, type TurboModule } from 'react-native';

interface KeepAwakeSpec extends TurboModule {
  activate: () => void;
  deactivate: () => void;
}

const MODULE = 'ReactNativeKCKeepAwake';

/** Cached after first lookup — null means missing until JS reload / rebuild. */
let cachedModule: KeepAwakeSpec | null | undefined;

function getKeepAwake(): KeepAwakeSpec | null {
  if (cachedModule !== undefined) return cachedModule;
  try {
    cachedModule = TurboModuleRegistry.get<KeepAwakeSpec>(MODULE) ?? null;
  } catch {
    cachedModule = null;
  }
  return cachedModule;
}

/** Native module present after full rebuild with keep-awake linked. */
export function isKeepAwakeAvailable(): boolean {
  return getKeepAwake() != null;
}

/** Prevent screen sleep for the duration of a completion. */
export function activateGeneratingKeepAwake(): void {
  try {
    getKeepAwake()?.activate();
  } catch (e) {
    if (__DEV__) console.warn('[keepAwake] activate failed', e);
  }
}

/** Allow screen sleep again (stop / end / abort). */
export function deactivateGeneratingKeepAwake(): void {
  try {
    getKeepAwake()?.deactivate();
  } catch (e) {
    if (__DEV__) console.warn('[keepAwake] deactivate failed', e);
  }
}

/** Test-only: clear module cache between Jest cases. */
export function __resetKeepAwakeCacheForTests(): void {
  cachedModule = undefined;
}
