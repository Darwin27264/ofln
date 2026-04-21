/**
 * Model Utilities
 * 
 * Utility functions for model operations including:
 * - Name formatting
 * - Quantization extraction
 * - Date formatting
 * - Model type detection
 * 
 * Uses caching to optimize repeated operations.
 */

// Cache for quantization extraction to avoid repeated regex operations
const quantizationCache = new Map<string, string | null>();

// Cache for date formatting
const dateFormatCache = new Map<string, string>();

export interface ModelInfo {
  id: string;
  name: string;
  repoId: string;
  fileName: string;
  size?: string;
  description?: string;
  author?: string;
  availableQuants?: Array<{
    fileName: string;
    size: number;
    quantization: string;
  }>;
  downloads?: number;
  tags?: string[];
  publishedDate?: string;
}

/**
 * Prettify model file name by removing extension and formatting
 * Example: "model-q4_k_m.gguf" -> "model"
 */
export function prettifyModelName(fileName: string): string {
  let cleaned = fileName.replace(/\.[^.]+$/, "");
  cleaned = cleaned.replace(/-/g, " ");
  cleaned = cleaned.replace(/q4_k_m|q5_k_m|q8_0/gi, "").trim();
  return cleaned.trim();
}

/**
 * Extract quantization from a GGUF file name, e.g. "Q4_K_M", "Q5_K_S", "Q4_0".
 * Results are cached to avoid repeated regex work.
 *
 * Matches, in priority order:
 *   • K-quant with suffix:   Q4_K_M, Q4_K_S, Q4_K_L, Q5_K_M, ...
 *   • K-quant plain:         Q2_K, Q6_K
 *   • Legacy bit_0/1 quants: Q4_0, Q4_1, Q5_0, Q5_1, Q8_0
 */
export function extractQuantization(fileName: string): string | null {
  if (quantizationCache.has(fileName)) {
    return quantizationCache.get(fileName) || null;
  }

  const patterns: RegExp[] = [
    /q[0-9]_k_[msl]/i,
    /q[0-9]_k/i,
    /q[0-9]_[01]/i,
  ];
  let result: string | null = null;
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      result = match[0].toUpperCase();
      break;
    }
  }
  quantizationCache.set(fileName, result);
  return result;
}

/**
 * Format published date to readable string
 * Uses caching to avoid repeated date parsing
 * 
 * @param dateString - ISO date string (e.g., "2024-01-15")
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatPublishedDate(dateString: string): string {
  if (dateFormatCache.has(dateString)) {
    return dateFormatCache.get(dateString) || dateString;
  }
  
  try {
    const formatted = new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    dateFormatCache.set(dateString, formatted);
    return formatted;
  } catch {
    return dateString;
  }
}

/**
 * Determine if a model supports a "thinking" / chain-of-thought mode
 * where reasoning tokens are surfaced separately from the visible answer.
 *
 * Detection sources (in order, first match wins):
 *   1. Model ID / fileName substring match for known reasoning families:
 *      - DeepSeek R1 distills (R1, r1d)
 *      - Qwen3 family (qwen3, qwen3.5, qwen3-4b-instruct-2507)
 *      - QwQ reasoning line
 *      - SmolLM3 (optional /think reasoning mode)
 *   2. Explicit "thinking" tag in model.tags
 *   3. Description keywords
 *
 * Note: Gemma 3 / Gemma 3n and Phi-4 Mini do NOT emit <think> blocks
 * despite being strong at reasoning — they should return false here so
 * the UI doesn't show a reasoning-specific icon/affordance.
 */
export function isThinkingModel(model: ModelInfo): boolean {
  const modelId = model.id.toLowerCase();
  const fileName = (model.fileName || '').toLowerCase();
  const description = (model.description || '').toLowerCase();
  const tags = (model.tags || []).map((t) => t.toLowerCase());
  const haystack = `${modelId} ${fileName}`;

  const thinkingFamilyPatterns: RegExp[] = [
    /\br1\b/,
    /\br1d\b/,
    /deepseek-r1/,
    /qwen3(?![a-z])/, // qwen3, qwen3.5, qwen3-4b-...  (NOT qwen3n or qwen2.5)
    /qwq/,
    /smollm3/,
  ];

  if (thinkingFamilyPatterns.some((p) => p.test(haystack))) {
    return true;
  }

  if (tags.includes('thinking') || tags.includes('reasoning')) {
    return true;
  }

  const thinkingDescriptionKeywords = [
    'distilled reasoning',
    'reasoning (slower',
    'chain-of-thought',
  ];
  if (thinkingDescriptionKeywords.some((k) => description.includes(k))) {
    return true;
  }

  return false;
}

/**
 * Clear all caches (useful for testing or memory management)
 */
export function clearModelCaches(): void {
  quantizationCache.clear();
  dateFormatCache.clear();
}

