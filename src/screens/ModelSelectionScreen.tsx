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
  BackHandler,
  ScrollView,
  InteractionManager,
  Platform,
  StyleSheet,
} from "react-native";
import RNFS from "react-native-fs";
import { hfAxiosGet } from "../services/hfTokenService";
import {
  buildQuantOptions,
  filterMobileFriendlyGgufs,
  parseHuggingFaceUrl,
  pickPreferredGgufFile,
} from "../services/hfModelHelpers";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { FloatingBackButton } from "../components/FloatingBackButton";
import { BottomSheet } from "../components/BottomSheet";
import { SegmentedTabBar } from "../components/SegmentedTabBar";
import { FrostedPanel, SETTINGS_BLOCK } from "../components/FrostedGlass";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import { pick, isErrorWithCode, errorCodes } from "@react-native-documents/picker";
import { saveLocalModel, removeLocalModel, LocalModelInfo } from "../services/localModelService";
import { llamaProvider } from "../providers/llamaProvider";
import { ModelCard, ModelInfo } from "../components/ModelCard";
import { useModelFilter } from "../hooks/useModelFilter";
import { prettifyModelName, getQuantRecommendLabel } from "../utils/modelUtils";
import {
  createCancellationToken,
  DownloadCancellationToken,
  DownloadProgressInfo,
  discardPartialDownload,
  getPausedDownloadProgress,
  isDownloadPausedError,
  isDownloadCancelledError,
  listPausedDownloadNames,
} from "../api/model";
import {
  isDownloadCancelled,
  toUserFacingDownloadError,
  toUserFacingDownloadOrLoadError,
  toUserFacingLoadError,
  userFacingHttpError,
} from "../utils/userFacingErrors";
import { showLoadFailureAlert } from "../utils/loadFailureAlert";
import {
  classifyRamFitFromSize,
  getTotalMemoryBytes,
} from "../services/ramFitService";
import {
  checkDiskSpaceForDownload,
  diskPreflightAlertMessage,
  parseSizeToBytes,
} from "../utils/diskPreflight";
import {
  STARTER_SHELF_TITLE,
  STARTER_SHELF_TABS,
  findStarterByFileName,
  getAvailableStarterModels,
  getStarterShelfCatalog,
  type StarterShelfTabId,
} from "../services/starterModels";
import { formatDownloadProgressLine } from "../utils/downloadProgressFormat";
import {
  chromeFontForRole,
  DEFAULT_CHROME_SCALE,
  type ChromeScale,
} from "../utils/chromeScale";

const ADD_MODEL_TILE_HEIGHT = 96;
const ADD_MODEL_TILE_GAP = SETTINGS_BLOCK.gap;
const ADD_MODEL_TILE_GUTTER = SETTINGS_BLOCK.gutter;

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
  handleDownloadModel: (
    file: string,
    repoId: string,
    onProgress: (progress: number, info?: DownloadProgressInfo) => void,
    cancellationToken?: import("../api/model").DownloadCancellationToken,
    expectedBytes?: number | null,
    revision?: string | null,
    expectedSha256?: string | null,
  ) => Promise<void>;
  setContext: (context: any) => void;
  setCurrentPage: (page: "modelSelection" | "conversation" | "settings" | "stages" | "modelSettings" | "hfToken") => void;
  checkDownloadedModels: () => Promise<void>;
  selectedGGUF: string | null;
  setSelectedGGUF: (gguf: string | null) => void;
  onOpenModelSettings?: (model: ModelInfo) => void;
  /** Button / tile label density from Display preferences. */
  chromeScale?: ChromeScale;
  /** When set, opens Start here on this tab (consumed once on mount). */
  initialStarterShelfTab?: StarterShelfTabId;
  onStarterShelfTabConsumed?: () => void;
}

// Removed utility functions - now imported from utils/modelUtils.ts

/**
 * Curated shelf lives in `src/services/starterModels.ts` (Start here).
 * Authors below are for Hugging Face browse ranking only.
 */
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

