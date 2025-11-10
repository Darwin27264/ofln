/**
 * useModelFilter Hook
 * 
 * Manages filtering of models by type and author.
 * Uses memoization to optimize filter calculations.
 * 
 * Performance optimizations:
 * - Memoized filter functions
 * - Cached filter results
 * - Efficient string matching
 */

import { useMemo, useCallback } from "react";
import { ModelInfo } from "../utils/modelUtils";

interface UseModelFilterOptions {
  models: ModelInfo[];
  selectedModelType: string | null;
  selectedAuthor: string | null;
}

interface UseModelFilterReturn {
  filteredModels: ModelInfo[];
  matchesModelTypeFilter: (model: ModelInfo, modelType: string | null) => boolean;
  matchesAuthorFilter: (model: ModelInfo, author: string | null) => boolean;
}

/**
 * Check if a model matches the selected type filter
 * 
 * @param model - Model to check
 * @param modelType - Selected model type filter
 * @returns True if model matches the filter
 */
function matchesModelTypeFilter(model: ModelInfo, modelType: string | null): boolean {
  if (!modelType || modelType === "All") {
    return true;
  }
  
  // Normalize text for case-insensitive matching
  const modelName = model.name.toLowerCase();
  const modelId = model.id.toLowerCase();
  const tags = (model.tags || []).map((t: string) => t.toLowerCase());
  const description = (model.description || "").toLowerCase();
  const searchText = `${modelName} ${modelId} ${tags.join(" ")} ${description}`;
  
  // Type-specific filter logic
  switch (modelType) {
    case "Coder":
      return searchText.includes("coder") || searchText.includes("code") || tags.includes("code");
    case "Multimodal":
      return searchText.includes("multimodal") || searchText.includes("vision") || tags.includes("multimodal");
    case "Instruct":
      return searchText.includes("instruct") || tags.includes("instruct");
    case "Chat":
      return searchText.includes("chat") || tags.includes("chat");
    case "Text Generation":
      // Exclude instruct and chat models
      return !searchText.includes("instruct") && !searchText.includes("chat") && 
             !tags.includes("instruct") && !tags.includes("chat");
    default:
      return true;
  }
}

/**
 * Check if a model matches the selected author filter
 * 
 * @param model - Model to check
 * @param author - Selected author filter
 * @returns True if model matches the filter
 */
function matchesAuthorFilter(model: ModelInfo, author: string | null): boolean {
  if (!author) {
    return true;
  }
  return model.author?.toLowerCase() === author.toLowerCase();
}

/**
 * Hook for filtering models by type and author
 * 
 * @param options - Filter options
 * @returns Filtered models and filter functions
 */
export function useModelFilter(
  options: UseModelFilterOptions
): UseModelFilterReturn {
  const { models, selectedModelType, selectedAuthor } = options;

  /**
   * Memoized filter function to check if a model matches the selected type filter
   * Prevents recalculating filter logic on every render
   */
  const matchesModelTypeFilterMemoized = useCallback(
    (model: ModelInfo, modelType: string | null): boolean => {
      return matchesModelTypeFilter(model, modelType);
    },
    []
  );

  /**
   * Memoized filter function to check if a model matches the selected author filter
   */
  const matchesAuthorFilterMemoized = useCallback(
    (model: ModelInfo, author: string | null): boolean => {
      return matchesAuthorFilter(model, author);
    },
    []
  );

  /**
   * Memoized filtered models list - recalculates only when filters or models change
   * This is a critical performance optimization for mobile devices
   */
  const filteredModels = useMemo(() => {
    return models.filter((model) => {
      return matchesModelTypeFilter(model, selectedModelType) && 
             matchesAuthorFilter(model, selectedAuthor);
    });
  }, [models, selectedModelType, selectedAuthor]);

  return {
    filteredModels,
    matchesModelTypeFilter: matchesModelTypeFilterMemoized,
    matchesAuthorFilter: matchesAuthorFilterMemoized,
  };
}

