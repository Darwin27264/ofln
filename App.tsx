/**
 * App Component
 * 
 * Root component of the application. Manages global state, navigation, and model context.
 * Handles page transitions, model loading, and coordinates between screens.
 * 
 * Architecture:
 * - Centralized state management for model context and navigation
 * - Optimized page transitions with navigation stack tracking
 * - Memory management for model loading/unloading
 * - Theme and alert context providers
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { ScrollView, StatusBar, Platform } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from '@react-native-async-storage/async-storage';

import { createStyles } from "./src/styles/styles";
import { downloadModel, DownloadCancellationToken } from "./src/api/model";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Theme
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { applySystemBarTheme } from "./src/utils/systemBars";

// Components
import { CustomAlertProvider } from "./src/components/CustomAlert";
import { PageFadeIn } from "./src/components/PageFadeIn";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StagesScreen from "./src/screens/StagesScreen";
import PersonasLibraryScreen from "./src/screens/PersonasLibraryScreen";
import PersonaEditorScreen from "./src/screens/PersonaEditorScreen";
import ModelSettingsScreen from "./src/screens/ModelSettingsScreen";
import InfoScreen from "./src/screens/InfoScreen";
import DiagnosticsScreen from "./src/screens/DiagnosticsScreen";
import DevDiagnosticsScreen from "./src/screens/DevDiagnosticsScreen";
import { Persona, getPersonas } from "./src/services/personaService";
import { ModelInfo } from "./src/components/ModelCard";

// Services (legacy llama.rn — kept for backward compat)
import {
  loadModel,
  stopGeneration,
  handleSendMessageCompletion,
  checkFileExists,
  type SendMessageOptions,
} from "./src/services/llamaService";
import { validateLocalModels, LocalModelInfo } from "./src/services/localModelService";

// Vercel AI SDK integration layer
import { llamaProvider } from "./src/providers/llamaProvider";
import type { ModelStatus } from "./src/types/ai";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
  tokensPerSecond?: number;
  attachments?: Array<{ type: "image"; uri: string; width?: number; height?: number; fileName?: string }>;
};

function tokensPerSecondFromMessages(messages: Message[]): number[] {
  return messages
    .filter(
      (m): m is Message & { tokensPerSecond: number } =>
        m.role === "assistant" && typeof m.tokensPerSecond === "number",
    )
    .map((m) => m.tokensPerSecond);
}

function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

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

  // Determine status bar and nav bar colors based on app theme
  // Use theme background color for system bars to match app theme
  const statusBarColor = theme.colors.background;
  const navBarColor = theme.colors.background;
  
  // Apply system bar theme when theme changes
  useEffect(() => {
    if (Platform.OS === 'android') {
      applySystemBarTheme({ 
        statusBarColor, 
        navBarColor 
      });
    }
  }, [statusBarColor, navBarColor]);
  const INITIAL_CONVERSATION: Message[] = [
    {
      role: "system",
      content: "This is a conversation between user and assistant, a friendly chatbot.",
    },
  ];

  const [context, setContext] = useState<any>(null);
  const [conversation, setConversation] = useState<Message[]>(INITIAL_CONVERSATION);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedGGUF, setSelectedGGUF] = useState<string | null>(null);
  type PageType = "modelSelection" | "conversation" | "settings" | "stages" | "personas" | "personaEditor" | "modelSettings" | "info" | "diagnostics" | "devDiagnostics";
  const [currentPage, setCurrentPage] = useState<PageType>("conversation");
  const [editingPersona, setEditingPersona] = useState<Persona | null | undefined>(undefined);
  const [selectedModelForSettings, setSelectedModelForSettings] = useState<ModelInfo | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // AI SDK provider status — tracks readiness of the Vercel AI SDK model.
  // The provider is NOT auto-loaded alongside the legacy path to avoid
  // double memory usage.  Screens that adopt useAIChat should call
  // llamaProvider.loadModel() explicitly when they need the AI SDK path.
  const [aiModelStatus, setAiModelStatus] = useState<ModelStatus>(llamaProvider.getStatus());

  useEffect(() => {
    return llamaProvider.subscribe(setAiModelStatus);
  }, []);

  const [assistantDisplayMode, setAssistantDisplayModeState] = useState<"bubble" | "direct">(
    "bubble"
  );
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);

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
      // Filter for .gguf files only (case-insensitive check)
      const ggufFiles = files
        .filter((file) => file.name.toLowerCase().endsWith(".gguf"))
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
    setTokensPerSecond([]);
    setCurrentChatId(null);
    setCurrentPage("modelSelection");
  }, []);

  /**
   * Start a new chat conversation
   * 
   * Resets conversation to initial state while preserving loaded model.
   * 
   * Edge cases handled:
   * - Preserves model context (model stays loaded)
   * - Resets performance metrics
   */
  const handleNewChat = useCallback(() => {
    setConversation(INITIAL_CONVERSATION);
    setCurrentChatId(null);
    setTokensPerSecond([]);
  }, []);

  /**
   * Load an existing chat from history
   * 
   * @param chatId - Unique identifier for the chat
   * @param messages - Array of messages in the chat
   * 
   * Edge cases handled:
   * - Validates messages array is not empty
   * - Resets performance metrics for loaded chat
   */
  const handleLoadChat = useCallback(async (chatId: string, messages: Message[]) => {
    if (!messages || messages.length === 0) {
      console.warn('Attempted to load empty chat, using initial conversation');
      setConversation(INITIAL_CONVERSATION);
      return;
    }
    
    setConversation(messages);
    setCurrentChatId(chatId);
    setTokensPerSecond(tokensPerSecondFromMessages(messages));
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
   * - Network interruptions (handled by downloadModel with retry logic)
   * - Storage full (handled by downloadModel, user notified)
   * - Concurrent downloads (prevented by UI state)
   */
  const handleDownloadModel = useCallback(async (
    file: string, 
    repoId: string, 
    onProgress: (progress: number) => void,
    cancellationToken?: DownloadCancellationToken
  ) => {
    const downloadUrl = `https://huggingface.co/${repoId}/resolve/main/${file}`;
    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    
    // Check if already cancelled
    if (cancellationToken?.isCancelled()) {
      console.log("Download cancelled before starting");
      return;
    }
    
    // Check if model already exists locally
    if (await checkFileExists(destPath)) {
      // Model exists - load it directly without downloading
      const success = await loadModel(destPath, context, setContext);
      if (success) {
        setSelectedGGUF(file);
        await checkDownloadedModels(); // Refresh downloaded models list
        setCurrentPage("conversation");
        return;
      } else {
        // File exists but failed to load - may be corrupted
        console.error("Model file exists but failed to load - may be corrupted");
        return;
      }
    }
    
    // Model doesn't exist - download it
    try {
      await downloadModel(file, downloadUrl, onProgress, cancellationToken);
      
      // Check if cancelled after download
      if (cancellationToken?.isCancelled()) {
        console.log("Download was cancelled");
        return;
      }
      
      await checkDownloadedModels(); // Refresh downloaded models list
      
      // Load model after successful download
      const success = await loadModel(destPath, context, setContext);
      if (success) {
        setSelectedGGUF(file);
        setCurrentPage("conversation");
      } else {
        console.error("Failed to load the downloaded model - file may be corrupted");
        setSelectedGGUF(null); // Reset selection on load failure
      }
    } catch (error) {
      // Check if it's a cancellation error - don't show error for cancellations
      if (error instanceof Error && error.message === "Download was cancelled") {
        console.log("Download was cancelled by user");
        return;
      }
      
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.error("Download failed:", errorMessage);
      setSelectedGGUF(null); // Reset selection on error
      // Error is already handled by downloadModel, but we ensure state is clean
    }
  }, [context, setContext, checkDownloadedModels]);

  return (
    <>
      <StatusBar
        translucent={false}
        // Android: 'light-content' = light text/icons; 'dark-content' = dark icons
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={statusBarColor}
      />
      <SafeAreaView 
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['top', 'bottom', 'left', 'right']}
      >
        {currentPage === "modelSelection" && (
        <PageFadeIn key="modelSelection">
          <ModelSelectionScreen
          downloadedModels={downloadedModels}
          localModels={localModels}
          setLocalModels={setLocalModels}
          handleDownloadModel={handleDownloadModel}
          loadModel={loadModel}
          context={context}
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

      {currentPage === "conversation" && (
        <PageFadeIn key="conversation">
          <ConversationScreen
          conversation={conversation}
          setConversation={setConversation}
          userInput={userInput}
          setUserInput={setUserInput}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          isGenerating={isGenerating}
          setIsGenerating={setIsGenerating}
          tokensPerSecond={tokensPerSecond}
          setTokensPerSecond={setTokensPerSecond}
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
          stopGeneration={() =>
            stopGeneration(context, setIsGenerating, setIsLoading, setConversation)
          }
          handleSendMessageCompletion={(messages, userMsg, sendOptions?: SendMessageOptions) =>
            handleSendMessageCompletion(
              messages,
              userMsg,
              context,
              setConversation,
              setUserInput,
              setIsLoading,
              setIsGenerating,
              setAutoScrollEnabled,
              tokensPerSecond,
              setTokensPerSecond,
              scrollViewRef,
              selectedGGUF || "unknown",
              selectedPersona,
              sendOptions
            )
          }
          assistantDisplayMode={assistantDisplayMode}
          onOpenSettings={() => setCurrentPage("settings")}
          selectedGGUF={selectedGGUF}
          setSelectedGGUF={setSelectedGGUF}
          downloadedModels={downloadedModels}
          loadModel={loadModel}
          setContext={setContext}
          checkDownloadedModels={checkDownloadedModels}
          selectedPersona={selectedPersona}
          setSelectedPersona={setSelectedPersona}
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
          onOpenDevDiagnostics={__DEV__ ? () => setCurrentPage("devDiagnostics") : undefined}
          />
        </PageFadeIn>
      )}

      {currentPage === "diagnostics" && (
        <PageFadeIn key="diagnostics">
          <DiagnosticsScreen
            onBack={() => setCurrentPage("settings")}
          />
        </PageFadeIn>
      )}

      {__DEV__ && currentPage === "devDiagnostics" && (
        <PageFadeIn key="devDiagnostics">
          <DevDiagnosticsScreen
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
              setCurrentPage("settings");
            }}
          />
        </PageFadeIn>
      )}

      {currentPage === "personaEditor" && editingPersona !== undefined && (
        <PageFadeIn key="personaEditor">
          <PersonaEditorScreen
            persona={editingPersona}
            onSave={(savedPersona) => {
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
          />
        </PageFadeIn>
      )}
      </SafeAreaView>
    </>
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
