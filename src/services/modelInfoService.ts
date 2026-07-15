import { loadLlamaModelInfo } from "llama.rn";

export type LlamaModelInfo = Awaited<ReturnType<typeof loadLlamaModelInfo>> | null;

/**
 * Load model info in a safe way for diagnostics and quant detection.
 *
 * This wraps llama.rn's loadLlamaModelInfo and never throws – on failure
 * it returns null and (in DEV) logs the error.
 */
export const getModelInfo = async (modelUri: string): Promise<LlamaModelInfo> => {
  try {
    const info = await loadLlamaModelInfo(modelUri);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      const keys =
        info && typeof info === "object"
          ? Object.keys(info as Record<string, unknown>).slice(0, 12)
          : [];
      console.log("[ModelInfo] Loaded model info", { modelUri, keys });
    }
    return info;
  } catch (error) {
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[ModelInfo] Failed to load model info", {
        modelUri,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return null;
  }
};

/**
 * Best-effort quantization extraction from model info and/or file name.
 *
 * Examples:
 * - "smollm2-1.7b-instruct-q4_k_m.gguf"    => "Q4_K_M"
 * - "Llama-3.2-1B-Instruct-Q4_0.gguf"      => "Q4_0"
 * - "deepseek-r1-distill-qwen-7b-q6_k.gguf" => "Q6_K"
 * - "gemma-3-4b-it-qat-Q4_K_L.gguf"        => "Q4_K_L"
 *
 * Matches, in priority order:
 *   • K-quant with suffix:   Q4_K_M, Q4_K_S, Q4_K_L
 *   • K-quant plain:         Q2_K, Q6_K
 *   • Legacy bit_0/1 quants: Q4_0, Q4_1, Q8_0
 *
 * CRITICAL: The "_M/_S/_L" suffix must be matched before the bare "_K"
 * branch, otherwise "Q4_K_M" truncates to "Q4_K" and the acceleration
 * allow-list check (`isQuantAllowedForAndroidAccel`) misclassifies.
 */
export const detectQuantFromFilename = (fileName: string): string | null => {
  if (!fileName) return null;

  const patterns: RegExp[] = [
    /q[0-9]_k_[msl]/i,
    /q[0-9]_k/i,
    /q[0-9]_[01]/i,
  ];
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) return match[0].toUpperCase();
  }
  return null;
};

/**
 * Return true only for quantizations we consider safe to attempt Android acceleration with.
 *
 * Initial conservative allowlist:
 * - Q4_0
 * - Q6_K
 */
export const isQuantAllowedForAndroidAccel = (quant: string | null | undefined): boolean => {
  if (!quant) return false;
  const upper = quant.toUpperCase();
  return upper === "Q4_0" || upper === "Q6_K";
};

