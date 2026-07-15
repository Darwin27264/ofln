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

import { isThinkingModelForUi } from '../services/inference/modelFamily';

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
 * Canonical family detection lives in `src/services/inference/modelFamily.ts`.
 */
export function isThinkingModel(model: ModelInfo): boolean {
  return isThinkingModelForUi({
    id: model.id,
    fileName: model.fileName,
    description: model.description,
    tags: model.tags,
  });
}

/**
 * Label GGUF quants in the download picker.
 * Accel = Android OpenCL/Hexagon allowlist (Q4_0 / Q6_K).
 * Mobile = other solid phone-sized quants.
 */
export function getQuantRecommendLabel(quantization: string): 'Accel' | 'Mobile' | null {
  const q = (quantization || '').toUpperCase();
  if (q === 'Q4_0' || q === 'Q6_K') return 'Accel';
  if (q.includes('Q4_K_M') || q.includes('Q4_K_S')) return 'Mobile';
  return null;
}

/**
 * Clear all caches (useful for testing or memory management)
 */
export function clearModelCaches(): void {
  quantizationCache.clear();
  dateFormatCache.clear();
}

