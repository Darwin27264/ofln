/**
 * ModelSelectionScreen Component
 * 
 * Main screen for selecting and managing AI models.
 * Handles model browsing, downloading, loading, and configuration.
 * 
 * Performance optimizations:
 * - Memoized components and callbacks
 * - Efficient filtering with useMemo
 * - Optimized animations
 * - Lazy loading of models
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Animated,
  PanResponder,
  Pressable,
  BackHandler,
  Easing,
  ScrollView,
  Modal,
  InteractionManager,
} from "react-native";
import RNFS from "react-native-fs";
import axios from "axios";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { getModelSettings, saveModelSettings, ModelSettings } from "../services/modelSettingsService";
import { pick, isErrorWithCode, errorCodes } from "@react-native-documents/picker";
import { saveLocalModel, removeLocalModel, LocalModelInfo } from "../services/localModelService";
import { ModelCard, ModelInfo } from "../components/ModelCard";
import { useModelFilter } from "../hooks/useModelFilter";
import { prettifyModelName } from "../utils/modelUtils";

// Type for quantization options (used internally in this file)
interface QuantizationOption {
  fileName: string;
  size: number; // in bytes
  quantization: string; // e.g., "Q4_K_M", "Q5_K_M", etc.
}

interface ModelSelectionScreenProps {
  downloadedModels: string[];
  localModels: LocalModelInfo[];
  setLocalModels: (models: LocalModelInfo[]) => void;
  handleDownloadModel: (file: string, repoId: string, onProgress: (progress: number) => void) => Promise<void>;
  loadModel: (path: string, context: any, setContext: (context: any) => void) => Promise<boolean>;
  context: any;
  setContext: (context: any) => void;
  setCurrentPage: (page: "modelSelection" | "conversation" | "settings" | "stages") => void;
  checkDownloadedModels: () => Promise<void>;
  selectedGGUF: string | null;
  setSelectedGGUF: (gguf: string | null) => void;
}

// Removed utility functions - now imported from utils/modelUtils.ts

// Reputable Hugging Face authors for GGUF models
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
];

// Popular models optimized for mobile (pre-selected quantization)
const POPULAR_MODELS: ModelInfo[] = [
  {
    id: "qwen-25-05b",
    name: "Qwen2.5 0.5B Instruct",
    repoId: "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
    fileName: "qwen2.5-0.5b-instruct-q2_k.gguf",
    size: "0.3GB",
    description: "Ultra-compact 0.5B model. Extremely fast with surprisingly good quality for its size.",
    author: "Qwen",
    downloads: 30000,
    tags: ["instruct", "tiny", "ultra-fast"],
    publishedDate: "2024-09-12"
  },
  {
    id: "deepseek-r1d-15b",
    name: "DeepSeek R1 Distill Qwen 1.5B",
    repoId: "bartowski/DeepSeek-R1-Distill-Qwen-1.5B-GGUF",
    fileName: "deepseek-r1-distill-qwen-1.5b-q2_k.gguf",
    size: "0.9GB",
    description: "Compact reasoning model. Shows reasoning process in a smaller, faster package.",
    author: "bartowski",
    downloads: 25000,
    tags: ["reasoning", "thinking", "compact"],
    publishedDate: "2024-12-19"
  },
  {
    id: "llama-32-1b",
    name: "Llama 3.2 1B Instruct",
    repoId: "bartowski/Llama-3.2-1B-Instruct-GGUF",
    fileName: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    size: "0.7GB",
    description: "Ultra-fast, decent quality for 1B. Great for quick responses and basic tasks.",
    author: "bartowski",
    downloads: 50000,
    tags: ["instruct", "small", "fast"],
    publishedDate: "2024-12-10"
  },
  {
    id: "llama-32-3b",
    name: "Llama 3.2 3B Instruct",
    repoId: "bartowski/Llama-3.2-3B-Instruct-GGUF",
    fileName: "Llama-3.2-3B-Instruct-Q4_K_M.gguf",
    size: "2.1GB",
    description: "Great daily-driver at 3B. Balanced performance and quality for most tasks.",
    author: "bartowski",
    downloads: 75000,
    tags: ["instruct", "balanced", "general"],
    publishedDate: "2024-12-10"
  },
  {
    id: "phi-35-mini-38b",
    name: "Phi-3.5 Mini Instruct",
    repoId: "bartowski/Phi-3.5-mini-instruct-GGUF",
    fileName: "Phi-3.5-mini-instruct-Q4_K_M.gguf",
    size: "2.3GB",
    description: "Strong small-model reasoning/coding. Excellent for technical tasks and problem-solving.",
    author: "bartowski",
    downloads: 60000,
    tags: ["instruct", "reasoning", "coding"],
    publishedDate: "2024-04-23"
  },
  {
    id: "qwen-25-3b",
    name: "Qwen2.5 3B Instruct",
    repoId: "Qwen/Qwen2.5-3B-Instruct-GGUF",
    fileName: "qwen2.5-3b-instruct-q4_k_m.gguf",
    size: "2.0GB",
    description: "Multilingual + JSON-friendly. Supports multiple languages and structured outputs.",
    author: "Qwen",
    downloads: 80000,
    tags: ["instruct", "multilingual", "json"],
    publishedDate: "2024-09-12"
  },
  {
    id: "llama-31-8b",
    name: "Llama 3.1 8B Instruct",
    repoId: "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF",
    fileName: "Meta-Llama-3.1-8B-Instruct-Q4_K_S.gguf",
    size: "4.8GB",
    description: "Top 8B general quality. High-quality responses for complex conversations.",
    author: "bartowski",
    downloads: 120000,
    tags: ["instruct", "high-quality", "general"],
    publishedDate: "2024-07-23"
  },
  {
    id: "qwen-25-7b",
    name: "Qwen2.5 7B Instruct",
    repoId: "Qwen/Qwen2.5-7B-Instruct-GGUF",
    fileName: "qwen2.5-7b-instruct-q4_k_m.gguf",
    size: "4.2GB",
    description: "7B with strong code/math. Excellent for programming and mathematical tasks.",
    author: "Qwen",
    downloads: 90000,
    tags: ["instruct", "coding", "math"],
    publishedDate: "2024-09-12"
  },
  {
    id: "mistral-7b-v02",
    name: "Mistral 7B Instruct v0.2",
    repoId: "TheBloke/Mistral-7B-Instruct-v0.2-GGUF",
    fileName: "mistral-7b-instruct-v0.2.Q4_K_M.gguf",
    size: "4.1GB",
    description: "Reliable 7B classic. Proven performance with consistent quality outputs.",
    author: "TheBloke",
    downloads: 150000,
    tags: ["instruct", "reliable", "classic"],
    publishedDate: "2023-12-11"
  },
  {
    id: "gemma2-2b",
    name: "Gemma 2 2B Instruct",
    repoId: "bartowski/gemma-2-2b-it-GGUF",
    fileName: "gemma-2-2b-it-Q4_K_M.gguf",
    size: "1.4GB",
    description: "Tiny 'smart' mini from Google. Efficient and capable despite small size.",
    author: "bartowski",
    downloads: 40000,
    tags: ["instruct", "tiny", "efficient"],
    publishedDate: "2024-05-27"
  },
  {
    id: "qwen-25-coder-3b",
    name: "Qwen2.5 Coder 3B Instruct",
    repoId: "Qwen/Qwen2.5-Coder-3B-Instruct-GGUF",
    fileName: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
    size: "2.0GB",
    description: "Best small coder. Optimized for code generation and programming tasks.",
    author: "Qwen",
    downloads: 55000,
    tags: ["coder", "programming", "small"],
    publishedDate: "2024-09-12"
  },
  {
    id: "qwen-25-coder-7b",
    name: "Qwen2.5 Coder 7B Instruct",
    repoId: "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF",
    fileName: "qwen2.5-coder-7b-instruct-q4_k_m.gguf",
    size: "4.2GB",
    description: "Bigger coder, still mobile-viable. Advanced code generation capabilities.",
    author: "Qwen",
    downloads: 70000,
    tags: ["coder", "programming", "advanced"],
    publishedDate: "2024-09-12"
  },
  {
    id: "deepseek-r1d-7b",
    name: "DeepSeek R1 Distill Qwen 7B",
    repoId: "bartowski/DeepSeek-R1-Distill-Qwen-7B-GGUF",
    fileName: "deepseek-r1-distill-qwen-7b-q4_k_s.gguf",
    size: "4.5GB",
    description: "Distilled reasoning (slower/verbose). Shows reasoning process for complex problems.",
    author: "bartowski",
    downloads: 35000,
    tags: ["reasoning", "thinking", "verbose"],
    publishedDate: "2024-12-19"
  },
];

export default function ModelSelectionScreen(props: ModelSelectionScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  
  const {
    downloadedModels,
    localModels,
    setLocalModels,
    handleDownloadModel,
    loadModel,
    context,
    setContext,
    setCurrentPage,
    checkDownloadedModels,
    selectedGGUF,
    setSelectedGGUF,
  } = props;

  // State declarations
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [isHFPanelOpen, setIsHFPanelOpen] = useState(false);
  const [isFetchingHF, setIsFetchingHF] = useState<boolean>(false);
  const [hfModels, setHfModels] = useState<ModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  const [downloadCancellationTokens, setDownloadCancellationTokens] = useState<{ [key: string]: () => void }>({});
  
  // Pagination state for HuggingFace models
  const [currentAuthorIndex, setCurrentAuthorIndex] = useState<number>(0);
  const [processedRepos, setProcessedRepos] = useState<Set<string>>(new Set());
  const [hasMoreModels, setHasMoreModels] = useState<boolean>(true);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  
  // Filter state
  const [selectedModelType, setSelectedModelType] = useState<string | null>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
  const [customAuthor, setCustomAuthor] = useState<string>("");
  const [showAuthorInput, setShowAuthorInput] = useState<boolean>(false);
  
  // Use filtering hook for optimized model filtering
  const { filteredModels: filteredHfModels } = useModelFilter({
    models: hfModels,
    selectedModelType,
    selectedAuthor,
  });
  
  // Search ref to prevent concurrent searches
  const isSearchingRef = useRef<boolean>(false);
  
  // Refs to track latest state values for Load More functionality
  const currentAuthorIndexRef = useRef<number>(0);
  const processedReposRef = useRef<Set<string>>(new Set());
  const hfModelsRef = useRef<ModelInfo[]>([]);
  
  // Keep refs in sync with state
  useEffect(() => {
    currentAuthorIndexRef.current = currentAuthorIndex;
  }, [currentAuthorIndex]);
  
  useEffect(() => {
    processedReposRef.current = processedRepos;
  }, [processedRepos]);
  
  useEffect(() => {
    hfModelsRef.current = hfModels;
  }, [hfModels]);
  
  // Quantization selector state
  const [showQuantSelector, setShowQuantSelector] = useState<boolean>(false);
  const [selectedModelForDownload, setSelectedModelForDownload] = useState<ModelInfo | null>(null);
  
  // Dropdown state for model cards
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  
  // Model settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState<boolean>(false);
  const [selectedModelForSettings, setSelectedModelForSettings] = useState<ModelInfo | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [infoModalVisible, setInfoModalVisible] = useState<boolean>(false);
  const [infoModalContent, setInfoModalContent] = useState<{ title: string; explanation: string } | null>(null);

  // Animation state - tracks whether we're in the initial animation phase
  // Optimized: Reduced animation window and simplified logic for better mobile performance
  const isInitialAnimationPhase = useRef(true);
  const animatedModelIds = useRef<Set<string>>(new Set());
  
  useEffect(() => {
    // Reset animation state when component mounts
    isInitialAnimationPhase.current = true;
    animatedModelIds.current.clear();
    
    // Use InteractionManager to ensure animations start after initial render
    // Optimized: Reduced timeout from 1500ms to 800ms for faster UI responsiveness
    const interaction = InteractionManager.runAfterInteractions(() => {
      // Give enough time for initial cards to mount and start their animations
      // Cards that mount after this window will not animate (prevents lag)
      setTimeout(() => {
        isInitialAnimationPhase.current = false;
      }, 800); // Reduced from 1500ms for better performance
    });
    
    return () => {
      interaction.cancel();
      // Reset on unmount so animations play again when component remounts
      isInitialAnimationPhase.current = true;
      animatedModelIds.current.clear();
    };
  }, []);

  // Memoize screen dimensions to avoid recalculation
  const { screenHeight, panelHeight } = useMemo(() => {
    const height = Dimensions.get("window").height;
    return {
      screenHeight: height,
      panelHeight: height * 0.7,
    };
  }, []);

  const animatedValue = useRef(new Animated.Value(0)).current;

  // Memoize interpolations to avoid recalculation on every render
  const overlayOpacity = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.1],
      }),
    []
  );

  const panelTranslateY = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [panelHeight, 0],
      }),
    [panelHeight]
  );

  // PanResponder for drag-down close
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        const { dy } = gestureState;
        if (dy > 0) {
          animatedValue.setValue(1 - dy / panelHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const { dy } = gestureState;
        if (dy > panelHeight * 0.3) {
          closeHFPanel();
        } else {
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 250,
            easing: Easing.bezier(0.4, 0.0, 0.2, 1),
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Android hardware back handling
  const handleBackPress = useCallback(() => {
    if (isHFPanelOpen) {
      closeHFPanel();
      return true;
    }
    return false;
  }, [isHFPanelOpen]);

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      handleBackPress
    );
    return () => subscription.remove();
  }, [handleBackPress]);

  /**
   * Opens the HuggingFace model browser panel
   * Optimized: Deferred heavy operations to prevent blocking UI thread
   */
  function openHFPanel() {
    setIsHFPanelOpen(true);
    // Reset filters when opening panel
    setSelectedModelType(null);
    setSelectedAuthor(null);
    setCustomAuthor("");
    setShowAuthorInput(false);
    
    // Start animation immediately for smooth opening
    // Optimized: Reduced duration from 250ms to 200ms for snappier feel
    Animated.timing(animatedValue, {
      toValue: 1,
      duration: 200, // Reduced from 250ms for better mobile performance
      easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
      useNativeDriver: true,
    }).start();

    // Defer heavy operations until after animation starts
    // This prevents blocking the UI thread during animation
    InteractionManager.runAfterInteractions(() => {
      // Reset pagination state when opening panel (refs will be reset by fetchHFModels)
      setCurrentAuthorIndex(0);
      setProcessedRepos(new Set());
      setHfModels([]);
      setHasMoreModels(true);
      // Fetch models after animation has started
      fetchHFModels(true);
    });
  }

  /**
   * Closes the HuggingFace model browser panel
   * Optimized: Faster close animation for better responsiveness
   */
  function closeHFPanel() {
    Animated.timing(animatedValue, {
      toValue: 0,
      duration: 150, // Reduced from 200ms for snappier close animation
      useNativeDriver: true,
      easing: Easing.bezier(0.4, 0.0, 1, 1), // Material Design easing
    }).start(() => {
      setIsHFPanelOpen(false);
    });
  }

  // Fetch models from HuggingFace using reputable authors
  // Accepts optional authorOverride to avoid state race conditions
  const fetchHFModels = useCallback(async (reset: boolean = false, authorOverride?: string | null) => {
    // Prevent concurrent searches
    if (isSearchingRef.current && reset) {
      return;
    }
    
    if (reset) {
      isSearchingRef.current = true;
      setIsFetchingHF(true);
      setCurrentAuthorIndex(0);
      currentAuthorIndexRef.current = 0;
      setProcessedRepos(new Set());
      processedReposRef.current = new Set();
      setHfModels([]);
      hfModelsRef.current = [];
      setHasMoreModels(true);
    } else {
      setIsLoadingMore(true);
    }

    try {
      const newModels: ModelInfo[] = [];
      
      // Determine which authors to fetch from
      // Use authorOverride if provided (for clearing), otherwise use selectedAuthor from state
      const activeAuthor = authorOverride !== undefined ? authorOverride : selectedAuthor;
      
      // Use refs to get the latest values (avoids stale closure issues)
      const currentProcessed = reset ? new Set<string>() : new Set(processedReposRef.current);
      const existingModelIds = reset ? new Set<string>() : new Set(hfModelsRef.current.map(m => m.id));
      const existingModelKeys = reset ? new Set<string>() : new Set(
        hfModelsRef.current.map(m => `${m.id}:${m.fileName}`)
      );
      let authorIndex = reset ? 0 : currentAuthorIndexRef.current;
      const modelsPerPage = 10; // Number of models to load per "Load More" action
      let modelsFound = 0;

      const authorsToFetch = activeAuthor 
        ? [activeAuthor] // If custom author is selected, only fetch from that author
        : REPUTABLE_AUTHORS; // Otherwise, use reputable authors

      // Fetch models from authors
      while (authorIndex < authorsToFetch.length && modelsFound < modelsPerPage) {
        const author = authorsToFetch[authorIndex];
        
        try {
          // Try multiple search strategies to find models by this author
          // Strategy 1: Search with author name (most common)
          // Strategy 2: Search with "author/" prefix
          // Strategy 3: Try with different case variations
          let modelBatch: any[] = [];
          let allModelsFound = false;
          
          // Try different search strategies to find models by this author
          // The HuggingFace API search parameter searches across model IDs, tags, and descriptions
          // We need to filter client-side to ensure we only get models by this author
          const searchStrategies = [
            author, // Just the author name (most common)
            `${author}/`, // Author with slash prefix
          ];
          
          for (const searchTerm of searchStrategies) {
            if (allModelsFound || modelBatch.length >= 50) break; // Stop if we have enough models
            
            try {
              const response = await axios.get(
                `https://huggingface.co/api/models`,
                {
                  params: {
                    search: searchTerm,
                    sort: "downloads",
                    direction: -1,
                    limit: 100, // Get more results to filter from
                  },
                  timeout: 15000, // Increased timeout
                }
              );

              // Handle different response formats
              let responseData: any[] = [];
              if (Array.isArray(response.data)) {
                responseData = response.data;
              } else if (response.data && Array.isArray(response.data.models)) {
                responseData = response.data.models;
              } else if (response.data && response.data.results && Array.isArray(response.data.results)) {
                responseData = response.data.results;
              }
              
              // Filter to only models that actually belong to this author
              // Model IDs in HuggingFace follow the format "author/model-name"
              const authorLower = author.toLowerCase();
              const authorModels = responseData.filter((model: any) => {
                if (!model?.id) return false;
                const modelId = model.id.toLowerCase();
                // Check if model ID starts with "author/" (case-insensitive)
                // This ensures we only get models by this specific author
                return modelId.startsWith(authorLower + "/");
              });
              
              // Add unique models to our batch
              const existingIds = new Set(modelBatch.map(m => m.id));
              for (const model of authorModels) {
                if (!existingIds.has(model.id)) {
                  modelBatch.push(model);
                  existingIds.add(model.id);
                }
              }
              
              // If we found models with this strategy, we can stop trying others
              if (authorModels.length > 0) {
                allModelsFound = true;
                console.log(`Found ${authorModels.length} models for author "${author}" using search term "${searchTerm}"`);
                break;
              }
            } catch (searchError: any) {
              // Continue to next strategy if this one fails
              const errorMsg = searchError?.response?.status 
                ? `HTTP ${searchError.response.status}` 
                : searchError?.message || 'Unknown error';
              console.log(`Search strategy "${searchTerm}" failed for author ${author}: ${errorMsg}`);
              continue;
            }
          }
          
          // If no models found with search strategies, log for debugging
          if (modelBatch.length === 0) {
            console.warn(`⚠️ No models found for author "${author}" after trying all search strategies`);
            console.log(`Tried search terms: ${searchStrategies.join(', ')}`);
            // Continue to next author - the search might not work for all authors
            // This could be due to API limitations or author name variations
          } else {
            console.log(`✅ Found ${modelBatch.length} total models for author "${author}"`);
          }
          
          // Now process the filtered models
          for (const model of modelBatch) {
            // Double-check: Ensure the model ID starts with the author name
            if (!model?.id || !model.id.toLowerCase().startsWith(author.toLowerCase() + "/")) {
              continue;
            }
            
            // Skip if we've already processed this model ID
            if (currentProcessed.has(model.id) || existingModelIds.has(model.id)) {
              continue;
            }
            
            // Skip if we've already found enough models for this batch
            if (modelsFound >= modelsPerPage) {
              break;
            }
            
            try {
              // Get model files with a timeout and error handling
              let filesResponse;
              try {
                filesResponse = await axios.get(
                  `https://huggingface.co/api/models/${model.id}`,
                  { 
                    timeout: 8000, // Increased timeout
                    validateStatus: (status) => status < 500, // Don't throw on 4xx errors
                  }
                );
              } catch (fetchError: any) {
                // Handle network errors, timeouts, etc.
                const modelId = model?.id || "unknown";
                const errorMsg = fetchError?.response?.status 
                  ? `HTTP ${fetchError.response.status}` 
                  : fetchError?.message || 'Network error';
                console.warn(`⚠️ Failed to fetch model files for ${modelId}: ${errorMsg}`);
                continue; // Skip this model and continue to next
              }
              
              // Check for API errors (401, 403, 404, etc.)
              if (filesResponse?.status === 401 || filesResponse?.status === 403) {
                // Model requires authentication - skip it
                const modelId = model?.id || "unknown";
                console.log(`🔒 Model ${modelId} requires authentication - skipping`);
                continue;
              }
              
              if (filesResponse?.status === 404) {
                // Model not found - skip it
                const modelId = model?.id || "unknown";
                console.log(`❌ Model ${modelId} not found - skipping`);
                continue;
              }
              
              // Validate response data exists
              if (!filesResponse?.data) {
                const modelId = model?.id || "unknown";
                console.warn(`⚠️ No data returned for model ${modelId} - skipping`);
                continue;
              }
              
              const siblings = filesResponse.data?.siblings || [];
              
              // Validate siblings is an array
              if (!Array.isArray(siblings)) {
                const modelId = model?.id || "unknown";
                console.warn(`⚠️ Invalid siblings data for model ${modelId} - skipping`);
                continue;
              }
              
              // Get all GGUF files, not just specific quantizations
              const allGgufFiles = siblings.filter((f: any) => {
                if (!f || typeof f !== 'object') return false;
                const filename = f.rfilename?.toLowerCase() || "";
                return filename.endsWith(".gguf");
              });

              if (!allGgufFiles || allGgufFiles.length === 0) {
                // No GGUF files found - skip this model
                continue;
              }
              
              try {
                // Filter for mobile-friendly quantizations
                const mobileQuants = allGgufFiles.filter((f: any) => {
                  if (!f || !f.rfilename) return false;
                  const filename = f.rfilename.toLowerCase() || "";
                  return filename.includes("q4_k_m") || filename.includes("q4_k_s") || 
                         filename.includes("q5_k_m") || filename.includes("q8_0") ||
                         filename.includes("q3_k_m") || filename.includes("q2_k") ||
                         filename.includes("q4_0") || filename.includes("q5_0");
                });

                // If no mobile-friendly quants, use all GGUF files
                const ggufFiles = mobileQuants.length > 0 ? mobileQuants : allGgufFiles;

                // Prefer Q4_K_M for mobile, then Q4_K_S, then Q5_K_M, then Q8_0, then Q3_K_M
                const preferredFile = ggufFiles.find((f: any) => 
                  f?.rfilename?.toLowerCase().includes("q4_k_m")
                ) || ggufFiles.find((f: any) => 
                  f?.rfilename?.toLowerCase().includes("q4_k_s")
                ) || ggufFiles.find((f: any) => 
                  f?.rfilename?.toLowerCase().includes("q5_k_m")
                ) || ggufFiles.find((f: any) => 
                  f?.rfilename?.toLowerCase().includes("q8_0")
                ) || ggufFiles.find((f: any) => 
                  f?.rfilename?.toLowerCase().includes("q3_k_m")
                ) || ggufFiles[0];

                // Validate preferredFile exists and has required properties
                if (!preferredFile || !preferredFile.rfilename) {
                  const modelId = model?.id || "unknown";
                  console.warn(`⚠️ No valid file found for model ${modelId} - skipping`);
                  continue;
                }

                // Create a unique key for this model+file combination
                const modelKey = `${model.id}:${preferredFile.rfilename}`;
                
                // Skip if we already have this exact model+file combination
                if (existingModelKeys.has(modelKey)) {
                  continue;
                }

                // Extract quantization info from all GGUF files with error handling
                let availableQuants: QuantizationOption[] = [];
                try {
                  const quantOptions: (QuantizationOption | null)[] = ggufFiles
                    .filter((f: any) => f && f.rfilename) // Filter out invalid files
                    .map((f: any) => {
                      try {
                        const filename = f.rfilename || "";
                        // Extract quantization from filename
                        const quantMatch = filename.match(/(q[0-9]_[km]|q[0-9]_[0-9]|q[0-9]k_[ms]|q[0-9]k_m|q[0-9]k_s)/i);
                        const quantization = quantMatch ? quantMatch[0].toUpperCase() : "UNKNOWN";
                        
                        return {
                          fileName: f.rfilename,
                          size: f.size || 0,
                          quantization: quantization,
                        } as QuantizationOption;
                      } catch (quantError) {
                        // Skip invalid quantization entries
                        return null;
                      }
                    });
                  
                  // Filter out null values and sort
                  availableQuants = quantOptions
                    .filter((q): q is QuantizationOption => q !== null)
                    .sort((a: QuantizationOption, b: QuantizationOption) => {
                      // Sort by quantization quality (rough estimate)
                      const quantOrder: { [key: string]: number } = {
                        "Q2_K": 1, "Q3_K_M": 2, "Q3_K_S": 2, "Q4_0": 3, "Q4_K_S": 4,
                        "Q4_K_M": 5, "Q5_0": 6, "Q5_K_S": 6, "Q5_K_M": 7, "Q8_0": 8
                      };
                      return (quantOrder[b.quantization] || 0) - (quantOrder[a.quantization] || 0);
                    });
                } catch (quantError) {
                  // If quantization extraction fails, use empty array
                  console.warn(`⚠️ Failed to extract quantization info for model ${model.id}`);
                  availableQuants = [];
                }

                const fileSize = preferredFile.size || 0;
                const sizeGB = fileSize > 0 ? (fileSize / 1024 / 1024 / 1024).toFixed(2) : undefined;

                // Extract a better name from the repo ID with error handling
                let repoName = model.id;
                let prettyName = "";
                try {
                  repoName = model.id.split("/").pop() || model.id;
                  prettyName = prettifyModelName(repoName);
                } catch (nameError) {
                  // If name extraction fails, use model ID
                  repoName = model.id;
                  prettyName = model.id;
                }
                
                // Extract author from model ID with error handling
                let author = "";
                try {
                  author = model.id.split("/")[0] || "";
                } catch (authorError) {
                  author = "";
                }

                // Create model info with all validations
                const modelInfo: ModelInfo = {
                  id: model.id,
                  name: prettyName || repoName,
                  repoId: model.id,
                  fileName: preferredFile.rfilename,
                  size: sizeGB ? `${sizeGB}GB` : undefined,
                  description: model.pipeline_tag || model.modelId || undefined,
                  author: author,
                  availableQuants: availableQuants,
                  downloads: model.downloads || undefined,
                  tags: Array.isArray(model.tags) ? model.tags : [],
                };
                
                newModels.push(modelInfo);
                currentProcessed.add(model.id);
                existingModelIds.add(model.id);
                existingModelKeys.add(modelKey);
                modelsFound++;
              } catch (processingError) {
                // Handle errors during model processing
                const modelId = model?.id || "unknown";
                console.warn(`⚠️ Error processing model ${modelId}:`, processingError);
                continue; // Skip this model and continue
              }
            } catch (error: any) {
              // Catch-all for any unexpected errors
              const modelId = model?.id || "unknown";
              const errorMsg = error?.response?.status 
                ? `HTTP ${error.response.status}` 
                : error?.message || 'Unknown error';
              console.warn(`⚠️ Error fetching model ${modelId}: ${errorMsg}`);
              // Continue to next model - don't crash the app
              continue;
            }
          }
        } catch (error: any) {
          // Handle errors for this author gracefully - don't crash the app
          const errorMsg = error?.response?.status 
            ? `HTTP ${error.response.status}` 
            : error?.message || 'Unknown error';
          console.warn(`⚠️ Error fetching models from author "${author}": ${errorMsg}`);
          // Continue to next author - don't crash the app
        }

        authorIndex++;
      }

      // Filter out any duplicates before updating state (extra safety check)
      const uniqueNewModels = newModels.filter((model, index, self) => {
        const modelKey = `${model.id}:${model.fileName}`;
        return index === self.findIndex(m => `${m.id}:${m.fileName}` === modelKey);
      });

      // Update state and refs
      if (reset) {
        setHfModels(uniqueNewModels);
        hfModelsRef.current = uniqueNewModels;
      } else {
        setHfModels(prev => {
          // Additional safety: filter out any duplicates when merging
          const existingKeys = new Set(prev.map(m => `${m.id}:${m.fileName}`));
          const trulyNew = uniqueNewModels.filter(m => !existingKeys.has(`${m.id}:${m.fileName}`));
          const updated = [...prev, ...trulyNew];
          hfModelsRef.current = updated;
          return updated;
        });
      }
      
      // Update state and refs atomically
      setProcessedRepos(currentProcessed);
      processedReposRef.current = currentProcessed;
      setCurrentAuthorIndex(authorIndex);
      currentAuthorIndexRef.current = authorIndex;
      // If custom author is selected, we only have one author, so no more models after first batch
      setHasMoreModels(activeAuthor ? false : authorIndex < REPUTABLE_AUTHORS.length);
    } catch (error: any) {
      // Comprehensive error handling - prevent app crashes
      console.error("Error fetching HuggingFace models:", error);
      const errorMsg = error?.response?.status 
        ? `HTTP ${error.response.status}` 
        : error?.message || 'Unknown error';
      console.error(`Full error details: ${errorMsg}`);
      
      // Only show alert on reset (initial load), not on "Load More"
      if (reset) {
        try {
          const activeAuthor = authorOverride !== undefined ? authorOverride : selectedAuthor;
          showAlert(
            "Error", 
            activeAuthor 
              ? `No models found for author "${activeAuthor}". Please check the author name and try again.`
              : "Failed to fetch models from HuggingFace. Please check your internet connection and try again.",
            [{ text: "OK" }]
          );
        } catch (alertError) {
          // If alert fails, just log it - don't crash
          console.error("Failed to show error alert:", alertError);
        }
      }
    } finally {
      // Always reset loading states - critical for preventing UI lockups
      try {
        setIsFetchingHF(false);
        setIsLoadingMore(false);
        isSearchingRef.current = false;
      } catch (stateError) {
        // If state update fails, log it but don't crash
        console.error("Failed to reset loading states:", stateError);
      }
    }
  }, [selectedAuthor]);

  // Handle "Load More" button press
  const handleLoadMore = useCallback(() => {
    if (!isLoadingMore && hasMoreModels && !isSearchingRef.current) {
      fetchHFModels(false);
    }
  }, [isLoadingMore, hasMoreModels, fetchHFModels]);

  // Handle search button press
  const handleSearchAuthor = useCallback(() => {
    const trimmedAuthor = customAuthor.trim();
    if (trimmedAuthor) {
      setSelectedAuthor(trimmedAuthor);
      // Reset and refetch with new author - pass author directly to avoid state race condition
      fetchHFModels(true, trimmedAuthor);
    }
  }, [customAuthor, fetchHFModels]);

  // Handle clear search - resets everything and fetches all models
  const handleClearSearch = useCallback(() => {
    // Clear all search-related state
    setCustomAuthor("");
    setSelectedAuthor(null);
    setShowAuthorInput(false);
    
    // Reset pagination and fetch all models (pass null to explicitly clear author filter)
    fetchHFModels(true, null);
  }, [fetchHFModels]);

  const handleCancelDownload = useCallback((file: string) => {
    const cancelDownload = downloadCancellationTokens[file];
    if (cancelDownload) {
      cancelDownload();
      setDownloadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[file];
        return newProgress;
      });
      setDownloadCancellationTokens(prev => {
        const newTokens = { ...prev };
        delete newTokens[file];
        return newTokens;
      });
      setSelectedGGUF(null);
    }
  }, [downloadCancellationTokens, setSelectedGGUF]);

  const handleDeleteModel = useCallback(async (file: string) => {
    showAlert(
      "Confirm Delete",
      `Are you sure you want to delete ${file}?`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const filePath = `${RNFS.DocumentDirectoryPath}/${file}`;
              if (selectedGGUF === file) {
                setSelectedGGUF(null);
              }
              await RNFS.unlink(filePath);
              await checkDownloadedModels();
              // Close dropdown if this model was expanded
              setExpandedModelId(null);
            } catch (error) {
              console.error('Error deleting model:', error);
              showAlert("Error", "Failed to delete the model file.", [{ text: "OK" }]);
            }
          }
        }
      ],
      true
    );
  }, [selectedGGUF, setSelectedGGUF, checkDownloadedModels]);

  // Handle picking a local model file
  const handlePickLocalModel = useCallback(async () => {
    try {
      // Check if pick function is available
      if (!pick || typeof pick !== 'function') {
        console.error('pick function is not available. Package may need native linking. Please rebuild the app.');
        showAlert(
          "Setup Required", 
          "Document picker needs to be properly linked. Please rebuild the app:\n\n1. Stop the Metro bundler\n2. Run: npm install\n3. For Android: npx react-native run-android\n4. For iOS: cd ios && pod install && cd .. && npx react-native run-ios", 
          [{ text: "OK" }]
        );
        return;
      }

      const result = await pick({
        type: ['*/*'], // Allow all file types, we'll validate .gguf extension
      });

      // Handle both array and single object responses
      const pickedFile = Array.isArray(result) ? result[0] : result;
      
      if (pickedFile) {
        // The picker returns uri, name, and other properties
        const filePath = pickedFile.uri;
        const fileName = pickedFile.name || 'unknown.gguf';

        // Validate that it's a .gguf file
        if (!fileName.toLowerCase().endsWith('.gguf')) {
          showAlert("Error", "Please select a .gguf model file.", [{ text: "OK" }]);
          return;
        }

        if (!filePath) {
          showAlert("Error", "Could not access the selected file.", [{ text: "OK" }]);
          return;
        }

        // Check if file exists
        const fileExists = await RNFS.exists(filePath);
        if (!fileExists) {
          showAlert("Error", "Selected file does not exist or cannot be accessed.", [{ text: "OK" }]);
          return;
        }

        // Get file stats
        const stat = await RNFS.stat(filePath);
        if (!stat.isFile()) {
          showAlert("Error", "Selected item is not a file.", [{ text: "OK" }]);
          return;
        }

        // Save local model info
        const localModelInfo: LocalModelInfo = {
          fileName: fileName,
          filePath: filePath,
          addedDate: new Date().toISOString(),
          fileSize: stat.size,
        };

        await saveLocalModel(localModelInfo);
        await checkDownloadedModels();

        showAlert("Success", `Model "${fileName}" has been added successfully.`, [{ text: "OK" }]);
      }
    } catch (error: any) {
      // Handle different error types
      if (isErrorWithCode && isErrorWithCode(error)) {
        switch (error.code) {
          case errorCodes?.OPERATION_CANCELED:
            // User canceled - this is fine, don't show error
            return;
          case errorCodes?.IN_PROGRESS:
            showAlert("Info", "A file selection is already in progress.", [{ text: "OK" }]);
            return;
          case errorCodes?.UNABLE_TO_OPEN_FILE_TYPE:
            showAlert("Error", "Unable to open the selected file type.", [{ text: "OK" }]);
            return;
          default:
            console.error('Document picker error:', error);
            showAlert("Error", "Failed to pick model file. Please try again.", [{ text: "OK" }]);
            return;
        }
      }
      
      // Fallback error handling
      if (error?.message !== 'User canceled document picker' && error?.code !== 'DOCUMENT_PICKER_CANCELED' && error?.code !== 'OPERATION_CANCELED') {
        console.error('Error picking local model:', error);
        showAlert("Error", "Failed to pick model file. Please try again.", [{ text: "OK" }]);
      }
    }
  }, [checkDownloadedModels]);

  // Handle loading a local model
  const handleLoadLocalModel = useCallback(async (localModel: LocalModelInfo) => {
    setIsLoadingModel(true);
    setLoadingModelFile(localModel.fileName);
    try {
      // Verify file still exists
      const fileExists = await RNFS.exists(localModel.filePath);
      if (!fileExists) {
        showAlert("Error", "Model file no longer exists. It will be removed from your list.", [{ text: "OK" }]);
        await removeLocalModel(localModel.filePath);
        await checkDownloadedModels();
        return;
      }

      const success = await loadModel(localModel.filePath, context, setContext);
      if (success) {
        setSelectedGGUF(localModel.fileName);
        setCurrentPage("conversation");
      } else {
        showAlert("Error", "Failed to load the model.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error('Error loading local model:', error);
      showAlert("Error", "Failed to load the model.", [{ text: "OK" }]);
    } finally {
      setIsLoadingModel(false);
      setLoadingModelFile(null);
    }
  }, [loadModel, context, setContext, setSelectedGGUF, setCurrentPage, checkDownloadedModels]);

  // Handle deleting a local model
  const handleDeleteLocalModel = useCallback(async (localModel: LocalModelInfo) => {
    showAlert(
      "Confirm Remove",
      `Are you sure you want to remove "${localModel.fileName}" from your local models list? This will not delete the file from your device.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              if (selectedGGUF === localModel.fileName) {
                setSelectedGGUF(null);
              }
              await removeLocalModel(localModel.filePath);
              await checkDownloadedModels();
              // Close dropdown if this model was expanded
              setExpandedModelId(null);
            } catch (error) {
              console.error('Error removing local model:', error);
              showAlert("Error", "Failed to remove the model from your list.", [{ text: "OK" }]);
            }
          }
        }
      ],
      true
    );
  }, [selectedGGUF, setSelectedGGUF, checkDownloadedModels]);

  const handleOpenSettings = useCallback(async (model: ModelInfo) => {
    try {
      const settings = await getModelSettings(model.fileName);
      setModelSettings(settings);
      setSelectedModelForSettings(model);
      setShowSettingsModal(true);
      setExpandedModelId(null); // Close dropdown
    } catch (error) {
      console.error('Error loading model settings:', error);
      showAlert("Error", "Failed to load model settings.", [{ text: "OK" }]);
    }
  }, []);

  const handleSaveSettings = useCallback(async (settings: ModelSettings) => {
    if (!selectedModelForSettings) return;
    
    try {
      await saveModelSettings(selectedModelForSettings.fileName, settings);
      setModelSettings(settings);
      showAlert("Success", "Model settings saved successfully.", [{ text: "OK" }]);
    } catch (error) {
      console.error('Error saving model settings:', error);
      showAlert("Error", "Failed to save model settings.", [{ text: "OK" }]);
    }
  }, [selectedModelForSettings]);

  // Metric explanations
  const metricExplanations: { [key: string]: { title: string; explanation: string } } = {
    contextSize: {
      title: "Context Size (n_ctx)",
      explanation: "What it is:\nThe context size determines how many tokens (words/characters) the model can remember from the conversation history.\n\nEffects of tuning:\n• Higher values (4096-8192): Model remembers more conversation history, better for long conversations, but uses more memory\n• Lower values (512-1024): Uses less memory and is faster, but model forgets earlier parts of the conversation\n• Recommended: 2048-4096 for most use cases"
    },
    gpuLayers: {
      title: "GPU Layers (n_gpu_layers)",
      explanation: "What it is:\nControls how many layers of the neural network run on the GPU instead of CPU.\n\nEffects of tuning:\n• Higher values (4-8): Faster generation speed, but requires more GPU memory\n• Lower values (0-2): Uses less GPU memory, but generation is slower\n• 0: All processing on CPU (slowest but most compatible)\n• Recommended: Start with 1-2 and increase if you have GPU memory available"
    },
    temperature: {
      title: "Temperature",
      explanation: "What it is:\nControls the randomness and creativity of the model's responses.\n\nEffects of tuning:\n• Lower values (0.1-0.5): More focused, deterministic, and consistent responses. Better for factual tasks\n• Higher values (0.7-1.5): More creative, diverse, and unpredictable responses. Better for creative writing\n• Very high (1.5-2.0): May produce nonsensical or off-topic responses\n• Recommended: 0.7-0.9 for balanced responses"
    },
    topP: {
      title: "Top P (Nucleus Sampling)",
      explanation: "What it is:\nControls diversity by considering only tokens whose cumulative probability exceeds this threshold.\n\nEffects of tuning:\n• Lower values (0.1-0.5): More focused responses, considers fewer word choices\n• Higher values (0.7-0.95): More diverse responses, considers more word choices\n• Works together with temperature to control response quality\n• Recommended: 0.8-0.9 for most use cases"
    },
    topK: {
      title: "Top K",
      explanation: "What it is:\nLimits the model to consider only the top K most likely tokens when generating responses.\n\nEffects of tuning:\n• Lower values (1-10): More focused, predictable responses\n• Higher values (40-100): More diverse, creative responses\n• Setting too high may include unlikely tokens that reduce quality\n• Recommended: 40-60 for balanced quality and diversity"
    },
    repeatPenalty: {
      title: "Repeat Penalty",
      explanation: "What it is:\nPenalizes the model for repeating the same words or phrases.\n\nEffects of tuning:\n• Lower values (1.0-1.1): Model may repeat words or phrases more often\n• Higher values (1.2-1.5): Reduces repetition, but may make responses less natural if too high\n• Values above 1.5 may cause the model to avoid common words\n• Recommended: 1.1-1.2 for most use cases"
    },
    maxPredict: {
      title: "Max Predict Tokens (n_predict)",
      explanation: "What it is:\nThe maximum number of tokens the model will generate in a single response.\n\nEffects of tuning:\n• Lower values (128-512): Shorter responses, faster generation, less memory usage\n• Higher values (1024-4096): Longer responses, but slower and uses more memory\n• Setting too high may cause the model to ramble or go off-topic\n• Recommended: 512-2048 depending on your needs"
    }
  };

  const showMetricInfo = useCallback((metricKey: string) => {
    const info = metricExplanations[metricKey];
    if (info) {
      setInfoModalContent(info);
      setInfoModalVisible(true);
    }
  }, []);

  const handleModelDownload = useCallback(async (model: ModelInfo) => {
    const isDownloaded = downloadedModels.includes(model.fileName);
    
    if (isDownloaded) {
      // Load the model
      setIsLoadingModel(true);
      setLoadingModelFile(model.fileName);
      try {
        const modelPath = `${RNFS.DocumentDirectoryPath}/${model.fileName}`;
        const success = await loadModel(modelPath, context, setContext);
        if (success) {
          setSelectedGGUF(model.fileName);
          setCurrentPage("conversation");
        } else {
          showAlert("Error", "Failed to load the model.", [{ text: "OK" }]);
        }
      } catch (error) {
        console.error("Error loading model:", error);
        showAlert("Error", "Failed to load the model.", [{ text: "OK" }]);
      } finally {
        setIsLoadingModel(false);
        setLoadingModelFile(null);
      }
    } else {
      // Show quantization selector if multiple quants are available
      if (model.availableQuants && model.availableQuants.length > 1) {
        setSelectedModelForDownload(model);
        setShowQuantSelector(true);
      } else {
        // Download with default/preferred quantization
        const fileNameToDownload = model.fileName;
        showAlert(
          "Confirm Download",
          `Do you want to download ${model.name}?`,
          [
            {
              text: "No",
              style: "cancel",
            },
            {
              text: "Yes",
              onPress: async () => {
                try {
                  setDownloadProgress(prev => ({ ...prev, [fileNameToDownload]: 0 }));
                  
                  const controller = new AbortController();
                  setDownloadCancellationTokens(prev => ({
                    ...prev,
                    [fileNameToDownload]: () => controller.abort()
                  }));

                  await handleDownloadModel(fileNameToDownload, model.repoId, (progress) => {
                    setDownloadProgress(prev => ({ ...prev, [fileNameToDownload]: progress }));
                  });

                  setDownloadCancellationTokens(prev => {
                    const newTokens = { ...prev };
                    delete newTokens[fileNameToDownload];
                    return newTokens;
                  });

                  await checkDownloadedModels();
                } catch (error) {
                  if (error instanceof Error && error.name === 'AbortError') {
                    console.log(`Download cancelled for ${fileNameToDownload}`);
                  } else {
                    setDownloadProgress(prev => {
                      const newProgress = { ...prev };
                      delete newProgress[fileNameToDownload];
                      return newProgress;
                    });
                    showAlert("Error", "Failed to download the model.", [{ text: "OK" }]);
                  }
                }
              },
            },
          ],
          false
        );
      }
    }
  }, [downloadedModels, loadModel, context, setContext, setSelectedGGUF, setCurrentPage, handleDownloadModel, checkDownloadedModels]);

  /**
   * Render a model card with proper props
   * Uses the extracted ModelCard component for better performance
   */
  const renderModelCard = useCallback((model: ModelInfo, isDownloaded: boolean, index: number) => {
    const isDownloading = downloadProgress[model.fileName] !== undefined;
    const progress = downloadProgress[model.fileName] || 0;
    const isLoading = loadingModelFile === model.fileName && isLoadingModel;
    const modelKey = `${model.id}:${model.fileName}`;
    const isExpanded = expandedModelId === modelKey;
    
    return (
      <ModelCard
        model={model}
        isDownloaded={isDownloaded}
        index={index}
        isDownloading={isDownloading}
        progress={progress}
        isLoading={isLoading}
        onDownload={() => handleModelDownload(model)}
        onDelete={() => handleDeleteModel(model.fileName)}
        onCancel={() => handleCancelDownload(model.fileName)}
        onSettings={() => handleOpenSettings(model)}
        isExpanded={isExpanded}
        onToggleExpand={() => setExpandedModelId(isExpanded ? null : modelKey)}
        isInitialAnimationPhase={isInitialAnimationPhase.current}
        animatedModelIds={animatedModelIds}
      />
    );
  }, [downloadProgress, loadingModelFile, isLoadingModel, expandedModelId, handleModelDownload, handleDeleteModel, handleCancelDownload, handleOpenSettings, isInitialAnimationPhase, animatedModelIds]);

  // ModelCard component has been moved to src/components/ModelCard.tsx
  // This improves code organization and reusability

  // Memoize downloaded models info to avoid recalculation on every render
  const downloadedModelsInfo = useMemo(() => {
    return downloadedModels
      .map((fileName) => {
        // Try to find in popular models first
        const popularModel = POPULAR_MODELS.find((m) => m.fileName === fileName);
        if (popularModel) return popularModel;

        // Otherwise create a basic info object
        return {
          id: fileName,
          name: prettifyModelName(fileName),
          repoId: "",
          fileName: fileName,
        };
      })
      .filter((m) => m !== null) as ModelInfo[];
  }, [downloadedModels]);

  // Memoize filtered popular models to avoid recalculation
  const availablePopularModels = useMemo(() => {
    return POPULAR_MODELS.filter((model) => !downloadedModels.includes(model.fileName));
  }, [downloadedModels]);

  return (
    <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: theme.colors.background,
        zIndex: 1,
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 0,
      }}>
        <Text style={styles.settingsTitle}>Models</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView 
        style={{ 
          marginTop: 55,
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Local Models Section */}
        {localModels.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Local Models
            </Text>
            {localModels.map((localModel, index) => {
              const isExpanded = expandedModelId === `local_${localModel.fileName}`;
              const isLoading = isLoadingModel && loadingModelFile === localModel.fileName;
              const fileSizeGB = localModel.fileSize ? (localModel.fileSize / (1024 * 1024 * 1024)).toFixed(2) : '0';
              
              return (
                <View key={`local_${localModel.fileName}_${index}`} style={{ marginBottom: 12 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (!isLoading) {
                        setExpandedModelId(isExpanded ? null : `local_${localModel.fileName}`);
                      }
                    }}
                    style={{
                      backgroundColor: theme.colors.card,
                      borderRadius: 16,
                      padding: 16,
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 18,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            marginBottom: 4,
                          }}
                        >
                          {prettifyModelName(localModel.fileName)}
                        </Text>
                        <Text
                          style={{
                            fontSize: 14,
                            color: theme.colors.textSecondary,
                            fontFamily: "Poppins",
                          }}
                        >
                          {fileSizeGB} GB
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        {isLoading ? (
                          <ActivityIndicator size="small" color={theme.colors.primary} />
                        ) : (
                          <>
                            <TouchableOpacity
                              onPress={(e) => {
                                e.stopPropagation();
                                handleLoadLocalModel(localModel);
                              }}
                              style={{
                                backgroundColor: theme.colors.primary,
                                paddingVertical: 8,
                                paddingHorizontal: 16,
                                borderRadius: 8,
                              }}
                            >
                              <Text
                                style={{
                                  color: theme.colors.primaryText,
                                  fontSize: 14,
                                  fontWeight: "600",
                                  fontFamily: "Poppins",
                                }}
                              >
                                Load
                              </Text>
                            </TouchableOpacity>
                            <Icon
                              name={isExpanded ? "expand-less" : "expand-more"}
                              size={24}
                              color={theme.colors.textSecondary}
                            />
                          </>
                        )}
                      </View>
                    </View>
                    
                    {isExpanded && (
                      <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
                        <TouchableOpacity
                          onPress={() => handleDeleteLocalModel(localModel)}
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            paddingVertical: 10,
                          }}
                        >
                          <Icon name="delete" size={18} color={theme.colors.error} />
                          <Text
                            style={{
                              color: theme.colors.error,
                              fontSize: 14,
                              fontWeight: "600",
                              fontFamily: "Poppins",
                              marginLeft: 6,
                            }}
                          >
                            Remove from List
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Downloaded Section */}
        {downloadedModelsInfo.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Downloaded
            </Text>
            {downloadedModelsInfo.map((model, index) => (
              <View key={`${model.id}:${model.fileName}:${index}`}>
                {renderModelCard(model, true, index)}
              </View>
            ))}
          </View>
        )}

        {/* Popular Models Section */}
        <View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
              marginBottom: 12,
            }}
          >
            Popular Models
          </Text>
          {availablePopularModels.map((model, index) => {
            return (
              <View key={`${model.id}:${model.fileName}:${downloadedModelsInfo.length + index}`}>
                {renderModelCard(model, false, downloadedModelsInfo.length + index)}
              </View>
            );
          })}
        </View>

        {/* Add Models Buttons */}
        <View style={{ marginBottom: 12, flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={openHFPanel}
            style={{
              flex: 1,
              backgroundColor: theme.colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Icon name="cloud-download" size={24} color={theme.colors.primaryText} />
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
                marginLeft: 8,
              }}
            >
              HuggingFace
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            onPress={handlePickLocalModel}
            style={{
              flex: 1,
              backgroundColor: theme.colors.accent || theme.colors.primary,
              borderRadius: 16,
              paddingVertical: 16,
              paddingHorizontal: 20,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.2,
              shadowRadius: 8,
              elevation: 4,
            }}
          >
            <Icon name="folder" size={24} color="#fff" />
            <Text
              style={{
                color: "#fff",
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
                marginLeft: 8,
              }}
            >
              Local
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Back button */}
      <View style={{ position: "absolute", bottom: 20, left: 15 }}>
        <TouchableOpacity
          onPress={() => setCurrentPage("settings")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 20,
              fontFamily: "Poppins",
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>

      {/* HuggingFace Panel */}
      {isHFPanelOpen && (
        <Pressable
          onPress={closeHFPanel}
          style={[
            styles.overlay,
            {
              backgroundColor: theme.colors.overlay,
            },
          ]}
        >
          <Animated.View
            style={{
              flex: 1,
              opacity: overlayOpacity,
            }}
          />
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.bottomSheetContainer,
              {
                transform: [
                  {
                    translateY: panelTranslateY,
                  },
                ],
              },
            ]}
          >
            <Pressable
              style={styles.bottomSheetInner}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <Text style={styles.bottomSheetTitle}>Browse HuggingFace Models</Text>
                <TouchableOpacity
                  onPress={() => {
                    const hasActiveFilters = selectedModelType || selectedAuthor;
                    if (hasActiveFilters) {
                      // If filters are active, clear them and refetch all models
                      setSelectedModelType(null);
                      handleClearSearch();
                    } else {
                      // Toggle filter panel
                      const newShowState = !showAuthorInput;
                      setShowAuthorInput(newShowState);
                      if (!newShowState) {
                        setCustomAuthor("");
                      }
                    }
                  }}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    backgroundColor: (showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primary : theme.colors.surface,
                    borderWidth: 1,
                    borderColor: (showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primary : theme.colors.border,
                  }}
                >
                  <Icon 
                    name="filter-list" 
                    size={20} 
                    color={(showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primaryText : theme.colors.text} 
                  />
                </TouchableOpacity>
              </View>

              {/* Filters Section */}
              {(showAuthorInput || selectedModelType || selectedAuthor) && (
                <View style={{ marginBottom: 16 }}>
                  {/* Model Type Filters */}
                  <View style={{ marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontFamily: "Poppins", marginBottom: 8 }}>
                      Model Type
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexDirection: "row" }}>
                      {["All", "Coder", "Multimodal", "Instruct", "Chat", "Text Generation"].map((type) => {
                        const isSelected = selectedModelType === type || (selectedModelType === null && type === "All");
                        return (
                          <TouchableOpacity
                            key={type}
                            onPress={() => setSelectedModelType(type === "All" ? null : type)}
                            style={{
                              paddingHorizontal: 20,
                              paddingVertical: 12,
                              minHeight: 44, // Minimum touch target size for accessibility
                              borderRadius: 20,
                              marginRight: 10,
                              backgroundColor: isSelected ? theme.colors.primary : theme.colors.surface,
                              borderWidth: 1,
                              borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                              justifyContent: "center",
                              alignItems: "center",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 15,
                                color: isSelected ? theme.colors.primaryText : theme.colors.text,
                                fontFamily: "Poppins",
                                fontWeight: isSelected ? "600" : "500",
                              }}
                            >
                              {type}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Author Filter */}
                  <View>
                    <Text style={{ fontSize: 12, color: theme.colors.textSecondary, fontFamily: "Poppins", marginBottom: 8 }}>
                      Author
                    </Text>
                    {showAuthorInput ? (
                      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                        <TextInput
                          style={{
                            flex: 1,
                            backgroundColor: theme.colors.surface,
                            borderRadius: 20,
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            fontSize: 14,
                          }}
                          placeholder="Enter author name..."
                          placeholderTextColor={theme.colors.textTertiary}
                          value={customAuthor}
                          onChangeText={setCustomAuthor}
                          autoCapitalize="none"
                          autoCorrect={false}
                          onSubmitEditing={handleSearchAuthor}
                        />
                        <TouchableOpacity
                          onPress={handleSearchAuthor}
                          disabled={!customAuthor.trim() || isFetchingHF}
                          style={{
                            paddingHorizontal: 20,
                            paddingVertical: 10,
                            borderRadius: 20,
                            backgroundColor: customAuthor.trim() && !isFetchingHF ? theme.colors.primary : theme.colors.surface,
                            borderWidth: 1,
                            borderColor: customAuthor.trim() && !isFetchingHF ? theme.colors.primary : theme.colors.border,
                            opacity: (!customAuthor.trim() || isFetchingHF) ? 0.5 : 1,
                          }}
                        >
                          <Icon 
                            name="search" 
                            size={20} 
                            color={customAuthor.trim() && !isFetchingHF ? theme.colors.primaryText : theme.colors.text} 
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={handleClearSearch}
                          style={{
                            paddingHorizontal: 16,
                            paddingVertical: 10,
                            borderRadius: 20,
                            backgroundColor: theme.colors.surface,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
                        >
                          <Text style={{ 
                            color: theme.colors.text, 
                            fontFamily: "Poppins", 
                            fontSize: 14, 
                            fontWeight: "500" 
                          }}>
                            Clear
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        {selectedAuthor && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 12,
                              paddingVertical: 6,
                              borderRadius: 16,
                              backgroundColor: theme.colors.primary,
                              gap: 8,
                            }}
                          >
                            <Text style={{ color: theme.colors.primaryText, fontFamily: "Poppins", fontSize: 12, fontWeight: "600" }}>
                              {selectedAuthor}
                            </Text>
                            <TouchableOpacity
                              onPress={handleClearSearch}
                            >
                              <Icon name="close" size={16} color={theme.colors.primaryText} />
                            </TouchableOpacity>
                          </View>
                        )}
                        <TouchableOpacity
                          onPress={() => setShowAuthorInput(true)}
                          style={{
                            paddingHorizontal: 12,
                            paddingVertical: 6,
                            borderRadius: 16,
                            backgroundColor: theme.colors.surface,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <Icon name="person-add" size={16} color={theme.colors.text} />
                          <Text style={{ color: theme.colors.text, fontFamily: "Poppins", fontSize: 12 }}>
                            Custom Author
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {isFetchingHF && (
                <View style={{ alignItems: "center", marginVertical: 20 }}>
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                  <Text
                    style={{
                      marginTop: 8,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                    }}
                  >
                    Fetching models...
                  </Text>
                </View>
              )}

              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 32 }}
              >
                {(() => {
                  // Use filtered models from hook (optimized with memoization)
                  if (!isFetchingHF && filteredHfModels.length === 0 && hfModels.length > 0) {
                    return (
                      <Text
                        style={{
                          textAlign: "center",
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                          marginTop: 20,
                        }}
                      >
                        No models match the selected filters
                      </Text>
                    );
                  }

                  if (!isFetchingHF && filteredHfModels.length === 0 && hfModels.length === 0) {
                    return (
                      <Text
                        style={{
                          textAlign: "center",
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                          marginTop: 20,
                        }}
                      >
                        No models found
                      </Text>
                    );
                  }

                  return filteredHfModels.map((model, index) => {
                    const isDownloaded = downloadedModels.includes(model.fileName);
                    // Use a unique key combining model.id and fileName to prevent duplicate keys
                    // Since we filter duplicates, this combination should be unique
                    const uniqueKey = `${model.id}:${model.fileName}`;
                    return (
                      <View key={uniqueKey}>
                        {renderModelCard(model, isDownloaded, index)}
                      </View>
                    );
                  });
                })()}
                
                {/* Load More Button */}
                {!isFetchingHF && hasMoreModels && hfModels.length > 0 && (
                  <View style={{ marginTop: 16, marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={handleLoadMore}
                      disabled={isLoadingMore}
                      style={{
                        backgroundColor: theme.colors.primary,
                        borderRadius: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 20,
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: isLoadingMore ? 0.6 : 1,
                      }}
                    >
                      {isLoadingMore ? (
                        <>
                          <ActivityIndicator size="small" color={theme.colors.primaryText} style={{ marginRight: 8 }} />
                          <Text
                            style={{
                              color: theme.colors.primaryText,
                              fontSize: 16,
                              fontWeight: "600",
                              fontFamily: "Poppins",
                            }}
                          >
                            Loading...
                          </Text>
                        </>
                      ) : (
                        <>
                          <Icon name="expand-more" size={24} color={theme.colors.primaryText} />
                          <Text
                            style={{
                              color: theme.colors.primaryText,
                              fontSize: 16,
                              fontWeight: "600",
                              fontFamily: "Poppins",
                              marginLeft: 8,
                            }}
                          >
                            Load More Models
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
                
                {!hasMoreModels && hfModels.length > 0 && (
                  <View style={{ marginTop: 16, alignItems: "center" }}>
                    <Text
                      style={{
                        color: theme.colors.textSecondary,
                        fontSize: 14,
                        fontFamily: "Poppins",
                      }}
                    >
                      No more models available
                    </Text>
                  </View>
                )}
              </ScrollView>
            </Pressable>
          </Animated.View>
        </Pressable>
      )}

      {/* Quantization Selector Modal */}
      <Modal
        visible={showQuantSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowQuantSelector(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
          onPress={() => setShowQuantSelector(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 20,
              padding: 24,
              width: "100%",
              maxWidth: 500,
              maxHeight: "80%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Select Quantization
              </Text>
              <TouchableOpacity
                onPress={() => setShowQuantSelector(false)}
                style={{ padding: 4 }}
              >
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {selectedModelForDownload && (
              <>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "500",
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    marginBottom: 8,
                  }}
                >
                  {selectedModelForDownload.name}
                </Text>
                {selectedModelForDownload.author && (
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                      marginBottom: 16,
                    }}
                  >
                    by {selectedModelForDownload.author}
                  </Text>
                )}

                <ScrollView style={{ maxHeight: 400 }}>
                  {selectedModelForDownload.availableQuants && selectedModelForDownload.availableQuants.length > 0 ? (
                    selectedModelForDownload.availableQuants.map((quant, index) => {
                      const sizeGB = quant.size > 0 ? (quant.size / 1024 / 1024 / 1024).toFixed(2) : "Unknown";
                      const isRecommended = quant.quantization.includes("Q4_K_M") || quant.quantization.includes("Q4_K_S");
                      
                      return (
                        <TouchableOpacity
                          key={`${quant.fileName}-${index}`}
                          onPress={async () => {
                            setShowQuantSelector(false);
                            const fileNameToDownload = quant.fileName;
                            
                            showAlert(
                              "Confirm Download",
                              `Download ${selectedModelForDownload.name} (${quant.quantization})?\nSize: ${sizeGB}GB`,
                              [
                                {
                                  text: "Cancel",
                                  style: "cancel",
                                },
                                {
                                  text: "Download",
                                  onPress: async () => {
                                    try {
                                      setDownloadProgress(prev => ({ ...prev, [fileNameToDownload]: 0 }));
                                      
                                      const controller = new AbortController();
                                      setDownloadCancellationTokens(prev => ({
                                        ...prev,
                                        [fileNameToDownload]: () => controller.abort()
                                      }));

                                      await handleDownloadModel(fileNameToDownload, selectedModelForDownload.repoId, (progress) => {
                                        setDownloadProgress(prev => ({ ...prev, [fileNameToDownload]: progress }));
                                      });

                                      setDownloadCancellationTokens(prev => {
                                        const newTokens = { ...prev };
                                        delete newTokens[fileNameToDownload];
                                        return newTokens;
                                      });

                                      await checkDownloadedModels();
                                      setSelectedModelForDownload(null);
                                    } catch (error) {
                                      if (error instanceof Error && error.name === 'AbortError') {
                                        console.log(`Download cancelled for ${fileNameToDownload}`);
                                      } else {
                                        setDownloadProgress(prev => {
                                          const newProgress = { ...prev };
                                          delete newProgress[fileNameToDownload];
                                          return newProgress;
                                        });
                                        showAlert("Error", "Failed to download the model.", [{ text: "OK" }]);
                                      }
                                    }
                                  },
                                },
                              ],
                              false
                            );
                          }}
                          style={{
                            backgroundColor: theme.colors.surface,
                            borderRadius: 12,
                            padding: 16,
                            marginBottom: 12,
                            borderWidth: 1,
                            borderColor: isRecommended ? theme.colors.accent + "40" : theme.colors.border,
                          }}
                        >
                          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                                <Text
                                  style={{
                                    fontSize: 16,
                                    fontWeight: "600",
                                    color: theme.colors.text,
                                    fontFamily: "Poppins",
                                    marginRight: 8,
                                  }}
                                >
                                  {quant.quantization}
                                </Text>
                                {isRecommended && (
                                  <View
                                    style={{
                                      backgroundColor: theme.colors.accent + "20",
                                      paddingHorizontal: 6,
                                      paddingVertical: 2,
                                      borderRadius: 4,
                                    }}
                                  >
                                    <Text
                                      style={{
                                        fontSize: 10,
                                        color: theme.colors.accent,
                                        fontFamily: "Poppins",
                                        fontWeight: "600",
                                      }}
                                    >
                                      Recommended
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <Text
                                style={{
                                  fontSize: 12,
                                  color: theme.colors.textSecondary,
                                  fontFamily: "Poppins",
                                }}
                              >
                                {sizeGB}GB
                              </Text>
                            </View>
                            <Icon name="download" size={24} color={theme.colors.text} />
                          </View>
                        </TouchableOpacity>
                      );
                    })
                  ) : (
                    <Text
                      style={{
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                        fontFamily: "Poppins",
                        textAlign: "center",
                        padding: 20,
                      }}
                    >
                      No quantization options available
                    </Text>
                  )}
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Model Settings Modal */}
      <Modal
        visible={showSettingsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowSettingsModal(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
          onPress={() => setShowSettingsModal(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              maxHeight: "90%",
              paddingBottom: 20,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <ScrollView
              style={{ maxHeight: "90%" }}
              contentContainerStyle={{ padding: 20, paddingBottom: 8 }}
              showsVerticalScrollIndicator={true}
            >
              {/* Header */}
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "600",
                      color: theme.colors.text,
                      fontFamily: "Poppins",
                      marginBottom: 4,
                    }}
                  >
                    Model Settings
                  </Text>
                  {selectedModelForSettings && (
                    <Text
                      style={{
                        fontSize: 14,
                        color: theme.colors.textSecondary,
                        fontFamily: "Poppins",
                      }}
                    >
                      {selectedModelForSettings.name}
                    </Text>
                  )}
                </View>
              </View>

              {modelSettings && (
                <>
                  {/* System Prompt */}
                  <View style={{ marginBottom: 24 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: "600",
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        marginBottom: 8,
                      }}
                    >
                      System Prompt
                    </Text>
                    <TextInput
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 12,
                        padding: 12,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        minHeight: 100,
                        textAlignVertical: "top",
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.systemPrompt}
                      onChangeText={(text) => modelSettings && setModelSettings({ ...modelSettings, systemPrompt: text })}
                      multiline
                      placeholder="Enter system prompt..."
                      placeholderTextColor={theme.colors.textTertiary}
                    />
                  </View>

                  {/* Context Size */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Context Size (n_ctx)
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("contextSize")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.n_ctx}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[512, 1024, 2048, 4096, 8192].map((value) => (
                        <TouchableOpacity
                          key={value}
                          onPress={() => modelSettings && setModelSettings({ ...modelSettings, n_ctx: value })}
                          style={{
                            flex: 1,
                            backgroundColor: modelSettings.n_ctx === value ? theme.colors.primary : theme.colors.surface,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: modelSettings.n_ctx === value ? theme.colors.primary : theme.colors.border,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: modelSettings.n_ctx === value ? theme.colors.primaryText : theme.colors.text,
                              fontFamily: "Poppins",
                            }}
                          >
                            {value}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* GPU Layers */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          GPU Layers (n_gpu_layers)
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("gpuLayers")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.n_gpu_layers}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      {[0, 1, 2, 4, 8].map((value) => (
                        <TouchableOpacity
                          key={value}
                          onPress={() => modelSettings && setModelSettings({ ...modelSettings, n_gpu_layers: value })}
                          style={{
                            flex: 1,
                            backgroundColor: modelSettings.n_gpu_layers === value ? theme.colors.primary : theme.colors.surface,
                            paddingVertical: 10,
                            paddingHorizontal: 12,
                            borderRadius: 8,
                            alignItems: "center",
                            borderWidth: 1,
                            borderColor: modelSettings.n_gpu_layers === value ? theme.colors.primary : theme.colors.border,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: "600",
                              color: modelSettings.n_gpu_layers === value ? theme.colors.primaryText : theme.colors.text,
                              fontFamily: "Poppins",
                            }}
                          >
                            {value}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>

                  {/* Temperature */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Temperature
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("temperature")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.temperature.toFixed(1)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Text style={{ fontSize: 12, color: theme.colors.textTertiary, fontFamily: "Poppins", minWidth: 30 }}>0.0</Text>
                      <View style={{ flex: 1 }}>
                        <View style={{ position: "relative", height: 40, justifyContent: "center" }}>
                          <View
                            style={{
                              height: 4,
                              backgroundColor: theme.colors.surface,
                              borderRadius: 2,
                            }}
                          />
                          <View
                            style={{
                              position: "absolute",
                              left: `${(modelSettings.temperature / 2.0) * 100}%`,
                              width: 20,
                              height: 20,
                              borderRadius: 10,
                              backgroundColor: theme.colors.primary,
                              transform: [{ translateX: -10 }],
                            }}
                          />
                        </View>
                      </View>
                      <Text style={{ fontSize: 12, color: theme.colors.textTertiary, fontFamily: "Poppins", minWidth: 30 }}>2.0</Text>
                    </View>
                    <TextInput
                      style={{
                        marginTop: 8,
                        backgroundColor: theme.colors.surface,
                        borderRadius: 8,
                        padding: 10,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.temperature.toString()}
                      onChangeText={(text) => {
                        const value = parseFloat(text);
                        if (!isNaN(value) && value >= 0 && value <= 2.0 && modelSettings) {
                          setModelSettings({ ...modelSettings, temperature: value });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="0.0 - 2.0"
                    />
                  </View>

                  {/* Top P */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Top P
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("topP")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.top_p.toFixed(2)}
                      </Text>
                    </View>
                    <TextInput
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 8,
                        padding: 10,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.top_p.toString()}
                      onChangeText={(text) => {
                        const value = parseFloat(text);
                        if (!isNaN(value) && value >= 0 && value <= 1.0 && modelSettings) {
                          setModelSettings({ ...modelSettings, top_p: value });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="0.0 - 1.0"
                    />
                  </View>

                  {/* Top K */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Top K
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("topK")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.top_k}
                      </Text>
                    </View>
                    <TextInput
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 8,
                        padding: 10,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.top_k.toString()}
                      onChangeText={(text) => {
                        const value = parseInt(text);
                        if (!isNaN(value) && value >= 1 && value <= 100 && modelSettings) {
                          setModelSettings({ ...modelSettings, top_k: value });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="1 - 100"
                    />
                  </View>

                  {/* Repeat Penalty */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Repeat Penalty
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("repeatPenalty")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.repeat_penalty.toFixed(2)}
                      </Text>
                    </View>
                    <TextInput
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 8,
                        padding: 10,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.repeat_penalty.toString()}
                      onChangeText={(text) => {
                        const value = parseFloat(text);
                        if (!isNaN(value) && value >= 0 && value <= 2.0 && modelSettings) {
                          setModelSettings({ ...modelSettings, repeat_penalty: value });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="0.0 - 2.0"
                    />
                  </View>

                  {/* Max Predict Tokens */}
                  <View style={{ marginBottom: 24 }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: "600",
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                        >
                          Max Predict Tokens (n_predict)
                        </Text>
                        <TouchableOpacity
                          onPress={() => showMetricInfo("maxPredict")}
                          style={{ marginLeft: 8, padding: 4 }}
                        >
                          <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                      <Text
                        style={{
                          fontSize: 14,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {modelSettings.n_predict}
                      </Text>
                    </View>
                    <TextInput
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 8,
                        padding: 10,
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                        fontSize: 14,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                      value={modelSettings.n_predict.toString()}
                      onChangeText={(text) => {
                        const value = parseInt(text);
                        if (!isNaN(value) && value >= 1 && value <= 100000 && modelSettings) {
                          setModelSettings({ ...modelSettings, n_predict: value });
                        }
                      }}
                      keyboardType="numeric"
                      placeholder="1 - 100000"
                    />
                  </View>

                  {/* Action Buttons */}
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 16, marginBottom: 8 }}>
                    <TouchableOpacity
                      onPress={() => setShowSettingsModal(false)}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.surface,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.text,
                          fontSize: 16,
                          fontWeight: "600",
                          fontFamily: "Poppins",
                        }}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        if (modelSettings) {
                          handleSaveSettings(modelSettings);
                          setShowSettingsModal(false);
                        }
                      }}
                      style={{
                        flex: 1,
                        backgroundColor: theme.colors.primary,
                        paddingVertical: 14,
                        borderRadius: 12,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.primaryText,
                          fontSize: 16,
                          fontWeight: "600",
                          fontFamily: "Poppins",
                        }}
                      >
                        Save
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Info Modal for Metric Explanations */}
      <Modal
        visible={infoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
          onPress={() => setInfoModalVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 24,
              maxWidth: "90%",
              maxHeight: "80%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {infoModalContent && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "600",
                      color: theme.colors.text,
                      fontFamily: "Poppins",
                      flex: 1,
                    }}
                  >
                    {infoModalContent.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setInfoModalVisible(false)}
                    style={{ padding: 4, marginLeft: 12 }}
                  >
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ maxHeight: 400 }}
                  showsVerticalScrollIndicator={true}
                >
                  <View>
                    {infoModalContent.explanation.split('\n').map((line, index) => {
                      if (line.startsWith('•')) {
                        return (
                          <Text key={index} style={{ 
                            fontSize: 15,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            lineHeight: 24,
                            marginLeft: 8,
                            marginBottom: 4,
                          }}>
                            {line}
                          </Text>
                        );
                      } else if (line.trim() === '') {
                        return <View key={index} style={{ height: 8 }} />;
                      } else {
                        return (
                          <Text key={index} style={{ 
                            fontSize: 15,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            lineHeight: 24,
                            fontWeight: line.includes(':') ? '600' : '400',
                            marginBottom: 4,
                          }}>
                            {line}
                          </Text>
                        );
                      }
                    })}
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
