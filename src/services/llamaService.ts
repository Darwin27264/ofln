// llamaservice.ts
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { initLlama, loadLlamaModelInfo, releaseAllLlama } from "llama.rn";
import {
  recordCompletionUsage,
  approxTokenCountFromText,
} from "./performanceTracking";
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from "./modelSettingsService";
import { Persona, buildPersonaSystemPrompt } from "./personaService";
import { logError } from "../utils/errorLogger";
import { isAndroidEmulator } from "./deviceEnv";
import { getModelInfo, detectQuantFromFilename, isQuantAllowedForAndroidAccel } from "./modelInfoService";
import { getAccelerationConfig } from "./accelerationCapabilityService";
import { getInferencePerfParams, formatLoadError } from "./inferencePerfParams";
import { ensureGgufSafeForAndroidLoad } from "./ggufSanitizeService";
import { buildCompletionParams, trimConversation } from "./inference";

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

    // Emulators often OOM on 4B+ GGUFs; fail early with a clear tip.
    const earlyEmulator = isAndroidEmulator();
    if (earlyEmulator) {
      try {
        const stat = await RNFS.stat(filePath);
        const sizeBytes = Number(stat.size) || 0;
        const sizeMB = Math.round(sizeBytes / (1024 * 1024));
        // ~1.6GB+: typically too large for stock AVDs (needs ~2–3× RAM headroom).
        if (sizeMB >= 1600) {
          const errorMsg =
            `Model is too large for the Android emulator (${sizeMB} MB). ` +
            `Use Qwen3.5 0.8B / 2B Q4_0, or raise AVD RAM to 6GB+ and try again.`;
          console.error(errorMsg);
          await logError("ModelLoading", errorMsg, new Error(errorMsg), {
            filePath,
            fileName: filePath.split("/").pop(),
            sizeMB,
            isEmulator: true,
            tip: "On emulator prefer Qwen3.5-0.8B or 2B Q4_0",
          });
          setContext(null);
          return false;
        }
      } catch (statError) {
        console.warn("[ModelLoading] Could not stat model file for size check:", statError);
      }
    }

    // Fix Qwen3.5+ huge chat_template crashing llama.rn init (prebuilt 16KB buffer).
    if (Platform.OS === "android") {
      await ensureGgufSafeForAndroidLoad(filePath);
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
          hasInfo: !!modelInfo,
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
        // Emulators are RAM-starved; keep context small so initLlama can succeed.
        adjustedN_ctx = Math.min(adjustedN_ctx, 1024);
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
          adjusted_n_ctx: adjustedN_ctx,
          appliedDevices,
          appliedUseMlock,
          reason: accelReason,
        });
      }
    }

    // Staged attempts so Android/emulator retries actually change something
    // (mlock is always false on Android, so the old 3x identical loop was useless).
    const attemptNgpuLayers =
      Platform.OS === "android" ? appliedNgpuLayers : adjustedN_gpu_layers;
    const attemptUseMlock =
      Platform.OS === "android" ? appliedUseMlock : true;

    type InitStage = {
      label: string;
      n_ctx: number;
      n_gpu_layers: number;
      use_mlock: boolean;
      bare?: boolean; // skip flash_attn / n_batch / KV extras
    };

    const stages: InitStage[] = [
      {
        label: "primary",
        n_ctx: adjustedN_ctx,
        n_gpu_layers: attemptNgpuLayers,
        use_mlock: attemptUseMlock,
      },
      {
        label: "bare-params",
        n_ctx: adjustedN_ctx,
        n_gpu_layers: attemptNgpuLayers,
        use_mlock: false,
        bare: true,
      },
      {
        label: "minimal",
        n_ctx: Math.min(isEmulator ? 512 : 1024, adjustedN_ctx),
        n_gpu_layers: 0,
        use_mlock: false,
        bare: true,
      },
    ];

    let llamaContext: Awaited<ReturnType<typeof initLlama>> | null = null;
    let lastError: unknown = null;

    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      try {
        const initParams: Parameters<typeof initLlama>[0] = {
          model: filePath,
          use_mlock: stage.use_mlock,
          n_ctx: stage.n_ctx,
          n_gpu_layers: stage.n_gpu_layers,
        };

        if (!stage.bare) {
          const perf = getInferencePerfParams(stage.n_gpu_layers, { isEmulator });
          initParams.flash_attn_type = perf.flash_attn_type;
          initParams.n_batch = perf.n_batch;
          if (perf.cache_type_k) initParams.cache_type_k = perf.cache_type_k;
          if (perf.cache_type_v) initParams.cache_type_v = perf.cache_type_v;
        }

        if (
          Platform.OS === "android" &&
          !stage.bare &&
          appliedDevices &&
          appliedDevices.length > 0 &&
          stage.n_gpu_layers > 0
        ) {
          initParams.devices = appliedDevices;
        }

        console.log(
          `[ModelLoading] ${stage.label} (${i + 1}/${stages.length}): ` +
            `n_ctx=${stage.n_ctx} n_gpu_layers=${stage.n_gpu_layers} bare=${!!stage.bare} ` +
            `emulator=${isEmulator} file=${fileName}`
        );

        llamaContext = await initLlama(initParams);

        if (llamaContext) {
          const gpuStatus = {
            gpu: (llamaContext as any).gpu,
            reasonNoGPU: (llamaContext as any).reasonNoGPU,
            devices: (llamaContext as any).devices,
          };
          console.log(
            `Successfully loaded model: ${fileName} via ${stage.label}. ` +
              `GPU: ${gpuStatus.gpu}, reasonNoGPU: ${gpuStatus.reasonNoGPU || "—"}`
          );
          if (__DEV__) {
            console.log("[ModelLoading] Runtime GPU status", gpuStatus);
          }
          break;
        }
      } catch (attemptError) {
        lastError = attemptError;
        const errorMsg = formatLoadError(attemptError);
        console.warn(`[ModelLoading] ${stage.label} failed: ${errorMsg}`);
        // Native load can succeed while JS metadata marshalling fails — orphaned
        // contexts leak RAM. Always clear before the next stage.
        try {
          await releaseAllLlama();
        } catch {
          /* ignore */
        }
        await logError(
          "ModelLoading",
          `Load stage "${stage.label}" failed: ${errorMsg}`,
          attemptError instanceof Error ? attemptError : new Error(errorMsg),
          {
            fileName,
            stage: stage.label,
            n_ctx: stage.n_ctx,
            n_gpu_layers: stage.n_gpu_layers,
            bare: !!stage.bare,
            isEmulator,
          },
          "WARN"
        );
        // Brief pause before next stage
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    }

    if (!llamaContext) {
      const errorMsg = formatLoadError(lastError) || "Failed to create llama context after all attempts";
      console.error(`[ModelLoading] All stages failed: ${errorMsg}`);
      await logError(
        "ModelLoading",
        `All model loading attempts failed: ${errorMsg}`,
        lastError instanceof Error ? lastError : new Error(errorMsg),
        {
          fileName,
          filePath,
          isEmulator,
          originalN_ctx: settings.n_ctx,
          originalN_gpu_layers: settings.n_gpu_layers,
          tip: isEmulator
            ? "On emulator use Qwen3.5 0.8B / 2B and raise AVD RAM to 4GB+"
            : "Try a smaller GGUF or lower n_ctx in model settings",
        }
      );
      setContext(null);
      return false;
    }

    console.log(`Successfully loaded model: ${fileName}`);
    setContext(llamaContext);
    return true;
  } catch (error) {
    const errorMessage = formatLoadError(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error loading model:", errorMessage);
    if (errorStack) {
      console.error("Error stack:", errorStack);
    }

    // Determine error category and suggestions
    let errorCategory = "ModelLoading";
    let suggestions: string[] = [];

    // Check for specific error types that might indicate memory issues
    if (
      errorMessage.toLowerCase().includes("memory") ||
      errorMessage.toLowerCase().includes("out of memory") ||
      errorMessage.toLowerCase().includes("oom")
    ) {
      errorCategory = "ModelLoading.Memory";
      suggestions = [
        "Close other apps to free up RAM",
        "Try a smaller model",
        "Reduce context window size in model settings",
        "Disable GPU layers if enabled",
        "On emulator: use 0.8B/2B models and raise AVD RAM",
      ];
      console.error(
        "Memory-related error detected. This may indicate insufficient RAM or device memory limits."
      );
    }

    // Check for file access errors (common on Samsung devices with file restrictions)
    if (
      errorMessage.toLowerCase().includes("permission") ||
      errorMessage.toLowerCase().includes("access") ||
      errorMessage.toLowerCase().includes("denied") ||
      errorMessage.toLowerCase().includes("not found")
    ) {
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
      error instanceof Error ? error : new Error(errorMessage),
      {
        fileName: filePath.split("/").pop() || "unknown",
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
    // ── Shared completion params (family + thinking + stop + n_predict) ──
    const _inputForComplexity = sendOptions?.textForPrompt || userInput;
    const completion = buildCompletionParams({
      userText: _inputForComplexity,
      modelName: selectedModel,
      settings,
    });
    const {
      n_predict: nPredict,
      temperature,
      repeat_penalty: repeatPenalty,
      stop,
      enable_thinking: enableThinking,
      reasoning_format: reasoningFormat,
      supportsThinkTags,
    } = completion;

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
      timings?: {
        predicted_per_second?: number;
        predicted_n?: number;
        predicted_ms?: number;
        prompt_n?: number;
        prompt_ms?: number;
      };
      text?: string;
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

    // Sliding-window trim (shared with aiChatService)
    conversationWithSystemPrompt = trimConversation(
      conversationWithSystemPrompt,
      settings.n_ctx,
      settings.n_predict,
    );

    const result: CompletionResult = await context.completion(
      {
        messages: conversationWithSystemPrompt,
        n_predict: nPredict,
        temperature,
        top_p: settings.top_p,
        top_k: settings.top_k,
        repeat_penalty: repeatPenalty,
        stop,
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
    const usage = await recordCompletionUsage({
      model: selectedModel,
      wallTimeMs: inferenceTime,
      streamTokenCount: Math.max(
        1,
        approxTokenCountFromText(finalVisibleContent, currentThought),
      ),
      timings: result?.timings ?? null,
    });
    const tps = usage?.tokensPerSecond ?? 0;

    // Save tokens per second metric for UI display
    if (tps > 0) {
      setTokensPerSecond((prev) => [...prev, tps]);
    }
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
