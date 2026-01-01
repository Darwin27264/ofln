// llamaservice.ts
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { initLlama } from "llama.rn";
import { recordUsage, getPerformanceLevel } from "./usageTracker";
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from "./modelSettingsService";
import { Persona, buildPersonaSystemPrompt } from "./personaService";
import { logError } from "../utils/errorLogger";

// Types
type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
};

/**
 * Check if a file exists in RNFS
 */
export const checkFileExists = async (filePath: string) => {
  try {
    const fileExists = await RNFS.exists(filePath);
    return fileExists;
  } catch (error) {
    console.error("Error checking file existence:", error);
    return false;
  }
};

/**
 * Load the model from local path
 * 
 * Handles model loading with proper error handling and context management.
 * Releases previous model context before loading new one to prevent memory leaks.
 * 
 * @param filePath - Full path to the model file
 * @param context - Current llama context (if any)
 * @param setContext - State setter for context
 * @returns Promise<boolean> - True if model loaded successfully, false otherwise
 * 
 * Edge cases handled:
 * - Missing or invalid file path
 * - Model settings loading failures (uses defaults)
 * - Context release failures
 * - Memory constraints during model loading
 */
export const loadModel = async (
  filePath: string,
  context: any,
  setContext: React.Dispatch<React.SetStateAction<any>>
): Promise<boolean> => {
  try {
    // Validate file path
    if (!filePath || typeof filePath !== 'string') {
      const errorMsg = "Invalid file path provided to loadModel";
      console.error(errorMsg);
      await logError("ModelLoading", errorMsg, undefined, { filePath });
      return false;
    }

    // Verify file exists before attempting to load
    // This is especially important on Samsung devices where file access might be restricted
    const fileExists = await checkFileExists(filePath);
    if (!fileExists) {
      const errorMsg = `Model file does not exist at path: ${filePath}`;
      console.error(errorMsg);
      await logError("ModelLoading", errorMsg, undefined, { filePath });
      return false;
    }

    // Release old context to prevent memory leaks
    if (context) {
      try {
        // Release old context before loading new one
        // This prevents memory leaks and ensures clean state
        if (typeof context.release === 'function') {
          context.release();
        }
        setContext(null);
        // Add a small delay to ensure proper cleanup before loading new model
        // This is especially important on Samsung devices with aggressive memory management
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (releaseError) {
        // Log but don't fail - we'll try to load anyway
        console.warn("Error releasing previous context:", releaseError);
        // Still add delay even if release had an error
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    // Get model-specific settings with fallback to defaults
    const fileName = filePath.split('/').pop() || '';
    let settings;
    try {
      settings = await getModelSettings(fileName);
    } catch (settingsError) {
      // Use defaults if settings loading fails
      console.warn("Failed to load model settings, using defaults:", settingsError);
      settings = DEFAULT_SETTINGS;
    }
    
    // For Samsung devices, reduce context window size to prevent memory issues
    // This is a conservative approach to ensure models load successfully
    let adjustedN_ctx = settings.n_ctx;
    let adjustedN_gpu_layers = settings.n_gpu_layers;
    
    // Try to detect Samsung device (basic check - can be enhanced)
    const isLikelySamsung = Platform.OS === 'android' && (
      // Check if we're on a device that might have memory constraints
      // This is a heuristic - in production you might want to use device detection library
      adjustedN_ctx > 2048
    );
    
    if (isLikelySamsung && adjustedN_ctx > 2048) {
      // Reduce context window for Samsung devices to prevent crashes
      adjustedN_ctx = Math.min(2048, adjustedN_ctx);
      console.log(`Reduced context window to ${adjustedN_ctx} for better compatibility`);
    }
    
    // Try to initialize llama context with use_mlock: true first
    // This helps prevent memory swapping on mobile devices
    // If it fails (e.g., on Samsung devices with strict memory management),
    // fall back to use_mlock: false
    let llamaContext;
    let loadAttempts = 0;
    const maxAttempts = 3;
    
    while (loadAttempts < maxAttempts && !llamaContext) {
      try {
        const useMlock = loadAttempts === 0; // Try with mlock first, then without
        console.log(`Attempting to load model: ${fileName} (attempt ${loadAttempts + 1}/${maxAttempts}) with use_mlock: ${useMlock}`);
        
        llamaContext = await initLlama({
          model: filePath,
          use_mlock: useMlock,
          n_ctx: adjustedN_ctx,
          n_gpu_layers: adjustedN_gpu_layers,
        });
        
        if (llamaContext) {
          console.log(`Successfully loaded model: ${fileName} with use_mlock: ${useMlock}`);
          break;
        }
      } catch (attemptError) {
        loadAttempts++;
        const errorMsg = attemptError instanceof Error ? attemptError.message : "Unknown error";
        const errorStack = attemptError instanceof Error ? attemptError.stack : undefined;
        
        console.warn(`Load attempt ${loadAttempts} failed: ${errorMsg}`);
        if (errorStack) {
          console.warn("Error stack:", errorStack);
        }
        
        // Log the attempt error
        await logError(
          "ModelLoading",
          `Load attempt ${loadAttempts}/${maxAttempts} failed`,
          attemptError instanceof Error ? attemptError : new Error(String(attemptError)),
          {
            fileName,
            attempt: loadAttempts,
            use_mlock: loadAttempts === 1,
            n_ctx: adjustedN_ctx,
            n_gpu_layers: adjustedN_gpu_layers,
          },
          "WARN"
        );
        
        // If this was the last attempt, throw the error
        if (loadAttempts >= maxAttempts) {
          // Try one more time with even more conservative settings
          try {
            console.log(`Final attempt with reduced settings: n_ctx=${Math.min(1024, adjustedN_ctx)}, n_gpu_layers=0`);
            llamaContext = await initLlama({
              model: filePath,
              use_mlock: false,
              n_ctx: Math.min(1024, adjustedN_ctx), // Very conservative context window
              n_gpu_layers: 0, // Disable GPU layers as last resort
            });
            
            if (llamaContext) {
              console.log(`Successfully loaded model with reduced settings`);
              await logError(
                "ModelLoading",
                "Model loaded successfully with reduced settings after failures",
                undefined,
                { fileName, finalN_ctx: Math.min(1024, adjustedN_ctx), finalN_gpu_layers: 0 },
                "INFO"
              );
              break;
            }
          } catch (finalError) {
            const finalErrorMsg = finalError instanceof Error ? finalError.message : "Unknown error";
            console.error(`Final load attempt failed: ${finalErrorMsg}`);
            await logError(
              "ModelLoading",
              "All model loading attempts failed",
              finalError instanceof Error ? finalError : new Error(String(finalError)),
              {
                fileName,
                filePath,
                totalAttempts: loadAttempts + 1,
                originalN_ctx: settings.n_ctx,
                originalN_gpu_layers: settings.n_gpu_layers,
              }
            );
            throw finalError;
          }
        } else {
          // Wait a bit before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    // Validate context was created successfully
    if (!llamaContext) {
      const errorMsg = "Failed to create llama context after all attempts";
      console.error(errorMsg);
      await logError(
        "ModelLoading",
        errorMsg,
        undefined,
        { fileName, filePath }
      );
      return false;
    }
    
    console.log(`Successfully loaded model: ${fileName}`);
    setContext(llamaContext);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error loading model:", errorMessage);
    if (errorStack) {
      console.error("Error stack:", errorStack);
    }
    
    // Determine error category and suggestions
    let errorCategory = "ModelLoading";
    let suggestions: string[] = [];
    
    // Check for specific error types that might indicate memory issues
    if (errorMessage.toLowerCase().includes('memory') || 
        errorMessage.toLowerCase().includes('out of memory') ||
        errorMessage.toLowerCase().includes('oom')) {
      errorCategory = "ModelLoading.Memory";
      suggestions = [
        "Close other apps to free up RAM",
        "Try a smaller model",
        "Reduce context window size in model settings",
        "Disable GPU layers if enabled",
      ];
      console.error("Memory-related error detected. This may indicate insufficient RAM or device memory limits.");
    }
    
    // Check for file access errors (common on Samsung devices with file restrictions)
    if (errorMessage.toLowerCase().includes('permission') ||
        errorMessage.toLowerCase().includes('access') ||
        errorMessage.toLowerCase().includes('denied') ||
        errorMessage.toLowerCase().includes('not found')) {
      errorCategory = "ModelLoading.FileAccess";
      suggestions = [
        "Check file permissions",
        "Verify file path is correct",
        "Ensure file is not corrupted",
        "Try re-downloading the model",
      ];
      console.error("File access error detected. Check file permissions and path.");
    }
    
    // Log the error with full context
    await logError(
      errorCategory,
      `Failed to load model: ${errorMessage}`,
      error instanceof Error ? error : new Error(String(error)),
      {
        fileName: filePath.split('/').pop() || 'unknown',
        filePath,
        suggestions,
        errorType: error instanceof Error ? error.name : "Unknown",
      }
    );
    
    // Ensure context is cleared on error
    setContext(null);
    return false;
  }
};

/**
 * Stop generation
 * 
 * Stops the ongoing model generation and updates UI state.
 * Adds a marker to the last assistant message indicating generation was stopped.
 * 
 * @param context - Llama context instance
 * @param setIsGenerating - State setter for generation state
 * @param setIsLoading - State setter for loading state
 * @param setConversation - State setter for conversation
 * 
 * Edge cases handled:
 * - Missing or invalid context (gracefully handles)
 * - No assistant message to update (preserves conversation)
 * - stopCompletion() failure (still updates UI state)
 */
export const stopGeneration = async (
  context: any,
  setIsGenerating: (val: boolean) => void,
  setIsLoading: (val: boolean) => void,
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>
) => {
  try {
    // Attempt to stop completion if context is valid
    if (context && typeof context.stopCompletion === 'function') {
      await context.stopCompletion();
    }
  } catch (error) {
    // Log error but continue to update UI state
    console.error("Error stopping completion:", error);
  } finally {
    // Always update UI state, even if stopCompletion failed
    setIsGenerating(false);
    setIsLoading(false);
    
    // Update conversation to indicate generation was stopped
    setConversation((prev) => {
      if (prev.length === 0) return prev;
      
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "assistant") {
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: lastMessage.content + "\n\n*Generation stopped by user*",
          },
        ];
      }
      return prev;
    });
  }
};

/**
 * Handle sending a message and streaming the completion tokens
 * 
 * Manages the complete message sending and response generation flow:
 * - Validates input and context
 * - Updates conversation state
 * - Streams tokens in real-time
 * - Handles thinking/reasoning blocks for reasoning models
 * - Tracks performance metrics
 * - Handles errors gracefully
 * 
 * @param conversation - Current conversation messages
 * @param userInput - User's message input
 * @param context - Llama context for inference
 * @param setConversation - State setter for conversation
 * @param setUserInput - State setter for user input
 * @param setIsLoading - State setter for loading state
 * @param setIsGenerating - State setter for generation state
 * @param setAutoScrollEnabled - State setter for auto-scroll
 * @param tokensPerSecond - Array of tokens per second metrics
 * @param setTokensPerSecond - State setter for tokens per second
 * @param scrollViewRef - Ref to scroll view for auto-scrolling
 * @param selectedModel - Currently selected model name
 * @param selectedPersona - Currently selected persona (optional)
 * 
 * Edge cases handled:
 * - Missing or invalid context
 * - Empty user input
 * - Model settings loading failures
 * - Streaming errors
 * - Stop word handling
 * - Thinking block parsing
 * - Performance metric calculation errors
 */
export const handleSendMessageCompletion = async (
  conversation: Message[],
  userInput: string,
  context: any,
  setConversation: React.Dispatch<React.SetStateAction<Message[]>>,
  setUserInput: (val: string) => void,
  setIsLoading: (val: boolean) => void,
  setIsGenerating: (val: boolean) => void,
  setAutoScrollEnabled: (val: boolean) => void,
  tokensPerSecond: number[],
  setTokensPerSecond: React.Dispatch<React.SetStateAction<number[]>>,
  scrollViewRef: React.RefObject<any>,
  selectedModel: string,
  selectedPersona: Persona | null = null
) => {
  // Validate context exists
  if (!context) {
    console.error("Model not loaded - cannot send message");
    return;
  }
  
  // Validate user input is not empty
  if (!userInput || !userInput.trim()) {
    console.error("Input error: empty message - cannot send");
    return;
  }

  // Get model-specific settings (with fallback to defaults)
  let settings: ModelSettings;
  try {
    settings = await getModelSettings(selectedModel);
  } catch (error) {
    console.error("Error loading model settings, using defaults:", error);
    settings = DEFAULT_SETTINGS;
  }

  const newConversation: Message[] = [
    ...conversation,
    { role: "user", content: userInput },
  ];
  setConversation(newConversation);
  setUserInput("");
  setIsLoading(true);
  setIsGenerating(true);
  setAutoScrollEnabled(true);

  // Start tracking inference time
  const startTime = Date.now();

  try {
    const stopWords = [
      "</s>",
      "<|end|>",
      "user:",
      "assistant:",
      "<|im_end|>",
      "<|eot_id|>",
      "<|end▁of▁sentence|>",
      "<|end_of_text|>",
      "<｜end▁of▁sentence｜>",
      "<end_of_turn>",
      "<eos>",
      "</eos>",
    ];

    // Placeholder for assistant's response
    setConversation((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "",
        thought: undefined,
        showThought: false,
      },
    ]);
    let currentAssistantMessage = "";
    let currentThought = "";
    let inThinkBlock = false;

    interface CompletionData {
      token: string;
    }
    interface CompletionResult {
      timings: {
        predicted_per_second: number;
      };
    }

    // Build system prompt with persona information if available
    const systemPrompt = buildPersonaSystemPrompt(selectedPersona, settings.systemPrompt);
    
    // Update conversation with system prompt
    // If there's no system message, add one; otherwise update the first system message
    let conversationWithSystemPrompt: Message[];
    const systemMessageIndex = newConversation.findIndex(msg => msg.role === "system");
    
    if (systemMessageIndex >= 0) {
      // Update the first system message
      conversationWithSystemPrompt = newConversation.map((msg, idx) => {
        if (idx === systemMessageIndex) {
          return { ...msg, content: systemPrompt };
        }
        return msg;
      });
    } else {
      // Add system message at the beginning
      conversationWithSystemPrompt = [
        { role: "system", content: systemPrompt },
        ...newConversation,
      ];
    }

    const result: CompletionResult = await context.completion(
      {
        messages: conversationWithSystemPrompt,
        n_predict: settings.n_predict,
        temperature: settings.temperature,
        top_p: settings.top_p,
        top_k: settings.top_k,
        repeat_penalty: settings.repeat_penalty,
        stop: stopWords,
      },
      (data: CompletionData) => {
        const token = data.token;
        currentAssistantMessage += token;

        if (token.includes("<think>")) {
          inThinkBlock = true;
          currentThought = token.replace("<think>", "");
        } else if (token.includes("</think>")) {
          inThinkBlock = false;
          const finalThought = currentThought.replace("</think>", "").trim();

          setConversation((prev) => {
            const lastIndex = prev.length - 1;
            const updated = [...prev];
            updated[lastIndex] = {
              ...updated[lastIndex],
              content: updated[lastIndex].content.replace(
                `<think>${finalThought}</think>`,
                ""
              ),
              thought: finalThought,
            };
            return updated;
          });

          currentThought = "";
        } else if (inThinkBlock) {
          currentThought += token;
        }

        // Remove thinking blocks but preserve content
        // Use a more robust regex that handles incomplete blocks
        let visibleContent = currentAssistantMessage
          .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
          .replace(/<think>.*$/gs, "") // Handle incomplete reasoning blocks
          .replace(/<end_of_turn>/g, "") // Remove end of turn tokens
          .replace(/<\/?eos>/g, ""); // Remove eos tokens (both <eos> and </eos>)
        
        // Only trim if content exists to prevent losing whitespace-only content during generation
        if (visibleContent.length > 0) {
          visibleContent = visibleContent.trim();
        }

        setConversation((prev) => {
          const lastIndex = prev.length - 1;
          if (lastIndex < 0) return prev; // Safety check
          
          const updated = [...prev];
          // Ensure we always preserve content, even if it's just whitespace during generation
          updated[lastIndex] = {
            ...updated[lastIndex],
            content: visibleContent || updated[lastIndex].content || "",
          };
          return updated;
        });

        if (scrollViewRef.current) {
          requestAnimationFrame(() => {
            scrollViewRef.current.scrollToEnd({ animated: false });
          });
        }
      }
    );

    // Calculate metrics after completion
    const endTime = Date.now();
    const inferenceTime = endTime - startTime; // in milliseconds
    // Remove thinking blocks and end tokens from final content
    const finalVisibleContent = currentAssistantMessage
      .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
      .replace(/<think>.*$/gs, "") // Handle incomplete reasoning blocks
      .replace(/<end_of_turn>/g, "") // Remove end of turn tokens
      .replace(/<\/?eos>/g, "") // Remove eos tokens (both <eos> and </eos>)
      .trim();
    const tokenCount = finalVisibleContent
      .split(" ")
      .filter((t) => t.length > 0).length;
    const tps = result.timings.predicted_per_second;
    const performanceLevel = getPerformanceLevel(tps);

    // Save tokens per second metric for UI display
    setTokensPerSecond((prev) => [...prev, parseFloat(tps.toFixed(2))]);

    // Record usage metrics – note the new "model" property being added
    recordUsage({
      timestamp: Date.now(),
      inferenceTime,
      tokenCount,
      tokensPerSecond: tps,
      performanceLevel,
      model: selectedModel,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error("Error during inference:", errorMessage);
    
    // Update conversation to show error state
    setConversation((prev) => {
      const lastMessage = prev[prev.length - 1];
      if (lastMessage && lastMessage.role === "assistant" && lastMessage.content === "") {
        // Replace empty assistant message with error message
        return [
          ...prev.slice(0, -1),
          {
            ...lastMessage,
            content: `Error: ${errorMessage}. Please try again.`,
          },
        ];
      }
      return prev;
    });
  } finally {
    // Always reset loading states, even on error
    setIsLoading(false);
    setIsGenerating(false);
  }
};