export default function ModelSelectionScreen(props: ModelSelectionScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const iconCircleBg = theme.colors.card;
  const density = props.chromeScale ?? DEFAULT_CHROME_SCALE;

  const addModelLabelSize = chromeFontForRole("modelTile", density);
  const renderAddModelTile = (
    label: string,
    icon: string,
    onPress: () => void,
    touchStyle: object,
  ) => (
    <TouchableOpacity
      style={touchStyle}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityLabel={label.replace(/\n/g, " ")}
    >
      <FrostedPanel
        style={{
          flex: 1,
          height: "100%",
          padding: SETTINGS_BLOCK.padding,
          justifyContent: "flex-end",
        }}
      >
        <View style={[styles.blockIconCircle, { backgroundColor: iconCircleBg }]}>
          <Ionicons name={icon as any} size={18} color={theme.colors.text} />
        </View>
        {/* Full-width label (settings tiles reserve right:40 for info icons). */}
        <View style={[styles.blockTextContainer, { right: 15 }]}>
          <Text
            style={[
              styles.blockText,
              {
                fontSize: addModelLabelSize,
                lineHeight: Math.round(addModelLabelSize * 1.2),
              },
            ]}
            numberOfLines={2}
          >
            {label}
          </Text>
        </View>
      </FrostedPanel>
    </TouchableOpacity>
  );
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();
  
  const {
    downloadedModels,
    localModels,
    setLocalModels,
    handleDownloadModel,
    setContext,
    setCurrentPage,
    checkDownloadedModels,
    selectedGGUF,
    setSelectedGGUF,
    onOpenModelSettings,
    initialStarterShelfTab,
    onStarterShelfTabConsumed,
  } = props;

  const [infoSheet, setInfoSheet] = useState<{
    title: string;
    subtitle?: string;
    message: string;
    action?: { label: string; onPress: () => void };
  } | null>(null);

  const showInfoSheet = useCallback(
    (
      title: string,
      message: string,
      subtitle?: string,
      action?: { label: string; onPress: () => void },
    ) => {
      setInfoSheet({ title, message, subtitle, action });
    },
    [],
  );

  const closeInfoSheet = useCallback(() => setInfoSheet(null), []);

  /** Returns false (and shows an alert) when free space is too low for this file. */
  const ensureDiskForDownload = useCallback(
    async (model: ModelInfo, fileName: string): Promise<boolean> => {
      const quant = model.availableQuants?.find((q) => q.fileName === fileName);
      const sizeHint = quant?.size ?? model.size ?? null;
      const result = await checkDiskSpaceForDownload(sizeHint);
      if (result.ok) return true;
      const uf = diskPreflightAlertMessage(result);
      showInfoSheet(uf.title, uf.message, "Storage");
      return false;
    },
    [showInfoSheet],
  );

  // State declarations
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const [loadingModelFile, setLoadingModelFile] = useState<string | null>(null);
  const [isHFPanelOpen, setIsHFPanelOpen] = useState(false);
  const [isFetchingHF, setIsFetchingHF] = useState<boolean>(false);
  const [hfModels, setHfModels] = useState<ModelInfo[]>([]);
  const [downloadProgress, setDownloadProgress] = useState<{ [key: string]: number }>({});
  /** Secondary line under % (speed · ETA) while a download is active. */
  const [downloadProgressDetail, setDownloadProgressDetail] = useState<{
    [key: string]: string;
  }>({});
  const [downloadCancellationTokens, setDownloadCancellationTokens] = useState<{ [key: string]: DownloadCancellationToken }>({});
  /** Paused partials — progress retained; tap download to resume. */
  const [pausedDownloads, setPausedDownloads] = useState<{ [key: string]: number }>({});
  /** Device total RAM for fit chips (null until read / unavailable). */
  const [totalMemoryBytes, setTotalMemoryBytes] = useState<number | null>(null);
  const [starterShelfTab, setStarterShelfTab] = useState<StarterShelfTabId>("general");

  useEffect(() => {
    if (!initialStarterShelfTab) return;
    setStarterShelfTab(initialStarterShelfTab);
    onStarterShelfTabConsumed?.();
  }, [initialStarterShelfTab, onStarterShelfTabConsumed]);

  const starterShelfFrost = useMemo(() => {
    const dark = theme.mode === "dark";
    return {
      rowBorder: dark ? "rgba(255, 255, 255, 0.12)" : "rgba(15, 23, 42, 0.1)",
    };
  }, [theme.mode]);

  const starterShelfChromeOuter = useMemo(
    () => ({
      borderRadius: 12,
      padding: 4,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: starterShelfFrost.rowBorder,
      backgroundColor: "transparent" as const,
    }),
    [starterShelfFrost.rowBorder],
  );

  const starterShelfChromeInner = useMemo(
    () => ({
      paddingVertical: 10,
      borderRadius: 8,
      alignItems: "center" as const,
      justifyContent: "center" as const,
    }),
    [],
  );

  const activeStarterShelfTab = useMemo(
    () => STARTER_SHELF_TABS.find((tab) => tab.id === starterShelfTab) ?? STARTER_SHELF_TABS[0],
    [starterShelfTab],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const names = await listPausedDownloadNames();
        const next: { [key: string]: number } = {};
        for (const name of names) {
          const pct = await getPausedDownloadProgress(name);
          if (pct != null) next[name] = pct;
        }
        if (!cancelled) setPausedDownloads(next);
      } catch (e) {
        console.warn('Failed to load paused downloads', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mem = await getTotalMemoryBytes();
      if (!cancelled) setTotalMemoryBytes(mem);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  
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

  // Custom URL sheet state
  const [showCustomUrlModal, setShowCustomUrlModal] = useState(false);
  const [customUrlInput, setCustomUrlInput] = useState("");
  const [isFetchingCustomUrl, setIsFetchingCustomUrl] = useState(false);

  // Local file import choice sheet
  const [addModelSheetOpen, setAddModelSheetOpen] = useState(false);
  const [pendingLocalFile, setPendingLocalFile] = useState<{
    fileName: string;
    filePath: string;
    fileSize: number;
  } | null>(null);
  const [addModelBusy, setAddModelBusy] = useState(false);
  
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

  const closeQuantSelector = useCallback(() => {
    setShowQuantSelector(false);
  }, []);

  const closeCustomUrlModal = useCallback(() => {
    setShowCustomUrlModal(false);
  }, []);

  const closeAddModelSheet = useCallback(() => {
    if (addModelBusy) return;
    setAddModelSheetOpen(false);
    setPendingLocalFile(null);
  }, [addModelBusy]);

  const handleUseExternalModel = useCallback(async () => {
    if (!pendingLocalFile || addModelBusy) return;
    setAddModelBusy(true);
    try {
      const localModelInfo: LocalModelInfo = {
        fileName: pendingLocalFile.fileName,
        filePath: pendingLocalFile.filePath,
        addedDate: new Date().toISOString(),
        fileSize: pendingLocalFile.fileSize,
      };
      await saveLocalModel(localModelInfo);
      await checkDownloadedModels();
      closeAddModelSheet();
      showInfoSheet(
        "Added",
        `Model "${pendingLocalFile.fileName}" has been added as an external model.\n\nIf loading fails, try importing it into app storage instead.`,
        "External model",
      );
    } finally {
      setAddModelBusy(false);
    }
  }, [addModelBusy, checkDownloadedModels, closeAddModelSheet, pendingLocalFile, showInfoSheet]);

  const handleImportIntoApp = useCallback(async () => {
    if (!pendingLocalFile || addModelBusy) return;
    setAddModelBusy(true);
    try {
      const { fileName, filePath } = pendingLocalFile;
      const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
      const existsInApp = await RNFS.exists(destPath);
      if (!existsInApp) {
        await RNFS.copyFile(filePath, destPath);
      }
      await checkDownloadedModels();
      closeAddModelSheet();
      showInfoSheet(
        "Imported",
        `Model "${fileName}" has been copied into app storage.\nYou can now load it from the Downloaded list.`,
        "App storage",
      );
    } catch (copyError) {
      console.error("Error importing model into app storage:", copyError);
      showAlert(
        "Import failed",
        "Could not copy the model into app storage. You can still try using it as an external model.",
        [{ text: "OK" }],
      );
    } finally {
      setAddModelBusy(false);
    }
  }, [addModelBusy, checkDownloadedModels, closeAddModelSheet, pendingLocalFile, showInfoSheet]);

  // Dropdown state for model cards
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  

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


  // Android system back: close nested panels/modals before leaving the screen.
  const handleBackPress = useCallback(() => {
    if (addModelSheetOpen) {
      closeAddModelSheet();
      return true;
    }
    if (showCustomUrlModal) {
      closeCustomUrlModal();
      return true;
    }
    if (showQuantSelector) {
      closeQuantSelector();
      return true;
    }
    if (isHFPanelOpen) {
      setIsHFPanelOpen(false);
      return true;
    }
    // Leave Models → Settings (same as the Back control).
    setCurrentPage("settings");
    return true;
  }, [
    addModelSheetOpen,
    closeAddModelSheet,
    showCustomUrlModal,
    closeCustomUrlModal,
    showQuantSelector,
    closeQuantSelector,
    isHFPanelOpen,
    setCurrentPage,
  ]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
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
   */
  function closeHFPanel() {
    setIsHFPanelOpen(false);
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
              const response = await hfAxiosGet(
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
            console.warn(`No models found for author "${author}" after trying all search strategies`);
            console.log(`Tried search terms: ${searchStrategies.join(', ')}`);
            // Continue to next author - the search might not work for all authors
            // This could be due to API limitations or author name variations
          } else {
            console.log(`Found ${modelBatch.length} total models for author "${author}"`);
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
                filesResponse = await hfAxiosGet(
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
                console.warn(`Failed to fetch model files for ${modelId}: ${errorMsg}`);
                continue; // Skip this model and continue to next
              }
              
              // Check for API errors (401, 403, 404, etc.)
              if (filesResponse?.status === 401 || filesResponse?.status === 403) {
                const modelId = model?.id || "unknown";
                console.log(`🔒 Model ${modelId} requires authentication — showing gated card`);
                let repoName = modelId;
                let prettyName = modelId;
                try {
                  repoName = modelId.split("/").pop() || modelId;
                  prettyName = prettifyModelName(repoName);
                } catch {
                  // keep defaults
                }
                let author = "";
                try {
                  author = modelId.split("/")[0] || "";
                } catch {
                  author = "";
                }
                const gatedKey = `${modelId}:__needs_auth__`;
                if (!existingModelKeys.has(gatedKey)) {
                  const gatedInfo: ModelInfo = {
                    id: modelId,
                    name: prettyName || repoName,
                    repoId: modelId,
                    fileName: gatedKey,
                    description: "Gated on Hugging Face. Add a token to download.",
                    author,
                    needsAuth: true,
                    shelfHint: "Needs HF token",
                    tags: Array.isArray(model.tags) ? model.tags : [],
                    downloads: model.downloads || undefined,
                  };
                  newModels.push(gatedInfo);
                  currentProcessed.add(model.id);
                  existingModelIds.add(model.id);
                  existingModelKeys.add(gatedKey);
                  modelsFound++;
                }
                continue;
              }
              
              if (filesResponse?.status === 404) {
                // Model not found - skip it
                const modelId = model?.id || "unknown";
                console.log(`Model ${modelId} not found - skipping`);
                continue;
              }
              
              // Validate response data exists
              if (!filesResponse?.data) {
                const modelId = model?.id || "unknown";
                console.warn(`No data returned for model ${modelId} - skipping`);
                continue;
              }
              
              const siblings = filesResponse.data?.siblings || [];
              const revision =
                typeof filesResponse.data?.sha === "string"
                  ? filesResponse.data.sha
                  : undefined;
              
              // Validate siblings is an array
              if (!Array.isArray(siblings)) {
                const modelId = model?.id || "unknown";
                console.warn(`Invalid siblings data for model ${modelId} - skipping`);
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
                // Prefer Accel (Q4_0 / Q6_K), then other phone-friendly quants
                const ggufFiles = filterMobileFriendlyGgufs(allGgufFiles);
                const preferredFile = pickPreferredGgufFile(ggufFiles);

                // Validate preferredFile exists and has required properties
                if (!preferredFile || !preferredFile.rfilename) {
                  const modelId = model?.id || "unknown";
                  console.warn(`No valid file found for model ${modelId} - skipping`);
                  continue;
                }

                // Create a unique key for this model+file combination
                const modelKey = `${model.id}:${preferredFile.rfilename}`;
                
                // Skip if we already have this exact model+file combination
                if (existingModelKeys.has(modelKey)) {
                  continue;
                }

                const availableQuants = buildQuantOptions(ggufFiles);

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
                  revision,
                };
                
                newModels.push(modelInfo);
                currentProcessed.add(model.id);
                existingModelIds.add(model.id);
                existingModelKeys.add(modelKey);
                modelsFound++;
              } catch (processingError) {
                // Handle errors during model processing
                const modelId = model?.id || "unknown";
                console.warn(`Error processing model ${modelId}:`, processingError);
                continue; // Skip this model and continue
              }
            } catch (error: any) {
              // Catch-all for any unexpected errors
              const modelId = model?.id || "unknown";
              const errorMsg = error?.response?.status 
                ? `HTTP ${error.response.status}` 
                : error?.message || 'Unknown error';
              console.warn(`Error fetching model ${modelId}: ${errorMsg}`);
              // Continue to next model - don't crash the app
              continue;
            }
          }
        } catch (error: any) {
          // Handle errors for this author gracefully - don't crash the app
          const errorMsg = error?.response?.status 
            ? `HTTP ${error.response.status}` 
            : error?.message || 'Unknown error';
          console.warn(`Error fetching models from author "${author}": ${errorMsg}`);
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
          const status = error?.response?.status;
          const uf =
            typeof status === "number"
              ? userFacingHttpError(status)
              : {
                  title: "Couldn't load models",
                  message: activeAuthor
                    ? `No models found for author "${activeAuthor}". Check the name and try again.`
                    : "Couldn't reach Hugging Face. Check your connection and try again.",
                  kind: "network" as const,
                };
          if (uf.kind === "auth" || status === 401 || status === 403) {
            showInfoSheet(uf.title, uf.message, "Hugging Face", {
              label: "Add token",
              onPress: () => {
                closeInfoSheet();
                setCurrentPage("hfToken");
              },
            });
          } else {
            showInfoSheet(uf.title, uf.message, "Models");
          }
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
  }, [selectedAuthor, setCurrentPage, showInfoSheet, closeInfoSheet]);

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

  const handleCancelDownload = useCallback(async (file: string) => {
    const cancellationToken = downloadCancellationTokens[file];
    const progressSnap = downloadProgress[file] ?? pausedDownloads[file] ?? 0;
    if (cancellationToken) {
      try {
        // Pause: keep .partial for resume.
        await cancellationToken.cancel('pause');
        console.log(`Download paused for: ${file}`);
      } catch (error) {
        console.error("Error pausing download:", error);
      } finally {
        setDownloadProgress(prev => {
          const newProgress = { ...prev };
          delete newProgress[file];
          return newProgress;
        });
        setDownloadProgressDetail(prev => {
          const next = { ...prev };
          delete next[file];
          return next;
        });
        setDownloadCancellationTokens(prev => {
          const newTokens = { ...prev };
          delete newTokens[file];
          return newTokens;
        });
        setPausedDownloads(prev => ({ ...prev, [file]: progressSnap }));
        setSelectedGGUF(null);
      }
    }
  }, [downloadCancellationTokens, downloadProgress, pausedDownloads, setSelectedGGUF]);

  const handleDiscardPausedDownload = useCallback(async (file: string) => {
    try {
      await discardPartialDownload(file);
    } catch (e) {
      console.warn('Failed to discard partial', e);
    }
    setPausedDownloads(prev => {
      const next = { ...prev };
      delete next[file];
      return next;
    });
    setDownloadProgress(prev => {
      const next = { ...prev };
      delete next[file];
      return next;
    });
    setDownloadProgressDetail(prev => {
      const next = { ...prev };
      delete next[file];
      return next;
    });
  }, []);

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
          "File import isn’t available in this build. Reinstall the app and try again.",
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

        // Ask user whether to import into app storage (recommended) or keep external reference
        setPendingLocalFile({
          fileName,
          filePath,
          fileSize: stat.size,
        });
        setAddModelSheetOpen(true);
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
    const attemptLoad = async () => {
      setIsLoadingModel(true);
      setLoadingModelFile(localModel.fileName);
      try {
        const fileExists = await RNFS.exists(localModel.filePath);
        if (!fileExists) {
          showAlert("Error", "Model file no longer exists. It will be removed from your list.", [{ text: "OK" }]);
          await removeLocalModel(localModel.filePath);
          await checkDownloadedModels();
          return;
        }

        const success = await llamaProvider.loadModel({ modelPath: localModel.filePath });
        if (success) {
          setContext(llamaProvider.getNativeContext());
          setSelectedGGUF(localModel.fileName);
          setCurrentPage("conversation");
        } else {
          const uf = toUserFacingLoadError(null, llamaProvider.getStatus().error);
          showLoadFailureAlert(uf, {
            modelFileName: localModel.fileName,
            onRetry: () => {
              void attemptLoad();
            },
            onModels: undefined,
          });
        }
      } catch (error) {
        console.error('Error loading local model:', error);
        const uf = toUserFacingLoadError(error, llamaProvider.getStatus().error);
        showLoadFailureAlert(uf, {
          modelFileName: localModel.fileName,
          onRetry: () => {
            void attemptLoad();
          },
        });
      } finally {
        setIsLoadingModel(false);
        setLoadingModelFile(null);
      }
    };

    await attemptLoad();
  }, [setContext, setSelectedGGUF, setCurrentPage, checkDownloadedModels]);

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
    setExpandedModelId(null); // Close dropdown
    if (onOpenModelSettings) {
      onOpenModelSettings(model);
    }
  }, [onOpenModelSettings]);



  const startModelFileDownload = useCallback(
    async (model: ModelInfo, fileNameToDownload: string) => {
      try {
        if (!(await ensureDiskForDownload(model, fileNameToDownload))) {
          return;
        }
        setDownloadProgress((prev) => ({
          ...prev,
          [fileNameToDownload]: pausedDownloads[fileNameToDownload] ?? 0,
        }));

        const cancellationToken = createCancellationToken(fileNameToDownload);
        setDownloadCancellationTokens((prev) => ({
          ...prev,
          [fileNameToDownload]: cancellationToken,
        }));

        const quantSize =
          model.availableQuants?.find((q) => q.fileName === fileNameToDownload)?.size ?? 0;
        const starter = findStarterByFileName(fileNameToDownload);
        // Prefer exact sibling or curated starter byte size; do not pass rounded display strings
        // ("0.51 GB", "2.1 GB") as exact byte requirements, as display strings cause false mismatch errors.
        const expectedBytes =
          quantSize > 0
            ? quantSize
            : starter?.sizeBytes && starter.sizeBytes > 0
              ? starter.sizeBytes
              : null;
        const expectedSha256 = starter?.sha256 ?? model.sha256 ?? null;

        setPausedDownloads((prev) => {
          const next = { ...prev };
          delete next[fileNameToDownload];
          return next;
        });
        await handleDownloadModel(
          fileNameToDownload,
          model.repoId,
          (progress, info) => {
            if (!cancellationToken.isCancelled()) {
              setDownloadProgress((prev) => ({ ...prev, [fileNameToDownload]: progress }));
              const line = info ? formatDownloadProgressLine(info) : '';
              setDownloadProgressDetail((prev) => {
                if (!line) {
                  if (!(fileNameToDownload in prev)) return prev;
                  const next = { ...prev };
                  delete next[fileNameToDownload];
                  return next;
                }
                return { ...prev, [fileNameToDownload]: line };
              });
            }
          },
          cancellationToken,
          expectedBytes,
          model.revision,
          expectedSha256,
        );

        if (!cancellationToken.isCancelled()) {
          setDownloadCancellationTokens((prev) => {
            const newTokens = { ...prev };
            delete newTokens[fileNameToDownload];
            return newTokens;
          });
          setPausedDownloads((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadProgress((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadProgressDetail((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          await checkDownloadedModels();
        } else if (cancellationToken.getMode() !== 'discard') {
          // App may swallow pause/cancel without throwing — keep UI in sync.
          const pausedPct =
            (await getPausedDownloadProgress(fileNameToDownload)) ??
            downloadProgress[fileNameToDownload] ??
            0;
          setPausedDownloads((prev) => ({ ...prev, [fileNameToDownload]: pausedPct }));
          setDownloadProgress((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadProgressDetail((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadCancellationTokens((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
        }
      } catch (error) {
        if (
          isDownloadPausedError(error) ||
          isDownloadCancelledError(error) ||
          isDownloadCancelled(error)
        ) {
          console.log(`Download paused/cancelled for ${fileNameToDownload}`);
          const pausedPct =
            (await getPausedDownloadProgress(fileNameToDownload)) ??
            downloadProgress[fileNameToDownload] ??
            0;
          if (isDownloadPausedError(error)) {
            setPausedDownloads((prev) => ({
              ...prev,
              [fileNameToDownload]: pausedPct,
            }));
          }
          setDownloadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileNameToDownload];
            return newProgress;
          });
          setDownloadProgressDetail((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadCancellationTokens((prev) => {
            const newTokens = { ...prev };
            delete newTokens[fileNameToDownload];
            return newTokens;
          });
        } else {
          setDownloadProgress((prev) => {
            const newProgress = { ...prev };
            delete newProgress[fileNameToDownload];
            return newProgress;
          });
          setDownloadProgressDetail((prev) => {
            const next = { ...prev };
            delete next[fileNameToDownload];
            return next;
          });
          setDownloadCancellationTokens((prev) => {
            const newTokens = { ...prev };
            delete newTokens[fileNameToDownload];
            return newTokens;
          });
          const pausedPct = await getPausedDownloadProgress(fileNameToDownload);
          if (pausedPct != null) {
            setPausedDownloads((prev) => ({ ...prev, [fileNameToDownload]: pausedPct }));
          }
          const uf =
            toUserFacingDownloadOrLoadError(
              error,
              llamaProvider.getStatus().error,
            ) ?? toUserFacingLoadError(error, llamaProvider.getStatus().error);
          if (uf.kind === 'auth') {
            showAlert(uf.title, uf.message, [
              { text: 'OK', style: 'cancel' },
              {
                text: 'Add token',
                onPress: () => setCurrentPage('hfToken'),
              },
            ]);
          } else if (
            uf.kind === 'oom' ||
            uf.kind === 'corrupt' ||
            uf.kind === 'generic_load' ||
            uf.kind === 'not_found'
          ) {
            showLoadFailureAlert(uf, {
              modelFileName: fileNameToDownload,
              onRetry: () => {
                void startModelFileDownload(
                  // Reconstruct minimal model for resume/load-after-download
                  {
                    id: fileNameToDownload,
                    name: fileNameToDownload,
                    repoId: model.repoId,
                    fileName: fileNameToDownload,
                    size: model.size,
                    availableQuants: model.availableQuants,
                  },
                  fileNameToDownload,
                );
              },
            });
          } else {
            showAlert(uf.title, uf.message, [{ text: 'OK' }]);
          }
        }
      }
    },
    [
      ensureDiskForDownload,
      pausedDownloads,
      handleDownloadModel,
      checkDownloadedModels,
      downloadProgress,
      setCurrentPage,
    ],
  );

  const handleModelDownload = useCallback(async (model: ModelInfo) => {
    if (model.needsAuth) {
      const uf = userFacingHttpError(403);
      showAlert(uf.title, uf.message, [
        { text: "OK", style: "cancel" },
        {
          text: "Add token",
          onPress: () => setCurrentPage("hfToken"),
        },
      ]);
      return;
    }

    const isDownloaded = downloadedModels.includes(model.fileName);
    
    if (isDownloaded) {
      // Load the model
      const attemptLoad = async () => {
        setIsLoadingModel(true);
        setLoadingModelFile(model.fileName);
        try {
          const modelPath = `${RNFS.DocumentDirectoryPath}/${model.fileName}`;
          // Same path as chat model switch — keep llamaProvider + native context aligned.
          const success = await llamaProvider.loadModel({ modelPath });
          if (success) {
            setContext(llamaProvider.getNativeContext());
            setSelectedGGUF(model.fileName);
            setCurrentPage("conversation");
          } else {
            const uf = toUserFacingLoadError(null, llamaProvider.getStatus().error);
            showLoadFailureAlert(uf, {
              modelFileName: model.fileName,
              onRetry: () => {
                void attemptLoad();
              },
            });
          }
        } catch (error) {
          console.error("Error loading model:", error);
          const uf = toUserFacingLoadError(error, llamaProvider.getStatus().error);
          showLoadFailureAlert(uf, {
            modelFileName: model.fileName,
            onRetry: () => {
              void attemptLoad();
            },
          });
        } finally {
          setIsLoadingModel(false);
          setLoadingModelFile(null);
        }
      };
      await attemptLoad();
    } else if (pausedDownloads[model.fileName] !== undefined) {
      // Resume paused partial — no confirm dialog.
      await startModelFileDownload(model, model.fileName);
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
              onPress: () => {
                void startModelFileDownload(model, fileNameToDownload);
              },
            },
          ],
          false
        );
      }
    }
  }, [downloadedModels, setContext, setSelectedGGUF, setCurrentPage, pausedDownloads, startModelFileDownload]);

  const handleCustomUrlSubmit = useCallback(async () => {
    const parsed = parseHuggingFaceUrl(customUrlInput);

    if (!parsed) {
      showInfoSheet(
        "Invalid URL",
        "Please enter a valid HuggingFace model URL.\n\nExamples:\nhttps://huggingface.co/author/model\nhttps://huggingface.co/author/model/blob/main/file.gguf",
        "Import from URL",
      );
      return;
    }

    setIsFetchingCustomUrl(true);

    try {
      const response = await hfAxiosGet(
        `https://huggingface.co/api/models/${parsed.repoId}`,
        { timeout: 15000, validateStatus: (status: number) => status < 500 }
      );

      if (response.status === 401 || response.status === 403) {
        const uf = userFacingHttpError(response.status);
        showInfoSheet(uf.title, uf.message, "Hugging Face", {
          label: "Add token",
          onPress: () => {
            closeInfoSheet();
            setCurrentPage("hfToken");
          },
        });
        return;
      }

      if (response.status === 404) {
        const uf = userFacingHttpError(404);
        showInfoSheet(uf.title, uf.message, "Import from URL");
        return;
      }

      if (!response.data) {
        showAlert("Error", "Could not fetch model information.", [{ text: "OK" }]);
        return;
      }

      const siblings = response.data.siblings || [];
      const revision =
        parsed.revision ||
        (typeof response.data.sha === "string" ? response.data.sha : undefined);
      const allGgufFiles = siblings.filter((f: any) =>
        f?.rfilename?.toLowerCase().endsWith('.gguf')
      );

      if (allGgufFiles.length === 0) {
        showInfoSheet(
          "No GGUF Files",
          "This repository does not contain any GGUF model files.",
          "Import from URL",
        );
        return;
      }

      const ggufFiles = filterMobileFriendlyGgufs(allGgufFiles);
      const repoName = parsed.repoId.split("/").pop() || parsed.repoId;
      const author = parsed.repoId.split("/")[0] || "";

      const availableQuants = buildQuantOptions(ggufFiles);

      let targetFileName: string;
      let showQuants: QuantizationOption[] | undefined;

      if (parsed.fileName) {
        const matchedFile = allGgufFiles.find((f: any) => f.rfilename === parsed.fileName);
        if (matchedFile) {
          targetFileName = matchedFile.rfilename;
          showQuants = undefined;
        } else {
          const preferredFile = pickPreferredGgufFile(ggufFiles) || ggufFiles[0];
          targetFileName = preferredFile.rfilename;
          showQuants = availableQuants.length > 1 ? availableQuants : undefined;
        }
      } else {
        const preferredFile = pickPreferredGgufFile(ggufFiles) || ggufFiles[0];
        targetFileName = preferredFile.rfilename;
        showQuants = availableQuants.length > 1 ? availableQuants : undefined;
      }

      const targetFile =
        allGgufFiles.find((f: any) => f.rfilename === targetFileName) ||
        ggufFiles.find((f: any) => f.rfilename === targetFileName);
      const fileSize = targetFile?.size || 0;
      const sizeGB = fileSize > 0 ? (fileSize / 1024 / 1024 / 1024).toFixed(2) : undefined;

      const modelInfo: ModelInfo = {
        id: parsed.repoId,
        name: prettifyModelName(repoName),
        repoId: parsed.repoId,
        fileName: targetFileName,
        size: sizeGB ? `${sizeGB}GB` : undefined,
        author: author,
        availableQuants: showQuants,
        revision,
      };

      closeCustomUrlModal();
      setCustomUrlInput("");
      handleModelDownload(modelInfo);
    } catch (error: any) {
      const status = error?.response?.status;
      const uf =
        typeof status === 'number'
          ? userFacingHttpError(status)
          : (toUserFacingDownloadError(error) ?? {
              title: "Couldn't fetch model",
              message: "Could not load model information. Check the URL and try again.",
              kind: 'generic_download' as const,
            });
      if (uf.kind === 'auth' || status === 401 || status === 403) {
        showInfoSheet(uf.title, uf.message, "Hugging Face", {
          label: "Add token",
          onPress: () => {
            closeInfoSheet();
            setCurrentPage("hfToken");
          },
        });
      } else {
        showInfoSheet(uf.title, uf.message, "Import from URL");
      }
    } finally {
      setIsFetchingCustomUrl(false);
    }
  }, [customUrlInput, closeCustomUrlModal, closeInfoSheet, handleModelDownload, setCurrentPage, showInfoSheet]);

  /**
   * Render a model card with proper props
   * Uses the extracted ModelCard component for better performance
   */
  const renderModelCard = useCallback((model: ModelInfo, isDownloaded: boolean, index: number) => {
    const isDownloading = downloadProgress[model.fileName] !== undefined;
    const isPaused = !isDownloading && pausedDownloads[model.fileName] !== undefined;
    const progress = isDownloading
      ? downloadProgress[model.fileName] || 0
      : pausedDownloads[model.fileName] || 0;
    const isLoading = loadingModelFile === model.fileName && isLoadingModel;
    const modelKey = `${model.id}:${model.fileName}`;
    const isExpanded = expandedModelId === modelKey;
    const ramFit = classifyRamFitFromSize(model.size, totalMemoryBytes);
    
    return (
      <ModelCard
        model={model}
        isDownloaded={isDownloaded}
        index={index}
        isDownloading={isDownloading}
        isPaused={isPaused}
        progress={progress}
        progressDetail={
          isDownloading ? downloadProgressDetail[model.fileName] : undefined
        }
        isLoading={isLoading}
        onDownload={() => handleModelDownload(model)}
        onDelete={() => handleDeleteModel(model.fileName)}
        onCancel={() => handleCancelDownload(model.fileName)}
        onDiscardPaused={() => handleDiscardPausedDownload(model.fileName)}
        onSettings={() => handleOpenSettings(model)}
        isExpanded={isExpanded}
        onToggleExpand={() => setExpandedModelId(isExpanded ? null : modelKey)}
        isInitialAnimationPhase={isInitialAnimationPhase.current}
        animatedModelIds={animatedModelIds}
        ramFit={ramFit}
      />
    );
  }, [downloadProgress, downloadProgressDetail, pausedDownloads, loadingModelFile, isLoadingModel, expandedModelId, handleModelDownload, handleDeleteModel, handleCancelDownload, handleDiscardPausedDownload, handleOpenSettings, isInitialAnimationPhase, animatedModelIds, totalMemoryBytes]);

  // Memoize downloaded models info to avoid recalculation on every render
  const downloadedModelsInfo = useMemo(() => {
    return downloadedModels
      .map((fileName) => {
        const starter = findStarterByFileName(fileName);
        if (starter) return starter as ModelInfo;

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

  // Memoize filtered starter shelf models for the active tab
  const availableStarterShelfModels = useMemo(() => {
    return getAvailableStarterModels(
      downloadedModels,
      getStarterShelfCatalog(starterShelfTab),
    );
  }, [downloadedModels, starterShelfTab]);

  return (
    <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background }]}>
      <Text style={styles.settingsTitle}>Models</Text>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
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
                          <ActivityIndicator size="small" color={theme.colors.text} />
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

        {/* Available Models — curated shelf */}
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
            {STARTER_SHELF_TITLE}
          </Text>

          <SegmentedTabBar
            tabs={STARTER_SHELF_TABS}
            activeId={starterShelfTab}
            onChange={(id) => setStarterShelfTab(id as StarterShelfTabId)}
            chromeOuter={[
              starterShelfChromeOuter,
              { marginBottom: 12 },
            ]}
            chromeInner={starterShelfChromeInner}
            chromeScale={density}
            activeLabelColor={theme.colors.primaryText}
            inactiveLabelColor={theme.colors.text}
            activePillColor={theme.colors.primary}
          />

          <View>
            {!!activeStarterShelfTab.subtitle && (
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  lineHeight: 20,
                  marginBottom: 12,
                }}
              >
                {activeStarterShelfTab.subtitle}
              </Text>
            )}

            {availableStarterShelfModels.length === 0 ? (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  lineHeight: 20,
                  marginBottom: 8,
                }}
              >
                All models in this tab are already downloaded. See Downloaded above.
              </Text>
            ) : (
              availableStarterShelfModels.map((model, index) => (
                <View key={`${model.id}:${model.fileName}:${downloadedModelsInfo.length + index}`}>
                  {renderModelCard(model, false, downloadedModelsInfo.length + index)}
                </View>
              ))
            )}
          </View>
        </View>

        {/* Add models — 2×2 settings-style tiles */}
        <View style={{ marginBottom: ADD_MODEL_TILE_GAP }}>
          <View
            style={{
              flexDirection: "row",
              height: ADD_MODEL_TILE_HEIGHT,
              marginBottom: ADD_MODEL_TILE_GAP,
            }}
          >
            {renderAddModelTile(
              "Hugging\nFace",
              "cloud-download-outline",
              openHFPanel,
              { flex: 1, marginRight: ADD_MODEL_TILE_GUTTER },
            )}
            {renderAddModelTile(
              "Local",
              "folder-outline",
              () => {
                void handlePickLocalModel();
              },
              { flex: 1, marginLeft: ADD_MODEL_TILE_GUTTER },
            )}
          </View>
          <View style={{ flexDirection: "row", height: ADD_MODEL_TILE_HEIGHT }}>
            {renderAddModelTile(
              "Repo URL",
              "link-outline",
              () => setShowCustomUrlModal(true),
              { flex: 1, marginRight: ADD_MODEL_TILE_GUTTER },
            )}
            {renderAddModelTile(
              "HF token",
              "key-outline",
              () => setCurrentPage("hfToken"),
              { flex: 1, marginLeft: ADD_MODEL_TILE_GUTTER },
            )}
          </View>
        </View>
      </ScrollView>

      {/* Back button */}
      <View style={{ position: "absolute", bottom: backBottom, left: 15, backgroundColor: "transparent" }}>
        <FloatingBackButton onPress={() => setCurrentPage("settings")} />
      </View>

      {/* HuggingFace Panel */}
      <BottomSheet
        visible={isHFPanelOpen}
        onClose={closeHFPanel}
        title="HuggingFace Models"
        height={0.8}
        headerRight={
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
              paddingVertical: 10,
              paddingHorizontal: 16,
              borderRadius: 12,
              backgroundColor: (showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primary : theme.colors.surface,
              borderWidth: 1,
              borderColor: (showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primary : theme.colors.border,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            <Icon 
              name="filter-list" 
              size={24} 
              color={(showAuthorInput || selectedModelType || selectedAuthor) ? theme.colors.primaryText : theme.colors.text} 
            />
            {(showAuthorInput || selectedModelType || selectedAuthor) && (
              <Text
                style={{
                  marginLeft: 8,
                  fontSize: 16,
                  fontFamily: 'Poppins',
                  fontWeight: '600',
                  color: theme.colors.primaryText,
                }}
              >
                Filter
              </Text>
            )}
          </TouchableOpacity>
        }
      >

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
                  <ActivityIndicator size="small" color={theme.colors.text} />
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
                            Load More
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
      </BottomSheet>

      {/* Quantization selector */}
      <BottomSheet
        visible={showQuantSelector}
        onClose={closeQuantSelector}
        title="Select Quantization"
        height={0.65}
        headerRight={
          <TouchableOpacity
            onPress={closeQuantSelector}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        }
      >
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

            <ScrollView
              style={{ flex: 1 }}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {selectedModelForDownload.availableQuants && selectedModelForDownload.availableQuants.length > 0 ? (
                selectedModelForDownload.availableQuants.map((quant, index) => {
                  const sizeGB = quant.size > 0 ? (quant.size / 1024 / 1024 / 1024).toFixed(2) : "Unknown";
                  const recommendLabel = getQuantRecommendLabel(quant.quantization);
                  const isRecommended = recommendLabel != null;

                  return (
                    <TouchableOpacity
                      key={`${quant.fileName}-${index}`}
                      onPress={async () => {
                        closeQuantSelector();
                        const fileNameToDownload = quant.fileName;

                        showAlert(
                          "Confirm Download",
                          `Download ${selectedModelForDownload.name} (${quant.quantization})?\nSize: ${sizeGB}GB` +
                            (recommendLabel === "Accel"
                              ? "\n\nThis quant can use Android GPU/NPU offload when available."
                              : ""),
                          [
                            {
                              text: "Cancel",
                              style: "cancel",
                            },
                            {
                              text: "Download",
                              onPress: () => {
                                void startModelFileDownload(
                                  selectedModelForDownload,
                                  fileNameToDownload,
                                ).then(() => setSelectedModelForDownload(null));
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
                                  {recommendLabel}
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
      </BottomSheet>

      {/* Custom URL import */}
      <BottomSheet
        visible={showCustomUrlModal}
        onClose={closeCustomUrlModal}
        title="Import from URL"
        subtitle="Paste a HuggingFace model URL to browse and download GGUF files."
        fitContent
        headerRight={
          <TouchableOpacity
            onPress={closeCustomUrlModal}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
        }
      >
        <TextInput
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            color: theme.colors.text,
            fontFamily: "Poppins",
            fontSize: 14,
            marginBottom: 12,
          }}
          placeholder="https://huggingface.co/author/model-name"
          placeholderTextColor={theme.colors.textTertiary}
          value={customUrlInput}
          onChangeText={setCustomUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          onSubmitEditing={handleCustomUrlSubmit}
          editable={!isFetchingCustomUrl}
        />

        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textTertiary,
            fontFamily: "Poppins",
            marginBottom: 16,
            lineHeight: 16,
          }}
        >
          Supports repo URLs and direct file links:{"\n"}
          huggingface.co/author/model{"\n"}
          huggingface.co/author/model/blob/main/file.gguf
        </Text>

        <TouchableOpacity
          onPress={handleCustomUrlSubmit}
          disabled={!customUrlInput.trim() || isFetchingCustomUrl}
          style={{
            backgroundColor: customUrlInput.trim() && !isFetchingCustomUrl
              ? theme.colors.primary
              : theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            opacity: !customUrlInput.trim() || isFetchingCustomUrl ? 0.5 : 1,
          }}
        >
          {isFetchingCustomUrl ? (
            <>
              <ActivityIndicator size="small" color={theme.colors.text} style={{ marginRight: 8 }} />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 16,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                }}
              >
                Fetching...
              </Text>
            </>
          ) : (
            <>
              <Icon
                name="search"
                size={20}
                color={customUrlInput.trim() ? theme.colors.primaryText : theme.colors.text}
              />
              <Text
                style={{
                  color: customUrlInput.trim() ? theme.colors.primaryText : theme.colors.text,
                  fontSize: 16,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                  marginLeft: 8,
                }}
              >
                Fetch Model
              </Text>
            </>
          )}
        </TouchableOpacity>
      </BottomSheet>

      {/* Local file import choice */}
      <BottomSheet
        visible={addModelSheetOpen}
        onClose={closeAddModelSheet}
        title="Add Model"
        subtitle={pendingLocalFile?.fileName}
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
            marginBottom: 16,
          }}
        >
          Import into app copies the file into private storage (recommended). Use external keeps it at its current location.
        </Text>
        <TouchableOpacity
          onPress={() => void handleImportIntoApp()}
          disabled={addModelBusy}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 10,
            opacity: addModelBusy ? 0.5 : 1,
          }}
        >
          {addModelBusy ? (
            <ActivityIndicator size="small" color={theme.colors.primaryText} />
          ) : (
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 15,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Import into app
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void handleUseExternalModel()}
          disabled={addModelBusy}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            marginBottom: 10,
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: addModelBusy ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 15,
              fontWeight: "600",
              fontFamily: "Poppins",
            }}
          >
            Use external
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={closeAddModelSheet}
          disabled={addModelBusy}
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: "center",
            borderWidth: 1,
            borderColor: theme.colors.border,
            opacity: addModelBusy ? 0.5 : 1,
          }}
        >
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 15,
              fontWeight: "600",
              fontFamily: "Poppins",
            }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
      </BottomSheet>

      <BottomSheet
        visible={infoSheet !== null}
        onClose={closeInfoSheet}
        title={infoSheet?.title ?? ""}
        subtitle={infoSheet?.subtitle}
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
            marginBottom: infoSheet?.action ? 16 : 0,
          }}
        >
          {infoSheet?.message ?? ""}
        </Text>
        {infoSheet?.action ? (
          <TouchableOpacity
            onPress={infoSheet.action.onPress}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 15,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              {infoSheet.action.label}
            </Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>

    </View>
  );
}
