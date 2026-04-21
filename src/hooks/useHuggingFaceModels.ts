/**
 * useHuggingFaceModels Hook
 * 
 * Manages fetching and filtering models from HuggingFace API.
 * Handles pagination, filtering, and error states.
 * 
 * Performance optimizations:
 * - Uses refs to prevent stale closures
 * - Debounces API calls
 * - Caches results to avoid duplicate requests
 */

import { useState, useRef, useCallback } from "react";
import axios from "axios";
import { ModelInfo, prettifyModelName } from "../utils/modelUtils";

// Reputable Hugging Face authors for GGUF models
// Keep in sync with `REPUTABLE_AUTHORS` in screens/ModelSelectionScreen.tsx.
const REPUTABLE_AUTHORS = [
  "TheBloke",
  "bartowski",
  "QuantFactory",
  "hugging-quants",
  "lmstudio-community",
  "Qwen",
  "NousResearch",
  "mradermacher",
  "roleplaiapp",
  "unsloth",
  "xtuner",
  "mys",
  "KBlueLeaf",
  "second-state",
  "city96",
  // Vendor-official and first-party publishers
  "google",
  "HuggingFaceTB",
];

// Mobile-friendly quantization patterns
// Order is not significant — the first match wins via `Array.some`.
// Patterns intentionally exclude IQ*/UD-* unsloth "dynamic" variants and
// bfloat16/F16 to avoid surfacing files that are either experimental or
// too large for phone RAM. Keep conservative — users can still paste a
// custom HuggingFace URL to reach exotic quantizations.
const MOBILE_QUANT_PATTERNS = [
  /q4_k_m/i,
  /q4_k_s/i,
  /q4_0/i,
  /q4_1/i,
  /q5_k_m/i,
  /q5_k_s/i,
  /q5_0/i,
  /q6_k/i,
  /q8_0/i,
  /q2_k/i,
  /q3_k_s/i,
  /q3_k_m/i,
  /q3_k_l/i,
];

interface UseHuggingFaceModelsOptions {
  onError?: (error: Error) => void;
}

interface UseHuggingFaceModelsReturn {
  hfModels: ModelInfo[];
  isLoading: boolean;
  hasMoreModels: boolean;
  error: Error | null;
  fetchModels: (reset?: boolean, authorOverride?: string | null) => Promise<void>;
  loadMore: () => Promise<void>;
  clearError: () => void;
}

/**
 * Hook for managing HuggingFace model fetching and filtering
 */
