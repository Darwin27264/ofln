/* App.tsx */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { ScrollView, ActivityIndicator, Animated, Easing, StatusBar, Platform, InteractionManager } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { createStyles } from "./src/styles/styles";
import { downloadModel } from "./src/api/model";
import { releaseAllLlama } from "llama.rn";
import RNFS from "react-native-fs";
import axios from "axios";

// Theme
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import { applySystemBarTheme } from "./src/utils/systemBars";

// Components
import { CustomAlertProvider } from "./src/components/CustomAlert";

// Screens
import ModelSelectionScreen from "./src/screens/ModelSelectionScreen";
import ConversationScreen from "./src/screens/ConversationScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StagesScreen from "./src/screens/StagesScreen";

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
  type PageType = "modelSelection" | "conversation" | "settings" | "stages";
  const [currentPage, setCurrentPage] = useState<PageType>("conversation");
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [downloadedModels, setDownloadedModels] = useState<string[]>([]);
  const [localModels, setLocalModels] = useState<LocalModelInfo[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [assistantDisplayMode, setAssistantDisplayMode] = useState<"bubble" | "direct">(
    "bubble"
  );

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

  useEffect(() => {
    /**
     * Animate page transitions when currentPage changes
     * Uses fade + slide animation for modern feel
     * 
     * Determines navigation direction using navigation history stack:
     * - Forward: navigating to a new page (slides in from right: translateX: 20 to 0)
     * - Backward: returning to a previously visited page (slides in from left: translateX: -50 to 0)
     * 
     * Navigation stack logic:
     * - If target page is the previous page in stack → back navigation (pop from stack)
     * - Otherwise → forward navigation (push to stack)
     * 
     * Performance optimizations:
     * - Animation cancellation prevents conflicts when navigating quickly
     * - InteractionManager defers heavy operations until after animation
     * - Platform-specific duration adjustments for optimal performance
     * - Reduced opacity animation for better performance on low-end devices
     * - Native driver for 60fps performance on UI thread
     */
    
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
    
    // Platform-specific optimizations
    // iOS typically handles animations better, Android may benefit from slightly longer duration
    const animationDuration = Platform.OS === 'ios' ? 220 : 250;
    
    // Use larger offset for back navigation to make it visually distinct
    // Forward: slides in from right (20px), Back: slides in from left (50px)
    const initialTranslateX = isBackNavigation ? -50 : 20;
    
    // Set initial values immediately for instant visual feedback
    pageOpacity.setValue(0);
    pageTranslateX.setValue(initialTranslateX);
    
    // Create animation with optimized configuration
    const animation = Animated.parallel([
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: animationDuration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
        useNativeDriver: true,
      }),
      Animated.timing(pageTranslateX, {
        toValue: 0,
        duration: animationDuration,
        easing: Easing.bezier(0.4, 0.0, 0.2, 1),
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
    
    // Update previous page after animation starts
    previousPage.current = currentPage;
    
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

  useEffect(() => {
    checkDownloadedModels();
  }, [currentPage, checkDownloadedModels]);

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
  const handleDownloadModel = useCallback(async (file: string, repoId: string, onProgress: (progress: number) => void) => {
    const downloadUrl = `https://huggingface.co/${repoId}/resolve/main/${file}`;
    const destPath = `${RNFS.DocumentDirectoryPath}/${file}`;
    
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
      await downloadModel(file, downloadUrl, onProgress);
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
      <SafeAreaView style={[styles.container, { backgroundColor: theme.colors.background }]}>
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
              selectedGGUF || "unknown"  // Pass the selected model for usage tracking
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
