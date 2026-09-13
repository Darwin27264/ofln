/**
 * Shared llama.rn load-time performance knobs.
 * Used by both llamaProvider and the legacy llamaService loader.
 *
 * Emulator: stay minimal — optional KV quant + flash-attn have caused
 * init failures on some AVDs. Real devices get KV cache quant q8_0
 * (llama.rn `cache_type_k` / `cache_type_v` → llama.cpp `type_k` / `type_v`),
 * falling back to q4_0 on devices with ≤6GB total RAM.
 */

import { isAndroidEmulator } from './deviceEnv';

/** Total RAM at or below this uses q4_0 KV cache (bytes). */
export const LOW_RAM_TOTAL_BYTES = 6 * 1024 ** 3;

export type KvCacheType = 'q8_0' | 'q4_0';

export type InferencePerfParams = {
  flash_attn_type: 'auto' | 'on' | 'off';
  n_batch: number;
  /** llama.rn name for llama.cpp type_k */
  cache_type_k?: KvCacheType;
  /** llama.rn name for llama.cpp type_v */
  cache_type_v?: KvCacheType;
};

export type InferencePerfOptions = {
  /** Force emulator-safe knobs (no KV quant, flash off, tiny batch). */
  isEmulator?: boolean;
  /** Total device RAM in bytes. ≤ {@link LOW_RAM_TOTAL_BYTES} → q4_0. */
  totalMemoryBytes?: number | null;
};

/** Choose KV cache quant from total RAM (unknown RAM → q8_0). */
export function selectKvCacheType(
  totalMemoryBytes?: number | null,
): KvCacheType {
  if (
    typeof totalMemoryBytes === 'number' &&
    Number.isFinite(totalMemoryBytes) &&
    totalMemoryBytes > 0 &&
    totalMemoryBytes <= LOW_RAM_TOTAL_BYTES
  ) {
    return 'q4_0';
  }
  return 'q8_0';
}

/**
 * @param nGpuLayers - layers offloaded after platform gating (0 = CPU path)
 */
export function getInferencePerfParams(
  nGpuLayers: number,
  options?: InferencePerfOptions,
): InferencePerfParams {
  const emulator = options?.isEmulator ?? isAndroidEmulator();

  // Emulators: fewest knobs = highest chance initLlama succeeds.
  if (emulator) {
    return {
      flash_attn_type: 'off',
      n_batch: 128,
    };
  }

  const kv = selectKvCacheType(options?.totalMemoryBytes);

  return {
    flash_attn_type: nGpuLayers > 0 ? 'auto' : 'off',
    n_batch: nGpuLayers > 0 ? 512 : 256,
    cache_type_k: kv,
    cache_type_v: kv,
  };
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
    for (const key of [
      'code',
      'userInfo',
      'nativeStackAndroid',
      'cause',
      'userMessage',
      'details',
      'nativeMessage',
    ]) {
      const val = anyErr[key];
      if (typeof val === 'string' && val.trim()) {
        return truncateForLog(`${msg || 'Unknown error'} (${val})`);
      }
      if (val instanceof Error && val.message) {
        return truncateForLog(`${msg || 'Unknown error'} (cause: ${val.message})`);
      }
      if (val && typeof val === 'object') {
        try {
          const s = JSON.stringify(val);
          if (s && s !== '{}') {
            return truncateForLog(`${msg || 'Unknown error'}: ${s}`);
          }
        } catch {
          /* ignore */
        }
      }
    }
    try {
      const own = Object.getOwnPropertyNames(err);
      if (own.length > 0) {
        const dumped: Record<string, unknown> = {};
        for (const k of own) {
          if (k === 'stack') continue;
          dumped[k] = (err as Record<string, unknown>)[k];
        }
        const s = JSON.stringify(dumped);
        if (s && s !== '{}' && s !== '{"message":"Unknown error"}') {
          return truncateForLog(`${msg || 'Unknown error'}: ${s}`);
        }
      }
    } catch {
      /* ignore */
    }
    if (err.name && err.name !== 'Error') {
      return truncateForLog(`${err.name}: ${msg || 'Unknown error'}`);
    }
    return msg || 'Unknown error';
  }
  if (typeof err === 'string') {
    return truncateForLog(err);
  }
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
  if (s.length <= maxLen) {return s;}
  return `${s.slice(0, maxLen - 1)}…`;
}
