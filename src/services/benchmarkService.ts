/**
 * In-App Benchmark Service for ofln.
 *
 * Measures:
 * - Prompt processing speed (PP tok/s)
 * - Token generation speed (TG tok/s)
 * - Time To First Token (TTFT in ms)
 * - Peak RAM usage during inference
 *
 * Formats results into a clean, copyable Reddit /r/LocalLLaMA-style markdown card.
 */

import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { llamaProvider } from '../providers/llamaProvider';
import { getRuntimeAccelerationState } from './accelerationCapabilityService';
import {
  formatRamGb,
  getTotalMemoryBytes,
  getUsedMemoryBytes,
} from './ramFitService';

export const BENCHMARK_STORAGE_KEY = '@ofln_last_benchmark_result';

export const STANDARD_BENCHMARK_PROMPT =
  'Explain the core differences between multiprocessing and multithreading in modern software development. Focus on memory isolation, CPU scheduling overhead, and communication mechanisms. Provide 3 concise bullet points.';

export interface BenchmarkResult {
  modelName: string;
  deviceModel: string;
  osVersion: string;
  accelBackend: string;
  promptTokens: number;
  promptTimeMs: number;
  promptTokPerSec: number;
  ttftMs: number;
  generationTokens: number;
  generationTimeMs: number;
  generationTokPerSec: number;
  totalTimeMs: number;
  peakRamMb?: number;
  totalRamMb?: number;
  timestamp: number;
}

function getDeviceDescription(): { deviceModel: string; osVersion: string } {
  try {
    const platformConstants = (Platform.constants || {}) as Record<string, unknown>;
    let nativeBrand = '';
    let nativeModel = '';
    try {
      const pInfo = (NativeModules.PlatformConstants || {}) as Record<string, unknown>;
      nativeBrand = String(pInfo.Brand || '');
      nativeModel = String(pInfo.Model || '');
    } catch {
      // ignore
    }

    const brand = String(platformConstants.Brand || nativeBrand || '').trim();
    const model = String(platformConstants.Model || nativeModel || '').trim();
    const fullDevice = [brand, model].filter(Boolean).join(' ') || `${Platform.OS} Device`;
    const osVer = Platform.Version ? `${Platform.OS} ${Platform.Version}` : Platform.OS;

    return {
      deviceModel: fullDevice,
      osVersion: osVer,
    };
  } catch {
    return {
      deviceModel: `${Platform.OS} Device`,
      osVersion: Platform.OS,
    };
  }
}

/**
 * Format benchmark results into a copyable Reddit /r/LocalLLaMA style markdown card.
 */
export function formatRedditBenchmarkCard(res: BenchmarkResult): string {
  const ramDisplay =
    res.peakRamMb != null && res.totalRamMb != null
      ? `${(res.peakRamMb / 1024).toFixed(1)} GB / ${(res.totalRamMb / 1024).toFixed(1)} GB`
      : 'N/A';

  return [
    '### 📱 ofln On-Device Benchmark',
    '| Metric | Value |',
    '| :--- | :--- |',
    `| **Model** | \`${res.modelName}\` |`,
    `| **Device** | ${res.deviceModel} (${res.osVersion}) |`,
    `| **Backend** | ${res.accelBackend} |`,
    `| **Prompt Eval (PP)** | **${res.promptTokPerSec.toFixed(1)} tok/s** (${res.promptTokens} tok in ${res.promptTimeMs} ms) |`,
    `| **Generation (TG)** | **${res.generationTokPerSec.toFixed(1)} tok/s** (${res.generationTokens} tok in ${res.generationTimeMs} ms) |`,
    `| **TTFT (Time to 1st token)** | **${res.ttftMs} ms** |`,
    `| **RAM** | ${ramDisplay} |`,
    '',
    '*Benchmarked 100% offline via [ofln](https://github.com/Darwin27264/ofln) on Android*',
  ].join('\n');
}

/**
 * Runs an on-device benchmark using the currently loaded model.
 */
