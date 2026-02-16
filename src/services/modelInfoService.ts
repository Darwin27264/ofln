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
      console.log("[ModelInfo] Loaded model info", { modelUri, info });
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
 * - "smollm2-1.7b-instruct-q4_k_m.gguf" => "Q4_K_M"
 * - "Llama-3.2-1B-Instruct-Q4_0.gguf" => "Q4_0"
 * - "deepseek-r1-distill-qwen-7b-q6_k.gguf" => "Q6_K"
 */
export const detectQuantFromFilename = (fileName: string): string | null => {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();

  // Common GGUF quant patterns (keep conservative)
  const quantRegex =
    /(q[0-9]_0|q[0-9]_1|q[0-9]_2|q[0-9]_3|q[0-9]_4|q[0-9]_5|q[0-9]_6|q[0-9]_7|q[0-9]_8|q[0-9]_9|q[0-9]_k_m|q[0-9]_k_s|q[0-9]k_m|q[0-9]k_s)/i;

  const match = lower.match(quantRegex);
  if (!match) return null;

  return match[0].toUpperCase();
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

