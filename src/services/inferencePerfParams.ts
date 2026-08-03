/**
 * Shared llama.rn load-time performance knobs.
 * Used by both llamaProvider and the legacy llamaService loader.
 *
 * Emulator / CPU: stay minimal — optional KV quant + flash-attn have caused
 * init failures on some AVDs. Real devices with GPU layers get the fuller set.
 */

import { Platform } from 'react-native';
import { isAndroidEmulator } from './deviceEnv';

export type InferencePerfParams = {
  flash_attn_type: 'auto' | 'on' | 'off';
  n_batch: number;
  cache_type_k?: 'q8_0';
  cache_type_v?: 'q8_0';
};

export type InferencePerfOptions = {
  /** Force emulator-safe knobs (no KV quant, flash off, tiny batch). */
  isEmulator?: boolean;
};

/**
 * @param nGpuLayers - layers offloaded after platform gating (0 = CPU path)
 */
export function getInferencePerfParams(
  nGpuLayers: number,
  options?: InferencePerfOptions,
): InferencePerfParams {
  const emulator = options?.isEmulator ?? isAndroidEmulator();

  // Emulators and pure-CPU paths: fewest knobs = highest chance initLlama succeeds.
  if (emulator || nGpuLayers <= 0) {
    return {
      flash_attn_type: 'off',
      n_batch: emulator ? 128 : 256,
    };
  }

  const params: InferencePerfParams = {
    flash_attn_type: 'auto',
    n_batch: 512,
  };

  if (Platform.OS === 'android') {
    params.cache_type_k = 'q8_0';
    params.cache_type_v = 'q8_0';
  }

  return params;
}

/** Best-effort message extraction from native / non-Error throws (for logs). */
export function formatLoadError(err: unknown): string {
  if (err instanceof Error) {
    const msg = (err.message || '').trim();
    if (msg && msg.toLowerCase() !== 'unknown error') {
      return truncateForLog(msg);
    }
    // Native bridges often throw Error("Unknown error") — dig for anything richer.
    const anyErr = err as Error & Record<string, unknown>;
    for (const key of ['code', 'userInfo', 'nativeStackAndroid', 'cause']) {
      const val = anyErr[key];
      if (typeof val === 'string' && val.trim()) {
        return truncateForLog(`${msg || 'Unknown error'} (${val})`);
      }
      if (val && typeof val === 'object') {
        try {
          const s = JSON.stringify(val);
          if (s && s !== '{}') return truncateForLog(`${msg || 'Unknown error'}: ${s}`);
        } catch {
          /* ignore */
        }
      }
    }
    if (err.name && err.name !== 'Error') {
      return truncateForLog(`${err.name}: ${msg || 'Unknown error'}`);
    }
    return msg || 'Unknown error';
  }
  if (typeof err === 'string') return truncateForLog(err);
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error', 'reason', 'code']) {
      if (typeof anyErr[key] === 'string' && (anyErr[key] as string).trim()) {
        return truncateForLog(anyErr[key] as string);
      }
    }
    try {
      return truncateForLog(JSON.stringify(err));
    } catch {
      /* fall through */
    }
  }
  return truncateForLog(String(err));
}

/** Keep log lines readable — full stacks belong in errorLogger, not status strings. */
function truncateForLog(text: string, maxLen = 500): string {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, maxLen - 1)}…`;
}
