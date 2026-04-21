// llamaservice.ts
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { initLlama, loadLlamaModelInfo } from "llama.rn";
import { recordUsage, getPerformanceLevel } from "./usageTracker";
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from "./modelSettingsService";
import { Persona, buildPersonaSystemPrompt } from "./personaService";
import { logError } from "../utils/errorLogger";
import { isAndroidEmulator } from "./deviceEnv";
import { getModelInfo, detectQuantFromFilename, isQuantAllowedForAndroidAccel } from "./modelInfoService";
import { getAccelerationConfig } from "./accelerationCapabilityService";

// Types
type MessageAttachment = {
  type: "image";
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
};

type Message = {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  showThought?: boolean;
  attachments?: MessageAttachment[];
};

export type SendMessageOptions = {
  /** When set, this text is sent to the model instead of message content (e.g. OCR-injected text). */
  textForPrompt?: string;
  attachments?: MessageAttachment[];
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
    
    // Preflight: load basic model info for debugging (DEV-only)
    try {
      const modelUri = filePath.startsWith("file://") ? filePath : `file://${filePath}`;
      const modelInfo = await getModelInfo(modelUri);
      if (__DEV__) {
        console.log("[ofln] Preflight model info", {
          fileName,
          modelUri,
          requested_n_ctx: settings.n_ctx,
          requested_n_gpu_layers: settings.n_gpu_layers,
          modelInfo,
        });
      }
    } catch (infoError) {
      if (__DEV__) {
        console.log("[ofln] Failed to load model info", {
          fileName,
          filePath,
          error: infoError instanceof Error ? infoError.message : String(infoError),
        });
      }
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
    
    // Android-specific acceleration gating:
    // - Per-model n_gpu_layers (set in Model Settings)
    // - Emulator detection
    // - Quantization allowlist (Q4_0, Q6_K)
    // - Runtime device check (OpenCL / Hexagon NPU via getBackendDevicesInfo)
    let isEmulator = false;
    let appliedQuant: string | null = null;
    let appliedNgpuLayers = 0;
    let appliedUseMlock = true;
    let accelReason = "default";
    let appliedDevices: string[] | undefined;

    if (Platform.OS === "android") {
      isEmulator = isAndroidEmulator();

      const modelUri = filePath.startsWith("file://") ? filePath : `file://${filePath}`;
      const info = await getModelInfo(modelUri);

      // Prefer info-derived quant if present; fall back to filename
      // llama.rn model info shape is not strictly documented; avoid hard assumptions.
      const infoQuant =
        info && typeof (info as any).general?.quantization === "string"
          ? ((info as any).general.quantization as string)
          : null;
      appliedQuant = infoQuant || detectQuantFromFilename(fileName);

      // Default for Android: CPU-only, no mlock.
      appliedUseMlock = false;
      appliedNgpuLayers = 0;
      appliedDevices = undefined;
      accelReason = "cpu_default";

      if (isEmulator) {
        accelReason = "emulator";
        adjustedN_gpu_layers = 0;
      } else if (!isQuantAllowedForAndroidAccel(appliedQuant)) {
        accelReason = "quant_not_allowlisted";
        adjustedN_gpu_layers = 0;
      } else {
        // Acceleration allowed: runtime device check for OpenCL / Hexagon NPU.
        const accelConfig = await getAccelerationConfig();
        const desired = typeof adjustedN_gpu_layers === "number" ? adjustedN_gpu_layers : 0;
        const maxCap = accelConfig.suggestedMaxGpuLayers; // 99 when HTP or OpenCL available, else 0
        const capped = Math.max(0, Math.min(maxCap > 0 ? maxCap : 8, desired));
        adjustedN_gpu_layers = capped;
        appliedNgpuLayers = capped;
        appliedDevices = accelConfig.preferredDevices; // ['HTP0'] when Hexagon NPU available
        accelReason = accelConfig.hasHTP
          ? "hexagon_npu"
          : accelConfig.hasOpenCL || accelConfig.devices.length > 0
            ? "opencl_gpu"
            : "accel_allowed";
      }

      if (__DEV__) {
        console.log("[ModelLoading] Android acceleration gating", {
          fileName,
          isEmulator,
          quant: appliedQuant,
          requested_n_gpu_layers: settings.n_gpu_layers,
          adjusted_n_gpu_layers: adjustedN_gpu_layers,
          applied_n_gpu_layers: appliedNgpuLayers,
          appliedDevices,
          appliedUseMlock,
          reason: accelReason,
        });
      }
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

        // Apply platform-specific overrides computed above.
        let attemptUseMlock = useMlock;
        let attemptNgpuLayers = adjustedN_gpu_layers;

        if (Platform.OS === "android") {
          attemptUseMlock = appliedUseMlock;
          attemptNgpuLayers = appliedNgpuLayers;
        }

        const initParams: Parameters<typeof initLlama>[0] = {
          model: filePath,
          use_mlock: attemptUseMlock,
          n_ctx: adjustedN_ctx,
          n_gpu_layers: attemptNgpuLayers,
        };
        if (Platform.OS === "android" && appliedDevices && appliedDevices.length > 0) {
          initParams.devices = appliedDevices;
        }

        console.log(
          `Attempting to load model: ${fileName} (attempt ${loadAttempts + 1}/${maxAttempts}) with use_mlock: ${attemptUseMlock}, n_gpu_layers: ${attemptNgpuLayers}, devices: ${appliedDevices ? JSON.stringify(appliedDevices) : "default"}, platform: ${Platform.OS}`
        );

        llamaContext = await initLlama(initParams);

        if (llamaContext) {
          const gpuStatus = {
            gpu: (llamaContext as any).gpu,
            reasonNoGPU: (llamaContext as any).reasonNoGPU,
            devices: (llamaContext as any).devices,
          };
          console.log(
            `Successfully loaded model: ${fileName} with use_mlock: ${attemptUseMlock}. GPU: ${gpuStatus.gpu}, reasonNoGPU: ${gpuStatus.reasonNoGPU || "—"}, devices: ${JSON.stringify(gpuStatus.devices || [])}`
          );
          if (__DEV__) {
            console.log("[ModelLoading] Runtime GPU status", gpuStatus);
          }
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
  selectedPersona: Persona | null = null,
  sendOptions?: SendMessageOptions
) => {
  // Validate context exists
  if (!context) {
    console.error("Model not loaded - cannot send message");
    return;
  }

  const hasAttachments = sendOptions?.attachments && sendOptions.attachments.length > 0;
  // Validate: need either non-empty text or attachments
  if (!hasAttachments && (!userInput || !userInput.trim())) {
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

  const displayContent = (userInput || "").trim() || (hasAttachments ? "(Image attached)" : "");
  const newConversation: Message[] = [
    ...conversation,
    {
      role: "user",
      content: displayContent,
      attachments: sendOptions?.attachments,
    },
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

    // ── Model family detection ────────────────────────────────────────────
    // Families that toggle thinking via llama.rn's Jinja `enable_thinking`
    // param are grouped under `isJinjaThinkingModel`. Only Qwen3 currently
    // has a template-level toggle that our streaming layer can drive.
    //
    // Families that emit literal <think>…</think> spans in the token
    // stream (either always, or conditionally) are grouped under
    // `supportsThinkTags`. Those include:
    //   • Qwen3 / Qwen3.5 / QwQ — native thinking models
    //   • DeepSeek R1 and its distills — always-on reasoning
    //   • SmolLM3 — optional /think reasoning mode (chat template emits
    //     <think> blocks when reasoning_mode=/think; we parse them the
    //     same way regardless)
    //
    // Gemma 3 / Gemma 3n and Phi-4 Mini intentionally NOT included — they
    // do not produce <think> spans despite being capable reasoners, and
    // forcing the parser on them would corrupt normal output containing
    // literal "<think>" text (e.g. when summarising chat logs).
    const normalizedModelName = selectedModel.toLowerCase();
    const isQwen3ThinkingModel =
      // "qwen3" matches qwen3, qwen3.5, qwen3-4b-instruct-2507 — but NOT
      // qwen2.5 / qwen2 / qwen1. The negative lookahead guards against a
      // hypothetical "qwen3n" suffix.
      /qwen3(?![a-z])/.test(normalizedModelName) || normalizedModelName.includes("qwq");
    const isDeepSeekR1 =
      normalizedModelName.includes("deepseek-r1") ||
      /\br1d\b/.test(normalizedModelName);
    const isSmolLM3 = /smollm3/.test(normalizedModelName);
    const supportsThinkTags = isQwen3ThinkingModel || isDeepSeekR1 || isSmolLM3;

    // ── Query complexity heuristic ────────────────────────────────────────
    // For Qwen3 thinking models we decide whether to enable thinking at the
    // API level using llama.rn's `enable_thinking` parameter (Jinja template
    // aware).  Thinking is expensive and almost always unnecessary for short
    // conversational messages, so we disable it for "simple" queries and let
    // the model think only when it is genuinely useful.
    //
    // Complexity signals (any one match → complex):
    //   • ≥ 20 words
    //   • Explicit reasoning verbs (explain, analyse, solve, prove, …)
    //   • Math operators / LaTeX
    //   • Inline code or code fences
    //   • More than one question mark (multi-part query)
    const _inputForComplexity = sendOptions?.textForPrompt || userInput;
    const isComplexQuery = (() => {
      const text = _inputForComplexity.trim();
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      if (wordCount >= 20) return true;
      if (/\b(explain|analyze|analyse|compare|solve|calculate|prove|derive|implement|debug|optimize|refactor|design|summarize|summarise|translate|evaluate|critique)\b/i.test(text)) return true;
      if (/[+\-*/^=<>√∫∑∏≈≤≥≠]|\\[a-z]+\{/.test(text)) return true; // math / LaTeX
      if (/```|`[^`]+`/.test(text)) return true;  // code
      if ((text.match(/\?/g) || []).length > 1) return true; // multi-question
      return false;
    })();

    // `enable_thinking`: for Qwen3 models, disable via the Jinja template
    //   when the query is simple to get fast direct responses.
    // `reasoning_format`: set to 'auto' so that when thinking IS enabled,
    //   llama.cpp extracts the thought tokens into `reasoning_content` during
    //   streaming (instead of leaving them inline in `data.token`).
    //   Defaults to 'none' in llama.rn which is why reasoning_content was
    //   always empty before.
    // `enable_thinking` is a Qwen-specific Jinja flag. Do NOT send it for
    // SmolLM3 — its template reads /think or /no_think from the system
    // message instead and will raise on an unknown template variable.
    const enableThinking = isQwen3ThinkingModel ? isComplexQuery : undefined;
    // Ask llama.cpp to surface reasoning tokens in `reasoning_content`
    // whenever we expect thinking output. DeepSeek R1 is always-on.
    // SmolLM3 defaults to /think in its template so treat it as always-on
    // unless the user explicitly negated via their system prompt (we do
    // not parse that case — stripping still works via the XML fallback).
    const reasoningFormat: 'auto' | 'none' =
      (isQwen3ThinkingModel && isComplexQuery) || isDeepSeekR1 || isSmolLM3
        ? 'auto'
        : 'none';

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
    let hasReceivedThought = false;

    // llama.rn 0.11.2 TokenData shape.
    // `reasoning_content` is populated by llama.cpp when reasoning_format is
    // 'auto' or 'deepseek' and the model is generating thinking tokens.
    interface CompletionData {
      token: string;
      reasoning_content?: string;
    }
    interface CompletionResult {
      timings: {
        predicted_per_second: number;
      };
    }

    // Build system prompt from persona settings (no model-family hacks needed
    // since thinking is now controlled at the API level, not via prompting).
    const systemPrompt = buildPersonaSystemPrompt(selectedPersona, settings.systemPrompt);

    // Update conversation with system prompt
    let conversationWithSystemPrompt: Message[];
    const systemMessageIndex = newConversation.findIndex(msg => msg.role === "system");
    
    if (systemMessageIndex >= 0) {
      conversationWithSystemPrompt = newConversation.map((msg, idx) => {
        if (idx === systemMessageIndex) {
          return { ...msg, content: systemPrompt };
        }
        return msg;
      });
    } else {
      conversationWithSystemPrompt = [
        { role: "system", content: systemPrompt },
        ...newConversation,
      ];
    }

    // When textForPrompt is set (e.g. OCR-injected), use it for the model prompt
    const textForPrompt = sendOptions?.textForPrompt;
    if (textForPrompt !== undefined && textForPrompt !== "") {
      const lastIdx = conversationWithSystemPrompt.length - 1;
      if (lastIdx >= 0 && conversationWithSystemPrompt[lastIdx].role === "user") {
        conversationWithSystemPrompt = [...conversationWithSystemPrompt];
        conversationWithSystemPrompt[lastIdx] = {
          ...conversationWithSystemPrompt[lastIdx],
          content: textForPrompt,
        };
      }
    }

    // ── Sliding-window context trim ────────────────────────────────────────
    // Without trimming, the entire message array is forwarded and the context
    // window silently overflows — llama.cpp drops tokens from the start, which
    // removes the system prompt first.  Once the system prompt is gone the
    // model becomes verbose and repetitive.
    //
    // Strategy (no token-counter needed):
    //   • ~3.5 chars ≈ 1 token (conservative estimate, works for English/mixed)
    //   • Budget = (n_ctx - n_predict - 128 safety) tokens for the whole prompt
    //   • Always keep: system message + current user message (last)
    //   • Fill remaining budget with history pairs newest-first
    conversationWithSystemPrompt = (() => {
      if (conversationWithSystemPrompt.length <= 2) return conversationWithSystemPrompt;

      const CHARS_PER_TOKEN = 3.5;
      const budgetTokens = Math.max(0, settings.n_ctx - settings.n_predict - 128);
      let budgetChars = budgetTokens * CHARS_PER_TOKEN;

      // Separate pinned messages from history
      const systemMsg = conversationWithSystemPrompt[0]; // always first
      const currentUserMsg = conversationWithSystemPrompt[conversationWithSystemPrompt.length - 1];
      const history = conversationWithSystemPrompt.slice(1, -1); // middle messages

      budgetChars -= (systemMsg.content?.length ?? 0);
      budgetChars -= (currentUserMsg.content?.length ?? 0);

      if (budgetChars <= 0 || history.length === 0) {
        return [systemMsg, currentUserMsg];
      }

      // Walk backward through history, keeping as many recent messages as fit
      const kept: typeof history = [];
      for (let i = history.length - 1; i >= 0; i--) {
        const msgChars = (history[i].content?.length ?? 0) + 20; // +20 for role overhead
        if (budgetChars - msgChars < 0) break;
        budgetChars -= msgChars;
        kept.unshift(history[i]);
      }

      return [systemMsg, ...kept, currentUserMsg];
    })();
    // ── End sliding-window trim ────────────────────────────────────────────

    const result: CompletionResult = await context.completion(
      {
        messages: conversationWithSystemPrompt,
        n_predict: settings.n_predict,
        temperature: settings.temperature,
        top_p: settings.top_p,
        top_k: settings.top_k,
        repeat_penalty: settings.repeat_penalty,
        stop: stopWords,
        // Thinking control (llama.rn 0.11.2+, Qwen3 / DeepSeek R1 aware):
        // `enable_thinking` is passed to the Jinja chat template — false tells
        //   Qwen3 to skip thinking entirely (template inserts empty <think></think>).
        // `reasoning_format: 'auto'` makes llama.cpp extract reasoning tokens
        //   into `data.reasoning_content` during streaming so they never appear
        //   in the visible `data.token` stream.
        ...(enableThinking !== undefined && { enable_thinking: enableThinking }),
        reasoning_format: reasoningFormat,
      },
      (data: CompletionData) => {
        // ── PATH A: Native reasoning tokens ────────────────────────────────
        // llama.cpp delivers the FULL accumulated reasoning text in each
        // `reasoning_content` callback (not just the delta).  We detect
        // whether NEW content has arrived by comparing the incoming string
        // to what we already have:
        //   • if longer  → still thinking, replace and update state
        //   • if equal   → thinking phase over; fall through to PATH B so
        //                  the actual response token in `data.token` is
        //                  processed normally
        //   • if absent  → definitely not thinking, go to PATH B
        if (data.reasoning_content && data.reasoning_content !== currentThought) {
          hasReceivedThought = true;
          // Replace (not append) because reasoning_content is the full text
          currentThought = data.reasoning_content;
          setConversation((prev) => {
            const lastIndex = prev.length - 1;
            if (lastIndex < 0) return prev;
            const updated = [...prev];
            updated[lastIndex] = {
              ...updated[lastIndex],
              thought: currentThought,
              // Keep content empty so the ThinkingIndicator stays visible
              content: "",
            };
            return updated;
          });
          if (scrollViewRef.current) {
            requestAnimationFrame(() => {
              scrollViewRef.current.scrollToEnd({ animated: false });
            });
          }
          return;
        }

        // ── PATH B: Regular token ──────────────────────────────────────────
        const token = data.token;
        if (!token) {
          return;
        }

        currentAssistantMessage += token;

        // ── PATH B1: XML <think> tag parsing (fallback) ────────────────────
        // For models that emit literal <think>…</think> in the token stream
        // (i.e. llama.cpp did NOT extract them natively), parse them here.
        // While inside a think block, update the thought progressively and
        // keep the visible content empty.
        if (supportsThinkTags) {
          if (token.includes("<think>")) {
            inThinkBlock = true;
            hasReceivedThought = true;
            currentThought += token.replace("<think>", "");
            setConversation((prev) => {
              const lastIndex = prev.length - 1;
              if (lastIndex < 0) return prev;
              const updated = [...prev];
              updated[lastIndex] = {
                ...updated[lastIndex],
                thought: currentThought,
                content: "",
              };
              return updated;
            });
            if (scrollViewRef.current) {
              requestAnimationFrame(() => {
                scrollViewRef.current.scrollToEnd({ animated: false });
              });
            }
            return;
          }

          if (inThinkBlock) {
            if (token.includes("</think>")) {
              inThinkBlock = false;
              currentThought += token.replace("</think>", "");
              currentThought = currentThought.trim();
              // Thought is finalised — state will be updated below with the
              // cleaned visible content, preserving the thought field.
            } else {
              // Still inside think block — accumulate thought, hide content.
              currentThought += token;
              setConversation((prev) => {
                const lastIndex = prev.length - 1;
                if (lastIndex < 0) return prev;
                const updated = [...prev];
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  thought: currentThought,
                  content: "",
                };
                return updated;
              });
              if (scrollViewRef.current) {
                requestAnimationFrame(() => {
                  scrollViewRef.current.scrollToEnd({ animated: false });
                });
              }
              return;
            }
          }
        }

        // ── PATH B2: Compute visible content ──────────────────────────────
        // Strip any <think> blocks (complete or still-open) from the
        // accumulated message so they never appear in the bubble.
        let visibleContent = currentAssistantMessage;
        if (supportsThinkTags) {
          visibleContent = visibleContent
            .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
            .replace(/<think>.*?<\/think>/gs, "")
            .replace(/<think>[\s\S]*$/, "");
        }
        visibleContent = visibleContent
          .replace(/<end_of_turn>/g, "")
          .replace(/<\/?eos>/g, "")
          .trim();

        setConversation((prev) => {
          const lastIndex = prev.length - 1;
          if (lastIndex < 0) return prev;
          const updated = [...prev];
          updated[lastIndex] = {
            ...updated[lastIndex],
            // Always set content directly — never fall back to stale content,
            // as that caused "disappearing text" during streamed think blocks.
            content: visibleContent,
            // Preserve the thought that was accumulated; don't overwrite with
            // undefined once PATH A or B1 has already set it.
            thought: currentThought || updated[lastIndex].thought,
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

    // Compute the final visible content by stripping any think blocks.
    // Also flush the final thought to state in case the stream ended inside
    // a think block (e.g. generation was stopped mid-thought).
    let finalVisibleContent = currentAssistantMessage;
    if (supportsThinkTags) {
      finalVisibleContent = finalVisibleContent
        .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
        .replace(/<think>.*?<\/think>/gs, "")
        .replace(/<think>[\s\S]*$/, "");
    }
    finalVisibleContent = finalVisibleContent
      .replace(/<end_of_turn>/g, "")
      .replace(/<\/?eos>/g, "")
      .trim();

    // Ensure the final thought and visible content are committed to state.
    // This is a no-op when streaming completed normally but matters when the
    // user stopped generation mid-thought or mid-response.
    if (hasReceivedThought || currentThought) {
      setConversation((prev) => {
        const lastIndex = prev.length - 1;
        if (lastIndex < 0) return prev;
        const updated = [...prev];
        updated[lastIndex] = {
          ...updated[lastIndex],
          thought: currentThought.trim() || updated[lastIndex].thought,
          content: finalVisibleContent || updated[lastIndex].content || "",
        };
        return updated;
      });
    }
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