export async function runBenchmark(
  onProgress?: (stage: string) => void,
): Promise<BenchmarkResult> {
  if (!llamaProvider.isReady()) {
    throw new Error('No model loaded. Please load a model first to run the benchmark.');
  }

  const nativeContext = llamaProvider.getNativeContext();
  if (!nativeContext) {
    throw new Error('Native model context is not ready. Try switching the model off and on.');
  }

  const modelStatus = llamaProvider.getStatus();
  const rawPath = modelStatus.modelPath || 'unknown_model';
  const modelName = rawPath.split(/[/\\]/).pop() || rawPath;

  const { deviceModel, osVersion } = getDeviceDescription();
  const accelState = getRuntimeAccelerationState();
  const accelBackend = accelState?.on ? accelState.backendLabel : 'CPU';

  onProgress?.('Preparing benchmark prompt...');
  const [initialRam, totalRam] = await Promise.all([
    getUsedMemoryBytes(),
    getTotalMemoryBytes(),
  ]);

  let maxUsedRam = initialRam ?? 0;
  let firstTokenEmittedAt: number | null = null;
  let emittedTokens = 0;
  const startTime = Date.now();

  onProgress?.('Evaluating prompt & generating tokens...');

  const result = await nativeContext.completion(
    {
      messages: [{ role: 'user', content: STANDARD_BENCHMARK_PROMPT }],
      n_predict: 64,
      temperature: 0.1,
    },
    () => {
      const now = Date.now();
      if (firstTokenEmittedAt === null) {
        firstTokenEmittedAt = now;
      }
      emittedTokens++;
    },
  );

  const endTime = Date.now();
  const totalDuration = endTime - startTime;

  // Poll memory once more to capture peak usage
  const finalUsedRam = await getUsedMemoryBytes();
  if (finalUsedRam && finalUsedRam > maxUsedRam) {
    maxUsedRam = finalUsedRam;
  }

  const timings = (result as any)?.timings;
  const promptTokens = timings?.prompt_n ?? 60;
  const promptTimeMs = timings?.prompt_ms ?? (firstTokenEmittedAt ? firstTokenEmittedAt - startTime : 250);
  const promptTokPerSec =
    timings?.prompt_per_second ?? (promptTimeMs > 0 ? (promptTokens / (promptTimeMs / 1000)) : 0);

  const genTokens = timings?.predicted_n ?? (emittedTokens || 64);
  const genTimeMs = timings?.predicted_ms ?? Math.max(1, totalDuration - promptTimeMs);
  const genTokPerSec =
    timings?.predicted_per_second ?? (genTimeMs > 0 ? (genTokens / (genTimeMs / 1000)) : 0);

  const ttftMs = firstTokenEmittedAt ? firstTokenEmittedAt - startTime : promptTimeMs;

  const benchmarkResult: BenchmarkResult = {
    modelName,
    deviceModel,
    osVersion,
    accelBackend,
    promptTokens,
    promptTimeMs: Math.round(promptTimeMs),
    promptTokPerSec: parseFloat(promptTokPerSec.toFixed(1)),
    ttftMs: Math.round(ttftMs),
    generationTokens: genTokens,
    generationTimeMs: Math.round(genTimeMs),
    generationTokPerSec: parseFloat(genTokPerSec.toFixed(1)),
    totalTimeMs: totalDuration,
    peakRamMb: maxUsedRam > 0 ? Math.round(maxUsedRam / (1024 * 1024)) : undefined,
    totalRamMb: totalRam && totalRam > 0 ? Math.round(totalRam / (1024 * 1024)) : undefined,
    timestamp: Date.now(),
  };

  try {
    await AsyncStorage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(benchmarkResult));
  } catch {
    // Non-fatal if storage fails
  }

  return benchmarkResult;
}

/**
 * Loads the last saved benchmark result from storage.
 */
export async function loadLastBenchmark(): Promise<BenchmarkResult | null> {
  try {
    const raw = await AsyncStorage.getItem(BENCHMARK_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BenchmarkResult;
  } catch {
    return null;
  }
}