export function useHuggingFaceModels(
  options: UseHuggingFaceModelsOptions = {}
): UseHuggingFaceModelsReturn {
  const [hfModels, setHfModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMoreModels, setHasMoreModels] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Refs to prevent stale closures and race conditions
  const isSearchingRef = useRef<boolean>(false);
  const currentAuthorIndexRef = useRef<number>(0);
  const processedReposRef = useRef<Set<string>>(new Set());
  const hfModelsRef = useRef<ModelInfo[]>([]);

  /**
   * Check if a file is a mobile-friendly GGUF file
   */
  const isMobileFriendlyGGUF = useCallback((fileName: string): boolean => {
    if (!fileName.toLowerCase().endsWith('.gguf')) {
      return false;
    }
    
    // Check if it matches any mobile-friendly quantization pattern
    return MOBILE_QUANT_PATTERNS.some(pattern => pattern.test(fileName));
  }, []);

  /**
   * Extract quantization info from a GGUF filename.
   *
   * Matches, in priority order:
   *   • K-quant with suffix:   Q4_K_M, Q4_K_S, Q4_K_L, Q5_K_M, Q3_K_L, ...
   *   • K-quant plain:         Q2_K, Q6_K
   *   • Legacy bit_0/1 quants: Q4_0, Q4_1, Q5_0, Q5_1, Q8_0
   *
   * Previous regex incorrectly truncated "Q4_K_M" → "Q4_K", breaking the
   * "Recommended" badge in the quantization selector.
   */
  const extractQuantizationFromFile = useCallback((fileName: string): string | null => {
    const patterns: RegExp[] = [
      /q[0-9]_k_[msl]/i,   // Q4_K_M / Q4_K_S / Q4_K_L
      /q[0-9]_k/i,         // Q2_K / Q6_K
      /q[0-9]_[01]/i,      // Q4_0 / Q4_1 / Q8_0
    ];
    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match) return match[0].toUpperCase();
    }
    return null;
  }, []);

  /**
   * Format file size to human-readable string
   */
  const formatFileSize = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }, []);

  /**
   * Fetch models from HuggingFace API
   * 
   * @param reset - If true, resets all state and starts fresh fetch
   * @param authorOverride - Optional author to fetch from (avoids state race conditions)
   */
  const fetchModels = useCallback(async (
    reset: boolean = false,
    authorOverride?: string | null
  ): Promise<void> => {
    // Prevent concurrent searches
    if (isSearchingRef.current) {
      return;
    }

    try {
      isSearchingRef.current = true;
      setIsLoading(true);
      setError(null);

      if (reset) {
        // Reset state for fresh fetch
        setHfModels([]);
        hfModelsRef.current = [];
        currentAuthorIndexRef.current = 0;
        processedReposRef.current.clear();
        setHasMoreModels(true);
      }

      // Determine which authors to search
      const authorsToSearch = authorOverride !== undefined 
        ? (authorOverride ? [authorOverride] : REPUTABLE_AUTHORS)
        : REPUTABLE_AUTHORS;

      const existingModelIds = reset 
        ? new Set<string>() 
        : new Set(hfModelsRef.current.map(m => m.id));

      const existingModelKeys = reset
        ? new Set<string>()
        : new Set(hfModelsRef.current.map(m => `${m.id}:${m.fileName}`));

      const newModels: ModelInfo[] = [];
      const processedRepos = new Set<string>();

      // Fetch from each author
      for (const author of authorsToSearch) {
        try {
          // Fetch repositories for this author
          const reposResponse = await axios.get(
            `https://huggingface.co/api/models?author=${author}&sort=downloads&direction=-1&limit=50`,
            { timeout: 10000 }
          );

          if (!Array.isArray(reposResponse.data)) {
            continue;
          }

          // Process each repository
          for (const repo of reposResponse.data) {
            const repoId = repo.id || repo.modelId;
            if (!repoId || processedRepos.has(repoId)) {
              continue;
            }

            processedRepos.add(repoId);

            try {
              // Fetch files for this repository
              const filesResponse = await axios.get(
                `https://huggingface.co/api/models/${repoId}`,
                { timeout: 10000 }
              );

              const siblings = filesResponse.data?.siblings || [];
              const ggufFiles = siblings.filter((f: any) => {
                const fileName = f.rfilename || f.filename || '';
                return isMobileFriendlyGGUF(fileName);
              });

              if (ggufFiles.length === 0) {
                continue;
              }

              // Get model metadata
              const modelName = repo.modelId || repoId;
              const modelDescription = repo.pipeline_tag || '';
              const downloads = repo.downloads || 0;
              const tags = repo.tags || [];
              const publishedDate = repo.createdAt || null;

              // Create model info for each GGUF file
              for (const file of ggufFiles) {
                const fileName = file.rfilename || file.filename || '';
                const fileSize = file.size || 0;
                const quantization = extractQuantizationFromFile(fileName);

                // Create unique model key
                const modelKey = `${repoId}:${fileName}`;
                if (existingModelKeys.has(modelKey)) {
                  continue;
                }

                // Get all available quantizations for this model
                const availableQuants = siblings
                  .filter((f: any) => {
                    const fName = f.rfilename || f.filename || '';
                    return isMobileFriendlyGGUF(fName);
                  })
                  .map((f: any) => ({
                    fileName: f.rfilename || f.filename || '',
                    size: f.size || 0,
                    quantization: extractQuantizationFromFile(f.rfilename || f.filename || '') || '',
                  }));

                const modelInfo: ModelInfo = {
                  id: repoId,
                  name: prettifyModelName(fileName) || modelName,
                  repoId,
                  fileName,
                  size: formatFileSize(fileSize),
                  description: modelDescription,
                  author,
                  availableQuants: availableQuants.length > 1 ? availableQuants : undefined,
                  downloads,
                  tags,
                  publishedDate,
                };

                newModels.push(modelInfo);
                existingModelKeys.add(modelKey);
              }
            } catch (repoError) {
              // Skip this repository if there's an error
              console.warn(`Error fetching repository ${repoId}:`, repoError);
              continue;
            }
          }
        } catch (authorError) {
          // Continue with next author if this one fails
          console.warn(`Error fetching models from author ${author}:`, authorError);
          continue;
        }
      }

      // Update state with new models
      if (reset) {
        setHfModels(newModels);
        hfModelsRef.current = newModels;
      } else {
        const updatedModels = [...hfModelsRef.current, ...newModels];
        setHfModels(updatedModels);
        hfModelsRef.current = updatedModels;
      }

      // Update processed repos
      processedReposRef.current = new Set([...processedReposRef.current, ...processedRepos]);

      // Check if we have more models to load
      if (newModels.length === 0) {
        setHasMoreModels(false);
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      if (options.onError) {
        options.onError(error);
      }
    } finally {
      setIsLoading(false);
      isSearchingRef.current = false;
    }
  }, [isMobileFriendlyGGUF, extractQuantizationFromFile, formatFileSize, options]);

  /**
   * Load more models (pagination)
   */
  const loadMore = useCallback(async (): Promise<void> => {
    if (!isLoading && hasMoreModels && !isSearchingRef.current) {
      await fetchModels(false);
    }
  }, [isLoading, hasMoreModels, fetchModels]);

  /**
   * Clear error state
   */
  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    hfModels,
    isLoading,
    hasMoreModels,
    error,
    fetchModels,
    loadMore,
    clearError,
  };
}

