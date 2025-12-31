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

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { ScrollView, ActivityIndicator, Animated, StatusBar, Platform, InteractionManager } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { createStyles } from "./src/styles/styles";
import { downloadModel, DownloadCancellationToken } from "./src/api/model";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Theme
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { applySystemBarTheme } from "./src/utils/systemBars";
import { ANIMATION_CONFIG, EASING, ANIMATION_DURATIONS } from "./src/utils/animationConfig";

// Components
import { CustomAlertProvider } from "./src/components/CustomAlert";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StagesScreen from "./src/screens/StagesScreen";
import PersonasLibraryScreen from "./src/screens/PersonasLibraryScreen";
import PersonaEditorScreen from "./src/screens/PersonaEditorScreen";
import ModelSettingsScreen from "./src/screens/ModelSettingsScreen";
import SkillsLibraryScreen from "./src/screens/SkillsLibraryScreen";
import SkillRunnerScreen from "./src/screens/SkillRunnerScreen";
import SkillEditorScreen from "./src/screens/SkillEditorScreen";
import CodeLibLibraryScreen from "./src/screens/CodeLibLibraryScreen";
import CodeLibEditorScreen from "./src/screens/CodeLibEditorScreen";
import InfoScreen from "./src/screens/InfoScreen";
import { Persona, getPersonas } from "./src/services/personaService";
import { ModelInfo } from "./src/components/ModelCard";
import { Skill } from "./src/services/skillService";
import { CodeLibFunction } from "./src/services/codelibService";

// Services
import {
  loadModel,
  stopGeneration,
  handleSendMessageCompletion,
  checkFileExists,
} from "./src/services/llamaService";
import { validateLocalModels, LocalModelInfo } from "./src/services/localModelService";

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

