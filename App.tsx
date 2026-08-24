/**
 * App root — navigation, model selection state, theme/alert providers,
 * and coordination between screens. Model load/unload goes through llamaProvider.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  StatusBar,
  Platform,
  Animated,
  AppState,
  BackHandler,
  type AppStateStatus,
} from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStyles } from "./src/styles/styles";
import { downloadModel, DownloadCancellationToken, type DownloadProgressInfo } from "./src/api/model";
import { resolveHfDownloadUrl } from "./src/services/hfModelHelpers";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Theme
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { applySystemBarTheme, lerpHexColor } from "./src/utils/systemBars";
import { frostedPanelSystemBarColor } from "./src/components/FrostedGlass";
import { EASING, OVERLAY_MOTION } from "./src/utils/animationConfig";
import { shouldRehydrateSelectionFromProvider } from "./src/utils/modelSelectionRehydrate";

// Components
import { CustomAlertProvider } from "./src/components/CustomAlert";
import { PageFadeIn } from "./src/components/PageFadeIn";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import HfTokenScreen from "./src/screens/HfTokenScreen";
import StagesScreen from "./src/screens/StagesScreen";
import PersonasLibraryScreen from "./src/screens/PersonasLibraryScreen";
import PersonaEditorScreen from "./src/screens/PersonaEditorScreen";
import ModelSettingsScreen from "./src/screens/ModelSettingsScreen";
import InfoScreen from "./src/screens/InfoScreen";
import DiagnosticsScreen from "./src/screens/DiagnosticsScreen";
import OnboardingScreen from "./src/screens/OnboardingScreen";
import StorageScreen from "./src/screens/StorageScreen";
import { Persona, getPersonas, updatePersonaLastUsed } from "./src/services/personaService";
import { ModelInfo } from "./src/components/ModelCard";

// Services (legacy helpers still used for download / existence checks)
import { checkFileExists } from "./src/services/llamaService";
import { validateLocalModels, LocalModelInfo } from "./src/services/localModelService";
import { shouldShowOnboardingOnLaunch } from "./src/services/onboardingService";
import { toUserFacingLoadError } from "./src/utils/userFacingErrors";

// Vercel AI SDK integration layer
import { llamaProvider } from "./src/providers/llamaProvider";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
  tokensPerSecond?: number;
  attachments?: Array<{ type: "image"; uri: string; width?: number; height?: number; fileName?: string }>;
};

function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const insets = useSafeAreaInsets();

  // DEV-only: log New Architecture status at startup (Fabric + TurboModules)
  useEffect(() => {
    if (__DEV__) {
      const fabric = Boolean((global as any).nativeFabricUIManager);
      const turbo = Boolean((global as any).__turboModuleProxy);
      console.log(
        "[ofln] New Architecture: Fabric=" + fabric + ", TurboModules=" + turbo
      );
    }
  }, []);

  // Soft crossfade for status / home bars when the frosted history panel opens.
  // Native bars can't interpolate themselves — we lerp hex and push frames.
  // Frosted chrome open (history drawer OR quick model/persona panel) —
  // drives status/nav bar + SafeArea shell to the same frost endpoint.
  const [frostedChromeOpen, setFrostedChromeOpen] = useState(false);
  const [shellBackground, setShellBackground] = useState(theme.colors.background);
  const shellColorAnim = useRef(new Animated.Value(0)).current;
  // Empty until first apply so cold-start always writes React state + native bars.
  // (Native theme defaults are black; matching React background must not skip the write.)
  const lastShellColorRef = useRef<string>("");

  const applyShellColor = useCallback((hex: string) => {
    if (hex !== lastShellColorRef.current) {
      lastShellColorRef.current = hex;
      setShellBackground(hex);
    }
    // Status transparent (shell paints under). Native window/nav fill uses the
    // same hex so the physical bottom never shows a 1px gap under the gesture bar.
    applySystemBarTheme({ statusBarColor: hex, navBarColor: hex });
  }, []);

  // Theme change / first mount: snap shell + system bars to the page background.
  useEffect(() => {
    const target = frostedChromeOpen
      ? frostedPanelSystemBarColor(theme.mode)
      : theme.colors.background;
    shellColorAnim.stopAnimation();
    shellColorAnim.setValue(frostedChromeOpen ? 1 : 0);
    applyShellColor(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.mode, theme.colors.background]);

  // Panel chrome open/close — same duration as overlay/history exit.
  useEffect(() => {
    const from = lastShellColorRef.current;
    const to = frostedChromeOpen
      ? frostedPanelSystemBarColor(theme.mode)
      : theme.colors.background;
    // Empty string before first shell apply — don't animate from "".
    if (!from || from.toLowerCase() === to.toLowerCase()) {
      applyShellColor(to);
      return;
    }

    shellColorAnim.setValue(0);
    const listenerId = shellColorAnim.addListener(({ value }) => {
      applyShellColor(lerpHexColor(from, to, value));
    });
    const anim = Animated.timing(shellColorAnim, {
      toValue: 1,
      duration: OVERLAY_MOTION.FADE_OUT_MS,
      easing: EASING.EASE_OUT,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (finished) applyShellColor(to);
    });
    return () => {
      shellColorAnim.removeListener(listenerId);
      anim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frostedChromeOpen, applyShellColor]);

  const INITIAL_CONVERSATION: Message[] = [
    {
      role: "system",
      content: "This is a conversation between user and assistant, a friendly chatbot.",
    },
  ];

  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] = useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>("");
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  type PageType =
    | "onboarding"
    | "modelSelection"
    | "conversation"
    | "settings"
    | "stages"
    | "personas"
    | "personaEditor"
    | "modelSettings"
    | "info"
    | "diagnostics"
    | "hfToken"
    | "storage";
  const [currentPage, setCurrentPage] = useState<PageType>("conversation");
  /** False until `@has_completed_onboarding` is read — avoids flashing chat for new users. */
  const [bootstrapped, setBootstrapped] = useState(false);
  /** Skip from onboarding returns here (About review → info; first-run → conversation). */
  const [onboardingSkipTo, setOnboardingSkipTo] = useState<"conversation" | "info">("conversation");

  // First-run gate (mount once). About “Review” never clears the flag.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const show = await shouldShowOnboardingOnLaunch();
        if (!cancelled && show) {
          setOnboardingSkipTo("conversation");
          setCurrentPage("onboarding");
        }
      } catch (e) {
        console.warn("Onboarding gate check failed", e);
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving conversation always clears frosted chrome bar styling
  useEffect(() => {
    if (currentPage !== "conversation" && frostedChromeOpen) {
      setFrostedChromeOpen(false);
    }
  }, [currentPage, frostedChromeOpen]);

  const [editingPersona, setEditingPersona] = useState<Persona | null | undefined>(undefined);
  const [selectedModelForSettings, setSelectedModelForSettings] = useState<ModelInfo | null>(null);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [assistantDisplayMode, setAssistantDisplayModeState] = useState<"bubble" | "direct">(
    "bubble"
  );
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);

  const selectedGGUFRef = useRef<string | null>(selectedGGUF);
  selectedGGUFRef.current = selectedGGUF;

  /**
   * After a brief background, React state can reset while llamaProvider (JS singleton)
   * still holds the loaded model in RAM. Reattach UI selection + context only —
   * never load/unload here.
   */
  const rehydrateModelSelectionFromProvider = useCallback(() => {
    const nativeCtx = llamaProvider.getNativeContext();
    const status = llamaProvider.getStatus();
    const decision = shouldRehydrateSelectionFromProvider(
      {
        ready: llamaProvider.isReady(),
        modelPath: status.modelPath,
        hasNativeContext: !!nativeCtx,
      },
      selectedGGUFRef.current,
    );
    if (!decision.rehydrate) return;
    setSelectedGGUF(decision.fileName);
    setContext(nativeCtx);
  }, []);

  useEffect(() => {
    rehydrateModelSelectionFromProvider();
  }, [rehydrateModelSelectionFromProvider]);

  useEffect(() => {
    const onChange = (next: AppStateStatus) => {
      if (next === "active") {
        rehydrateModelSelectionFromProvider();
      }
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [rehydrateModelSelectionFromProvider]);

  // Load saved chat mode preference on app startup
  useEffect(() => {
    const loadChatMode = async () => {
      try {
        const savedChatMode = await AsyncStorage.getItem('@app_chat_mode');
        if (savedChatMode === 'bubble' || savedChatMode === 'direct') {
          setAssistantDisplayModeState(savedChatMode);
        }
      } catch (error) {
        console.error('Error loading chat mode:', error);
      }
    };
    loadChatMode();
  }, []);

  // Wrapper function to save chat mode preference whenever it changes
  const setAssistantDisplayMode = useCallback((mode: "bubble" | "direct" | ((prev: "bubble" | "direct") => "bubble" | "direct")) => {
    setAssistantDisplayModeState((prevMode) => {
      const newMode = typeof mode === 'function' ? mode(prevMode) : mode;
      // Save to AsyncStorage asynchronously
      AsyncStorage.setItem('@app_chat_mode', newMode).catch((error) => {
        console.error('Error saving chat mode:', error);
      });
      return newMode;
    });
  }, []);

  // Page enter fades are handled per-screen by PageFadeIn on mount.

  const scrollViewRef = useRef<ScrollView>(null!) as React.RefObject<ScrollView>;
  const scrollPositionRef = useRef(0);
  const contentHeightRef = useRef(0);

  /**
   * Load available personas
   * 
   * Fetches all personas from storage for use in dropdowns and selection.
   * Wrapped in useCallback to ensure stable reference for dependency arrays.
   */
  const loadAvailablePersonas = useCallback(async () => {
    try {
      const personas = await getPersonas();
      setAvailablePersonas(personas);
    } catch (error) {
      console.error("Error loading personas:", error);
      setAvailablePersonas([]);
    }
  }, []);

  useEffect(() => {
    checkDownloadedModels();
    // Load personas when navigating to relevant pages
    if (currentPage === "personas" || currentPage === "conversation") {
      loadAvailablePersonas();
    }
  }, [currentPage, checkDownloadedModels, loadAvailablePersonas]);

  /**
   * Check and update list of downloaded models
   * 
   * Scans the document directory for .gguf files and validates
   * local model metadata. Called when navigating to model selection
   * to ensure UI reflects current state.
   * 
   * Edge cases handled:
   * - Directory read failures
   * - Invalid file entries
   * - Local model validation errors
   * 
   * Wrapped in useCallback to ensure stable reference for dependency arrays
   */
  const checkDownloadedModels = useCallback(async () => {
    try {
      // Check downloaded models from DocumentDirectoryPath
      const files = await RNFS.readDir(RNFS.DocumentDirectoryPath);
      // Final models only — never activate `*.gguf.partial` (or `.chunk`) as downloads.
      const ggufFiles = files
        .filter((file) => {
          const n = file.name.toLowerCase();
          return n.endsWith(".gguf") && !n.endsWith(".partial") && !n.endsWith(".chunk");
        })
        .map((f) => f.name);
      setDownloadedModels(ggufFiles);

      // Validate and update local models (checks if files still exist)
      // This removes models that have been deleted outside the app
      const validLocalModels = await validateLocalModels();
      setLocalModels(validLocalModels);
    } catch (error) {
      // Log error but don't crash - models list will be empty
      console.error("Error checking downloaded models:", error);
      // Set empty arrays on error to prevent stale state
      setDownloadedModels([]);
      setLocalModels([]);
    }
  }, []); // No dependencies - only uses state setters and imported functions

  /**
   * Navigate back to model selection screen
   * 
   * Cleans up current model context and resets conversation state.
   * Important for memory management on mobile devices.
   * 
   * Edge cases handled:
   * - Releases model context to prevent memory leaks
   * - Resets all conversation-related state
   */
  const handleBackToModelSelection = useCallback(() => {
    setContext(null);
    releaseAllLlama();
    llamaProvider.unloadModel();
    setConversation(INITIAL_CONVERSATION);
    setSelectedGGUF(null);
    setCurrentChatId(null);
    setCurrentPage("modelSelection");
  }, []);

  /** Unload if deleting the active GGUF from Storage; dual release. */
  const handleUnloadIfActiveModel = useCallback(async (fileName: string) => {
    if (selectedGGUF !== fileName) return;
    setContext(null);
    try {
      await Promise.resolve(releaseAllLlama()).catch(() => {});
    } catch {
      // ignore
    }
    try {
      await llamaProvider.unloadModel();
    } catch {
      // ignore
    }
    setSelectedGGUF(null);
  }, [selectedGGUF]);

  /**
   * Start a new chat conversation
   * 
   * Resets conversation to initial state while preserving loaded model.
   * 
   * Edge cases handled:
   * - Preserves model context (model stays loaded)
   */
  const handleNewChat = useCallback(() => {
    setConversation(INITIAL_CONVERSATION);
    setCurrentChatId(null);
  }, []);

  /**
   * Load an existing chat from history
   * 
   * @param chatId - Unique identifier for the chat
   * @param messages - Array of messages in the chat
   * 
   * Edge cases handled:
   * - Validates messages array is not empty
   */
  const handleLoadChat = useCallback(async (chatId: string, messages: Message[]) => {
    if (!messages || messages.length === 0) {
      console.warn('Attempted to load empty chat, using initial conversation');
      setConversation(INITIAL_CONVERSATION);
      return;
    }
    
    setConversation(messages);
    setCurrentChatId(chatId);
    setCurrentPage("conversation");
  }, []);

  /**
   * Handle model download and loading
   * 
   * Downloads model from HuggingFace if not already present,
   * then loads it into memory. If model already exists, loads directly.
   * 
   * @param file - Model file name
   * @param repoId - HuggingFace repository ID
   * @param onProgress - Progress callback (0-100)
   * 
   * Edge cases handled:
   * - Model already exists (loads directly, no re-download)
   * - Download failures (error logged, selection reset, user notified)
   * - Load failures after download (error logged, file may be corrupted)
   * - Network interruptions (resume via downloadModel)
   * - Storage full (handled by downloadModel, user notified)
   * - Concurrent downloads (prevented by UI state)
   * - Optional HF revision (branch/sha); resolves via API when omitted
   */
  const handleDownloadModel = useCallback(async (
    file: string, 
    repoId: string, 
    onProgress: (progress: number, info?: DownloadProgressInfo) => void,
    cancellationToken?: DownloadCancellationToken,
    expectedBytes?: number | null,
    revision?: string | null,
  ) => {
    const downloadUrl = await resolveHfDownloadUrl(repoId, file, revision);
    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    
    // Check if already cancelled / paused
    if (cancellationToken?.isCancelled()) {
      console.log("Download cancelled before starting");
      return;
    }
    
    // Check if model already exists locally (final .gguf only — never .partial)
    if (await checkFileExists(destPath)) {
      // Model exists - load via provider (same path as chat model switch)
      const success = await llamaProvider.loadModel({ modelPath: destPath });
      if (success) {
        setContext(llamaProvider.getNativeContext());
        setSelectedGGUF(file);
        await checkDownloadedModels(); // Refresh downloaded models list
        setCurrentPage("conversation");
        return;
      }
      // Surface a typed failure so ModelSelection can show calm copy (not a silent miss).
      setSelectedGGUF(null);
      const uf = toUserFacingLoadError(null, llamaProvider.getStatus().error);
      throw new Error(`${uf.title}: ${uf.message}`);
    }
    
    // Model doesn't exist - download it (resumable .partial → rename on verify)
    try {
      await downloadModel(file, downloadUrl, {
        onProgress,
        cancellationToken,
        expectedBytes,
      });
      
      // Check if cancelled/paused after download
      if (cancellationToken?.isCancelled()) {
        console.log("Download was cancelled or paused");
        return;
      }
      
      await checkDownloadedModels(); // Refresh downloaded models list
      
      // Load model after successful download via provider
      const success = await llamaProvider.loadModel({ modelPath: destPath });
      if (success) {
        setContext(llamaProvider.getNativeContext());
        setSelectedGGUF(file);
        setCurrentPage("conversation");
      } else {
        setSelectedGGUF(null);
        const uf = toUserFacingLoadError(null, llamaProvider.getStatus().error);
        throw new Error(`${uf.title}: ${uf.message}`);
      }
    } catch (error) {
      // Pause / cancel — not a hard failure (ModelSelection owns paused UI)
      if (
        error instanceof Error &&
        (/download was cancelled/i.test(error.message) ||
          /download was paused/i.test(error.message))
      ) {
        console.log("Download paused or cancelled by user");
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Download failed:", errorMessage);
      setSelectedGGUF(null); // Reset selection on error
      throw error; // Let ModelSelection show user-facing alert
    }
  }, [setContext, checkDownloadedModels]);

  /**
   * Android system back — walk the same parent hierarchy as on-screen Back buttons.
   * Screen-level listeners (modals / drawers) register later and run first; when they
   * return false we navigate here instead of finishing the Activity.
   */
  useEffect(() => {
    if (Platform.OS !== "android" || !bootstrapped) return;

    const onHardwareBack = () => {
      switch (currentPage) {
        case "settings":
          setCurrentPage("conversation");
          return true;
        case "modelSelection":
          setCurrentPage("settings");
          return true;
        case "stages":
        case "diagnostics":
        case "storage":
        case "personas":
        case "info":
          setCurrentPage("settings");
          return true;
        case "personaEditor":
          setEditingPersona(undefined);
          setCurrentPage("personas");
          return true;
        case "modelSettings":
          setSelectedModelForSettings(null);
          setCurrentPage("modelSelection");
          return true;
        case "hfToken":
          setCurrentPage("modelSelection");
          return true;
        case "onboarding":
          // About → Review onboarding: back returns to About.
          // First-run gate: allow system exit (no prior screen).
          if (onboardingSkipTo === "info") {
            setCurrentPage("info");
            return true;
          }
          return false;
        case "conversation":
        default:
          // Root screen — let Android finish / background the app.
          return false;
      }
    };

    const sub = BackHandler.addEventListener("hardwareBackPress", onHardwareBack);
    return () => sub.remove();
  }, [bootstrapped, currentPage, onboardingSkipTo]);

  return (
    <View
      collapsable={false}
      style={[styles.container, { backgroundColor: shellBackground }]}
    >
      <StatusBar
        translucent
        // Draw under status; shell paints underneath. Icons via barStyle.
        barStyle={theme.mode === "dark" ? "light-content" : "dark-content"}
        backgroundColor="transparent"
      />
      {/*
        Full-bleed shell paints under transparent status + nav/home indicator.
        Native window fill (applySystemBarTheme) seals the physical bottom so a
        1px gap cannot show through. Only top inset keeps titles/chrome out of
        the status bar; screens float Back with insets.bottom + gap.
      */}
      <View
        collapsable={false}
        style={{
          flex: 1,
          paddingTop: insets.top,
          backgroundColor: "transparent",
        }}
      >
        {!bootstrapped ? null : currentPage === "onboarding" ? (
          <OnboardingScreen
            downloadedModels={downloadedModels}
            handleDownloadModel={handleDownloadModel}
            skipDestination={onboardingSkipTo}
            onFinished={(destination) => setCurrentPage(destination)}
          />
        ) : null}

        {bootstrapped && currentPage === "modelSelection" && (
        <PageFadeIn key="modelSelection">
          <ModelSelectionScreen
          downloadedModels={downloadedModels}
          localModels={localModels}
          setLocalModels={setLocalModels}
          handleDownloadModel={handleDownloadModel}
          setContext={setContext}
          setCurrentPage={setCurrentPage}
          checkDownloadedModels={checkDownloadedModels}
          selectedGGUF={selectedGGUF}
          setSelectedGGUF={setSelectedGGUF}
          onOpenModelSettings={(model) => {
            setSelectedModelForSettings(model);
            setCurrentPage("modelSettings");
          }}
          />
        </PageFadeIn>
      )}

      {bootstrapped && currentPage === "conversation" && (
        <PageFadeIn key="conversation">
          <ConversationScreen
          conversation={conversation}
          setConversation={setConversation}
          userInput={userInput}
          setUserInput={setUserInput}
          scrollViewRef={scrollViewRef}
          scrollPositionRef={scrollPositionRef}
          contentHeightRef={contentHeightRef}
          autoScrollEnabled={autoScrollEnabled}
          setAutoScrollEnabled={setAutoScrollEnabled}
          context={context}
          currentChatId={currentChatId}
          onChatIdChange={setCurrentChatId}
          onLoadChat={handleLoadChat}
          onNewChat={handleNewChat}
          onBackToModelSelection={handleBackToModelSelection}
          onGoToModelSelection={() => setCurrentPage("modelSelection")}
          assistantDisplayMode={assistantDisplayMode}
          onOpenSettings={() => setCurrentPage("settings")}
          selectedGGUF={selectedGGUF}
          setSelectedGGUF={setSelectedGGUF}
          downloadedModels={downloadedModels}
          setContext={setContext}
          checkDownloadedModels={checkDownloadedModels}
          selectedPersona={selectedPersona}
          setSelectedPersona={setSelectedPersona}
          onHistoryPanelChange={setFrostedChromeOpen}
          shellBackground={shellBackground}
          />
        </PageFadeIn>
      )}

      {currentPage === "settings" && (
        <PageFadeIn key="settings">
          <SettingsScreen
          assistantDisplayMode={assistantDisplayMode}
          setAssistantDisplayMode={setAssistantDisplayMode}
          onBackToConversation={() => setCurrentPage("conversation")}
          onOpenStats={() => setCurrentPage("stages")}
          onGoToModelSelection={() => setCurrentPage("modelSelection")}
          onGoToPersonas={() => setCurrentPage("personas")}
          onGoToInfo={() => setCurrentPage("info")}
          onGoToDiagnostics={() => setCurrentPage("diagnostics")}
          onGoToStorage={() => setCurrentPage("storage")}
          />
        </PageFadeIn>
      )}

      {currentPage === "storage" && (
        <PageFadeIn key="storage">
          <StorageScreen
            onBack={() => setCurrentPage("settings")}
            activeModelFileName={selectedGGUF}
            onUnloadIfActive={handleUnloadIfActiveModel}
            onModelsChanged={checkDownloadedModels}
            onChatHistoryCleared={handleNewChat}
            onBackupImported={async () => {
              await checkDownloadedModels();
              await loadAvailablePersonas();
              // Replace path already resets conversation via onChatHistoryCleared;
              // merge keeps the open chat unless parent opts to refresh.
            }}
          />
        </PageFadeIn>
      )}

      {currentPage === "hfToken" && (
        <PageFadeIn key="hfToken">
          <HfTokenScreen onBack={() => setCurrentPage("modelSelection")} />
        </PageFadeIn>
      )}

      {currentPage === "diagnostics" && (
        <PageFadeIn key="diagnostics">
          <DiagnosticsScreen
            onBack={() => setCurrentPage("settings")}
            modelPath={
              selectedGGUF
                ? `${RNFS.DocumentDirectoryPath}/${selectedGGUF}`
                : localModels.length > 0
                  ? localModels[0].filePath
                  : null
            }
          />
        </PageFadeIn>
      )}

      {currentPage === "stages" && (
        <PageFadeIn key="stages">
          <StagesScreen
            downloadedModels={downloadedModels}
            onBack={() => setCurrentPage("settings")}
          />
        </PageFadeIn>
      )}

      {currentPage === "personas" && (
        <PageFadeIn key="personas">
          <PersonasLibraryScreen
            onBack={() => setCurrentPage("settings")}
            onEditPersona={(persona) => {
              setEditingPersona(persona);
              setCurrentPage("personaEditor");
            }}
            onUsePersona={(persona) => {
              setSelectedPersona(persona);
              void updatePersonaLastUsed(persona.id);
              setCurrentPage("settings");
            }}
            downloadedModels={downloadedModels}
            handleDownloadModel={handleDownloadModel}
          />
        </PageFadeIn>
      )}

      {currentPage === "personaEditor" && editingPersona !== undefined && (
        <PageFadeIn key="personaEditor">
          <PersonaEditorScreen
            persona={editingPersona}
            onSave={(savedPersona) => {
              setSelectedPersona((prev) =>
                prev?.id === savedPersona.id ? savedPersona : prev
              );
              setEditingPersona(undefined);
              setCurrentPage("personas");
            }}
            onCancel={() => {
              setEditingPersona(undefined);
              setCurrentPage("personas");
            }}
          />
        </PageFadeIn>
      )}

      {currentPage === "modelSettings" && selectedModelForSettings && (
        <PageFadeIn key="modelSettings">
          <ModelSettingsScreen
            model={selectedModelForSettings}
            onBack={() => {
              setSelectedModelForSettings(null);
              setCurrentPage("modelSelection");
            }}
          />
        </PageFadeIn>
      )}

      {currentPage === "info" && (
        <PageFadeIn key="info">
          <InfoScreen
            onBack={() => setCurrentPage("settings")}
            onReviewOnboarding={() => {
              setOnboardingSkipTo("info");
              setCurrentPage("onboarding");
            }}
          />
        </PageFadeIn>
      )}
      </View>
      {/* Covers subpixel / SVG AA at the physical bottom inside the RN window. */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          backgroundColor: shellBackground,
        }}
      />
    </View>
  );
}

export default function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <CustomAlertProvider>
          <AppContent />
        </CustomAlertProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
