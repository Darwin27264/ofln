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
 * Extract quantization from fileName (e.g., "Q4_K_M", "Q5_K_M")
 * Uses caching to avoid repeated regex operations
 * 
 * @param fileName - Model file name
 * @returns Quantization string or null if not found
 */
export function extractQuantization(fileName: string): string | null {
  if (quantizationCache.has(fileName)) {
    return quantizationCache.get(fileName) || null;
  }
  
  const quantMatch = fileName.match(/(q[0-9]_[km]|q[0-9]_[0-9]|q[0-9]k_[ms]|q[0-9]k_m|q[0-9]k_s|q[0-9]_0)/i);
  const result = quantMatch ? quantMatch[0].toUpperCase() : null;
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
 * Determine if a model is a thinking/reasoning model
 * Thinking models show their reasoning process (e.g., DeepSeek R1)
 * 
 * @param model - Model info object
 * @returns True if model is a thinking model
 */
export function isThinkingModel(model: ModelInfo): boolean {
  const modelId = model.id.toLowerCase();
  const description = (model.description || '').toLowerCase();
  
  // Check for specific thinking model identifiers
  const thinkingModelIds = ['r1', 'deepseek-r1', 'r1d'];
  const thinkingDescriptionKeywords = ['distilled reasoning', 'reasoning (slower'];
  
  // Check if model ID contains thinking model identifiers
  if (thinkingModelIds.some(id => modelId.includes(id))) {
    return true;
  }
  
  // Check if description contains thinking-specific keywords
  if (thinkingDescriptionKeywords.some(keyword => description.includes(keyword))) {
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