function AppContent(): React.JSX.Element {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  
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
  type PageType = "modelSelection" | "conversation" | "settings" | "stages" | "personas" | "personaEditor" | "modelSettings" | "skills" | "skillRunner" | "skillEditor" | "codelib" | "codelibEditor" | "info";
  const [currentPage, setCurrentPage] = useState<PageType>("conversation");
  const [editingPersona, setEditingPersona] = useState<Persona | null | undefined>(undefined);
  const [selectedModelForSettings, setSelectedModelForSettings] = useState<ModelInfo | null>(null);
  const [runningSkill, setRunningSkill] = useState<Skill | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null | undefined>(undefined);
  const [editingCodeLibFunction, setEditingCodeLibFunction] = useState<CodeLibFunction | null | undefined>(undefined);
  const [testingCodeLibFunction, setTestingCodeLibFunction] = useState<CodeLibFunction | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [assistantDisplayMode, setAssistantDisplayMode] = useState<"bubble" | "direct">(
    "bubble"
  );
  const [selectedPersona, setSelectedPersona] = useState<Persona | null>(null);
  const [availablePersonas, setAvailablePersonas] = useState<Persona[]>([]);

  /**
   * Page transition animations
   * Optimized for mobile with reduced duration and native driver
   * Provides smooth transitions between screens
   * 
   * Uses navigation history stack to accurately determine back vs forward navigation
   * 
   * Performance optimizations:
   * - Animation cancellation to prevent conflicts
   * - InteractionManager to defer heavy operations
   * - Platform-specific optimizations
   * - Optimized animation values and timing
   */
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const pageTranslateX = useRef(new Animated.Value(0)).current;
  const previousPage = useRef<PageType>(currentPage);
  // Navigation history stack: tracks the sequence of pages visited
  // Used to determine if navigation is back (returning to previous page) or forward (new page)
  const navigationStack = useRef<PageType[]>([currentPage]);
  // Track ongoing animation to allow cancellation
  const ongoingAnimation = useRef<Animated.CompositeAnimation | null>(null);
  // Track if we should animate (set by useLayoutEffect)
  const shouldAnimateRef = useRef(false);

  // Use useLayoutEffect to set initial animation values synchronously before paint
  // This ensures the page starts with correct animation values before rendering
  useLayoutEffect(() => {
    // Skip animation on initial mount
    if (previousPage.current === currentPage) {
      return;
    }
    
    // Cancel any ongoing animation to prevent conflicts
    if (ongoingAnimation.current) {
      ongoingAnimation.current.stop();
      ongoingAnimation.current = null;
    }
    
    const stack = navigationStack.current;
    const previousPageInStack = stack.length > 1 ? stack[stack.length - 2] : null;
    
    // Determine if this is a back navigation
    // Back navigation occurs when:
    // 1. Target page is the previous page in the stack (immediate back), OR
    // 2. Target page exists earlier in the stack (going back to a page in history)
    const targetPageIndex = stack.indexOf(currentPage);
    const isImmediateBack = previousPageInStack === currentPage;
    const isBackToHistory = targetPageIndex !== -1 && targetPageIndex < stack.length - 1;
    const isBackNavigation = isImmediateBack || isBackToHistory;
    
    // Update navigation stack
    if (isBackNavigation) {
      if (isImmediateBack) {
        // Immediate back: remove current page from stack
        stack.pop();
      } else if (isBackToHistory) {
        // Going back to a page in history: remove everything after that page
        stack.splice(targetPageIndex + 1);
      }
    } else {
      // Forward navigation: add new page to stack
      stack.push(currentPage);
    }
    
    // Use larger offset for back navigation to make it visually distinct
    // Forward: slides in from right (20px), Back: slides in from left (50px)
    const initialTranslateX = isBackNavigation ? -50 : 20;
    
    // Set initial values synchronously before render to ensure animation starts correctly
    // This is critical - values must be set before React paints the new page
    pageOpacity.setValue(0);
    pageTranslateX.setValue(initialTranslateX);
    
    // Set flag to trigger animation in useEffect
    shouldAnimateRef.current = true;
    
    // Update previous page immediately to prevent double-triggering
    previousPage.current = currentPage;
  }, [currentPage]);

  // Use useEffect for the actual animation to ensure it runs after layout
  useEffect(() => {
    /**
     * Animate page transitions when currentPage changes
     * Uses fade + slide animation for modern feel
     * 
     * Performance optimizations:
     * - Animation cancellation prevents conflicts when navigating quickly
     * - InteractionManager defers heavy operations until after animation
     * - Platform-specific duration adjustments for optimal performance
     * - Reduced opacity animation for better performance on low-end devices
     * - Native driver for 60fps performance on UI thread
     */
    
    // Only animate if useLayoutEffect set the flag
    if (!shouldAnimateRef.current) {
      return;
    }
    
    // Reset flag
    shouldAnimateRef.current = false;
    
    // Use centralized animation configuration for consistency
    const animationDuration = ANIMATION_DURATIONS.PAGE;
    
    // Create animation with optimized configuration
    const animation = Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: animationDuration,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslateX, {
        toValue: 0,
        duration: animationDuration,
        easing: EASING.STANDARD,
        useNativeDriver: true,
      }),
    ]);
    
    // Store animation reference for potential cancellation
    ongoingAnimation.current = animation;
    
    // Start animation
    animation.start((finished) => {
      if (finished) {
        ongoingAnimation.current = null;
        
        // Defer heavy operations until after animation completes
        // This prevents jank during transitions
        InteractionManager.runAfterInteractions(() => {
          // Heavy operations can be performed here if needed
          // Currently no heavy operations needed, but this pattern is ready for future use
        });
      }
    });
    
    // Cleanup function to cancel animation if component unmounts or page changes again
    return () => {
      if (ongoingAnimation.current) {
        ongoingAnimation.current.stop();
        ongoingAnimation.current = null;
      }
    };
  }, [currentPage]);

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
    if (currentPage === "skillRunner" || currentPage === "personas" || currentPage === "conversation") {
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
    setTokensPerSecond([]); // Reset tokens per second for new chat
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

  // Memoize transition style to prevent unnecessary recalculations
  // Animated.Value refs are stable, so this only creates the object once
  const pageTransitionStyle = React.useMemo(() => ({
    opacity: pageOpacity,
    transform: [{ translateX: pageTranslateX }],
  }), []); // Empty deps - Animated.Value refs never change

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
        edges={['bottom', 'left', 'right']}
      >
        {currentPage === "modelSelection" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
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
        </Animated.View>
      )}

      {currentPage === "conversation" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
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
          handleSendMessageCompletion={(messages, userMsg) =>
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
              selectedGGUF || "unknown",  // Pass the selected model for usage tracking
              selectedPersona  // Pass the selected persona for prompt injection
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
        </Animated.View>
      )}

      {currentPage === "settings" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <SettingsScreen
          assistantDisplayMode={assistantDisplayMode}
          setAssistantDisplayMode={setAssistantDisplayMode}
          onBackToConversation={() => setCurrentPage("conversation")}
          // Clicking the stats block navigates to the Stages page.
          onOpenStats={() => setCurrentPage("stages")}
          onGoToModelSelection={() => setCurrentPage("modelSelection")}
          onGoToPersonas={() => setCurrentPage("personas")}
          onGoToSkills={() => setCurrentPage("skills")}
          onGoToInfo={() => setCurrentPage("info")}
          />
        </Animated.View>
      )}

      {currentPage === "stages" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <StagesScreen
            downloadedModels={downloadedModels}
            onBack={() => setCurrentPage("settings")}
          />
        </Animated.View>
      )}

      {currentPage === "personas" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
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
        </Animated.View>
      )}

      {currentPage === "personaEditor" && editingPersona !== undefined && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
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
        </Animated.View>
      )}

      {currentPage === "modelSettings" && selectedModelForSettings && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <ModelSettingsScreen
            model={selectedModelForSettings}
            onBack={() => {
              setSelectedModelForSettings(null);
              setCurrentPage("modelSelection");
            }}
          />
        </Animated.View>
      )}

      {currentPage === "skills" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <SkillsLibraryScreen
            onBack={() => setCurrentPage("settings")}
            onRunSkill={(skill) => {
              setRunningSkill(skill);
              setCurrentPage("skillRunner");
            }}
            onEditSkill={(skill) => {
              setEditingSkill(skill);
              setCurrentPage("skillEditor");
            }}
            onGoToCodeLib={() => setCurrentPage("codelib")}
          />
        </Animated.View>
      )}

      {currentPage === "skillRunner" && runningSkill && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <SkillRunnerScreen
            skill={runningSkill}
            onBack={() => {
              setRunningSkill(null);
              setCurrentPage("skills");
            }}
            selectedModelId={selectedGGUF || undefined}
            selectedPersona={selectedPersona}
            onModelSelect={() => setCurrentPage("modelSelection")}
            onPersonaSelect={() => setCurrentPage("personas")}
            context={context}
            downloadedModels={downloadedModels}
            loadModel={loadModel}
            setSelectedGGUF={setSelectedGGUF}
            setContext={setContext}
            availablePersonas={availablePersonas}
            setSelectedPersona={setSelectedPersona}
          />
        </Animated.View>
      )}

      {currentPage === "skillEditor" && editingSkill !== undefined && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <SkillEditorScreen
            skill={editingSkill}
            onSave={async (savedSkill) => {
              const { saveSkill } = await import("./src/services/skillService");
              await saveSkill(savedSkill);
              setEditingSkill(undefined);
              setCurrentPage("skills");
            }}
            onCancel={() => {
              setEditingSkill(undefined);
              setCurrentPage("skills");
            }}
            onTest={(testSkill) => {
              setRunningSkill(testSkill);
              setCurrentPage("skillRunner");
            }}
          />
        </Animated.View>
      )}

      {currentPage === "codelib" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <CodeLibLibraryScreen
            onBack={() => setCurrentPage("skills")}
            onEditFunction={(func) => {
              setEditingCodeLibFunction(func);
              setCurrentPage("codelibEditor");
            }}
            onTestFunction={(func) => {
              setTestingCodeLibFunction(func);
              // Could open a test modal or navigate to test screen
            }}
          />
        </Animated.View>
      )}

      {currentPage === "codelibEditor" && editingCodeLibFunction !== undefined && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <CodeLibEditorScreen
            function={editingCodeLibFunction}
            onSave={async (savedFunction) => {
              const { saveCodeLibFunction } = await import("./src/services/codelibService");
              await saveCodeLibFunction(savedFunction);
              setEditingCodeLibFunction(undefined);
              setCurrentPage("codelib");
            }}
            onCancel={() => {
              setEditingCodeLibFunction(undefined);
              setCurrentPage("codelib");
            }}
          />
        </Animated.View>
      )}

      {currentPage === "info" && (
        <Animated.View 
          style={[{ flex: 1 }, pageTransitionStyle]}
          collapsable={false}
        >
          <InfoScreen
            onBack={() => setCurrentPage("settings")}
          />
        </Animated.View>
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
