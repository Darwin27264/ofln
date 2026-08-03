// llamaservice.ts
// Product model load is llamaProvider.loadModel only (S01). This module keeps
// checkFileExists for App/Diagnostics; legacy stop/completion helpers remain
// unused by UI (chat uses useAIChat → nativeCompletion).
import RNFS from "react-native-fs";
import {
  recordCompletionUsage,
  approxTokenCountFromText,
} from "./performanceTracking";
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from "./modelSettingsService";
import { Persona, buildPersonaSystemPrompt } from "./personaService";
import { buildCompletionParams, trimConversation, adaptSystemPromptForThinking, isThinkingMetaLoop } from "./inference";

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
      top_p: topP,
      top_k: topK,
      penalty_repeat: penaltyRepeat,
      penalty_present: penaltyPresent,
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

    // Build system prompt from persona settings. When thinking is enabled for
    // this turn, strip anti-CoT rules so the model doesn't stall debating them.
    const systemPrompt = adaptSystemPromptForThinking(
      buildPersonaSystemPrompt(selectedPersona, settings.systemPrompt),
      !!enableThinking,
    );

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
        top_p: topP,
        top_k: topK,
        // llama.rn 0.12+ native keys (OpenAI-style `repeat_penalty` is ignored).
        penalty_repeat: penaltyRepeat,
        penalty_present: penaltyPresent,
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
          if (isThinkingMetaLoop(currentThought)) {
            Promise.resolve(context.stopCompletion?.()).catch(() => {});
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
              if (isThinkingMetaLoop(currentThought)) {
                Promise.resolve(context.stopCompletion?.()).catch(() => {});
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
