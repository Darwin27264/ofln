/**
 * AI chat service — Vercel AI SDK `streamText` orchestration and native completion.
 *
 * Preserves thinking/reasoning parsing, context trim, performance metrics,
 * per-model settings, persona prompts, and vision formatting. Consumed by
 * `useAIChat`. Family detection and completion params live in `./inference`.
 */

import { streamText } from 'ai';

import { llamaProvider } from '../providers/llamaProvider';
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from './modelSettingsService';
import { Persona, buildPersonaSystemPrompt } from './personaService';
import { formatMessagesForVision, isVisionModel } from './visionService';
import {
  parseDocument,
  extractTextFromAttachment,
  prepareAttachmentForVision,
} from './documentParsingService';
import {
  recordCompletionUsage,
  approxTokenCountFromText,
} from './performanceTracking';
import { logError } from '../utils/errorLogger';
import { resolveModelPolicy } from './inference/modelPolicy';
import {
  buildCompletionParams,
  applyConversationTrim,
  stripThinkBlocks,
  trimDegenerateRepetition,
  finalizeVisibleAndThought,
  adaptSystemPromptForThinking,
  isThinkingMetaLoop,
  type PromptHeuristicMode,
} from './inference';

import type {
  ChatMessage,
  SendOptions,
  StreamCallbacks,
  CompletionResult,
} from '../types/ai';

/** Optional knobs for Perspective / non-standard message tails. */
export type NativeCompletionOptions = {
  /**
   * Text used for thinking / n_predict heuristics.
   * Defaults to the last message content (wrong when that message is an assistant).
   */
  heuristicUserText?: string;
  /** `debate` skips casual-chat simple caps and prefers Auto thinking off. */
  heuristicMode?: PromptHeuristicMode;
};

export interface StreamChatParams {
  messages: ChatMessage[];
  userInput: string;
  modelName: string;
  persona: Persona | null;
  sendOptions?: SendOptions;
}

/**
 * Stream a chat completion using the Vercel AI SDK.
 *
 * Returns an object with:
 *   - `result`: promise that resolves with the final CompletionResult
 *   - `abort`: function to cancel the stream
 *
 * Callbacks fire during streaming for UI updates.
 */
export function streamChat(
  params: StreamChatParams,
  callbacks: StreamCallbacks,
): { result: Promise<CompletionResult>; abort: () => void } {
  const abortController = new AbortController();

  const result = _runStream(params, callbacks, abortController.signal);

  return {
    result,
    abort: () => abortController.abort(),
  };
}

async function _runStream(
  params: StreamChatParams,
  callbacks: StreamCallbacks,
  signal: AbortSignal,
): Promise<CompletionResult> {
  const { messages, userInput, modelName, persona, sendOptions } = params;

  // ── Validate provider is ready ──────────────────────────────────────────
  const model = llamaProvider.getLanguageModel();
  if (!model) {
    const err = new Error('Model not loaded — cannot send message');
    callbacks.onError?.(err);
    throw err;
  }

  // ── Load model settings ─────────────────────────────────────────────────
  let settings: ModelSettings;
  try {
    settings = await getModelSettings(modelName);
  } catch {
    settings = DEFAULT_SETTINGS;
  }

  // ── Build system prompt ─────────────────────────────────────────────────
  const systemPrompt = buildPersonaSystemPrompt(persona, settings.systemPrompt);

  // ── Build conversation with system prompt ──────────────────────────────
  const hasAttachments = sendOptions?.attachments && sendOptions.attachments.length > 0;
  const displayContent = userInput.trim() || (hasAttachments ? '(Image attached)' : '');

  const userMessage: ChatMessage = {
    role: 'user',
    content: displayContent,
    attachments: sendOptions?.attachments,
  };

  // Construct full conversation
  let conversationMessages: ChatMessage[] = [...messages, userMessage];

  // Ensure system message is present
  const sysIdx = conversationMessages.findIndex((m) => m.role === 'system');
  if (sysIdx >= 0) {
    conversationMessages[sysIdx] = { ...conversationMessages[sysIdx], content: systemPrompt };
  } else {
    conversationMessages = [
      { role: 'system', content: systemPrompt },
      ...conversationMessages,
    ];
  }

  // Apply textForPrompt override for the last user message
  if (sendOptions?.textForPrompt) {
    const lastIdx = conversationMessages.length - 1;
    if (lastIdx >= 0 && conversationMessages[lastIdx].role === 'user') {
      conversationMessages[lastIdx] = {
        ...conversationMessages[lastIdx],
        content: sendOptions.textForPrompt,
      };
    }
  }

  // Handle document attachments: extract text for non-vision models,
  // or prepare base64 images for vision models.
  if (hasAttachments) {
    const lastIdx = conversationMessages.length - 1;
    const lastMsg = conversationMessages[lastIdx];

    if (isVisionModel(modelName)) {
      // Vision model: images will be embedded by formatMessagesForVision
      // For PDF attachments, extract text and prepend to prompt
      const pdfAttachments = (sendOptions!.attachments || []).filter(
        (a) => a.type === 'pdf',
      );
      if (pdfAttachments.length > 0) {
        const pdfTexts = await Promise.all(
          pdfAttachments.map((a) =>
            extractTextFromAttachment(a, {
              n_ctx: settings.n_ctx,
              n_predict: settings.n_predict,
            }),
          ),
        );
        const pdfContext = pdfTexts.filter(Boolean).join('\n\n---\n\n');
        if (pdfContext) {
          conversationMessages[lastIdx] = {
            ...lastMsg,
            content: `[Document content]\n${pdfContext}\n\n[User question]\n${lastMsg.content}`,
          };
        }
      }
    } else {
      // Text-only model: extract text from all attachments
      const allTexts = await Promise.all(
        (sendOptions!.attachments || []).map((a) =>
          extractTextFromAttachment(a, {
            n_ctx: settings.n_ctx,
            n_predict: settings.n_predict,
          }),
        ),
      );
      const attachmentContext = allTexts.filter(Boolean).join('\n\n---\n\n');
      if (attachmentContext) {
        conversationMessages[lastIdx] = {
          ...lastMsg,
          content: `[Attached content]\n${attachmentContext}\n\n[User message]\n${lastMsg.content}`,
        };
      }
    }
  }

  // ── Format for AI SDK (embed images for vision) ─────────────────────────
  let aiMessages = await formatMessagesForVision(conversationMessages, modelName);

  // ── Sliding-window trim ─────────────────────────────────────────────────
  const trimResult = applyConversationTrim(
    aiMessages,
    settings.n_ctx,
    settings.n_predict,
  );
  aiMessages = trimResult.messages;
  const trimmedMessageCount = trimResult.droppedCount;

  // ── Thinking / reasoning config (shared builder) ────────────────────────
  const inputText = sendOptions?.textForPrompt || userInput;
  const completion = buildCompletionParams({
    userText: inputText,
    modelName,
    settings,
  });
  const {
    n_predict: maxTokens,
    temperature,
    top_p: topP,
    stop: stopSequences,
    supportsThinkTags,
    enable_thinking: enableThinking,
  } = completion;

  // Keep anti-CoT rules out of thinking turns (same as nativeCompletion).
  if (enableThinking) {
    aiMessages = aiMessages.map((m: any) =>
      m.role === 'system'
        ? { ...m, content: adaptSystemPromptForThinking(String(m.content ?? ''), true) }
        : m,
    );
  }

  // ── Stream via Vercel AI SDK ────────────────────────────────────────────
  const startTime = Date.now();
  let fullText = '';
  let currentThought = '';

  try {
    const { textStream } = streamText({
      model,
      messages: aiMessages as any, // AI SDK message type
      maxTokens,
      temperature,
      topP,
      stopSequences,
      abortSignal: signal,
    });

    let inThinkBlock = false;

    for await (const delta of textStream) {
      if (signal.aborted) break;

      // Think block parsing
      if (supportsThinkTags) {
        if (delta.includes('<think>')) {
          inThinkBlock = true;
          const afterTag = delta.replace('<think>', '');
          currentThought += afterTag;
          callbacks.onThought?.(currentThought);
          continue;
        }

        if (inThinkBlock) {
          if (delta.includes('</think>')) {
            inThinkBlock = false;
            currentThought += delta.replace('</think>', '');
            currentThought = currentThought.trim();
            callbacks.onThought?.(currentThought);
          } else {
            currentThought += delta;
            callbacks.onThought?.(currentThought);
            continue;
          }
          continue;
        }
      }

      fullText += delta;
      const visibleText = supportsThinkTags
        ? stripThinkBlocks(fullText)
        : fullText;
      callbacks.onToken?.(visibleText);
    }

    // Finalise
    const endTime = Date.now();
    const wallTimeMs = endTime - startTime;
    const approxTokens = Math.max(
      1,
      approxTokenCountFromText(fullText, currentThought),
    );
    const usage = await recordCompletionUsage({
      model: modelName,
      wallTimeMs,
      streamTokenCount: approxTokens,
      timings: null,
    });
    const visibleContent = trimDegenerateRepetition(
      supportsThinkTags ? stripThinkBlocks(fullText) : fullText.trim(),
    );

    const completionResult: CompletionResult = {
      text: visibleContent,
      thought: currentThought || undefined,
      tokensPerSecond: usage?.tokensPerSecond ?? 0,
      totalTokens: usage?.tokenCount ?? approxTokens,
      inferenceTimeMs: wallTimeMs,
      trimmedMessageCount,
    };

    callbacks.onFinish?.(completionResult);
    return completionResult;
  } catch (error) {
    if (signal.aborted) {
      const stoppedResult: CompletionResult = {
        text: fullText.trim() + '\n\n*Generation stopped by user*',
        thought: currentThought || undefined,
        tokensPerSecond: 0,
        totalTokens: approxTokenCountFromText(fullText, currentThought),
        inferenceTimeMs: Date.now() - startTime,
        trimmedMessageCount,
      };
      callbacks.onFinish?.(stoppedResult);
      return stoppedResult;
    }

    const err = error instanceof Error ? error : new Error(String(error));
    await logError('AIChat', `Stream error: ${err.message}`, err, { modelName });
    callbacks.onError?.(err);
    throw err;
  }
}

// ── Legacy Bridge ──────────────────────────────────────────────────────────────

/**
 * Falls back to the native llama.rn context.completion() API.
 * Used when the AI SDK provider path is not yet active or when
 * provider-specific features (enable_thinking, reasoning_format)
 * are needed that the AI SDK does not yet forward.
 */
export async function nativeCompletion(
  nativeContext: any,
  messages: ChatMessage[],
  modelName: string,
  settings: ModelSettings,
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  options?: NativeCompletionOptions,
): Promise<CompletionResult> {
  const lastContent = messages[messages.length - 1]?.content || '';
  const lastUserContent =
    [...messages].reverse().find((m) => m.role === 'user')?.content || '';
  const userText =
    options?.heuristicUserText?.trim() ||
    lastUserContent ||
    lastContent;
  const completion = buildCompletionParams({
    userText,
    modelName,
    settings,
    heuristicMode: options?.heuristicMode,
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
    simple,
    supportsThinkTags,
  } = completion;

  const startTime = Date.now();
  let fullText = '';
  let currentThought = '';
  let inThinkBlock = false;
  let tokenCount = 0;

  // Sliding-window trim (same helper as streamChat) — live product path.
  const trimResult = applyConversationTrim(
    messages,
    settings.n_ctx,
    settings.n_predict,
  );
  const trimmedMessageCount = trimResult.droppedCount;

  const llamaMessages = trimResult.messages.map((m) => ({
    role: m.role,
    content:
      m.role === 'system'
        ? adaptSystemPromptForThinking(m.content, !!enableThinking)
        : m.content,
  }));

  interface TokenData {
    token?: string;
    content?: string;
    reasoning_content?: string;
  }

  if (__DEV__) {
    console.log('[nativeCompletion] start', {
      modelName,
      n_predict: nPredict,
      temperature,
      top_p: topP,
      top_k: topK,
      penalty_repeat: penaltyRepeat,
      penalty_present: penaltyPresent,
      enableThinking,
      simple,
      reasoningFormat,
      messageCount: llamaMessages.length,
      trimmedMessageCount,
      lastUserChars: userText.length,
    });
  }

  await logError(
    'Inference',
    'nativeCompletion start',
    undefined,
    {
      modelName,
      n_predict: nPredict,
      temperature,
      top_p: topP,
      top_k: topK,
      penalty_repeat: penaltyRepeat,
      penalty_present: penaltyPresent,
      enableThinking,
      simple,
      reasoningFormat,
      messageCount: llamaMessages.length,
      trimmedMessageCount,
      roles: llamaMessages.map((m) => m.role),
      lastUserPreview: userText.slice(0, 120),
    },
    'INFO',
  );

  let result: any;
  try {
    // If native metadata marshalling failed, pass an explicit text Jinja template
    // so getFormattedChat does not depend on model.metadata.
    const needsExplicitTemplate = !nativeContext?.model?.metadata?.['tokenizer.chat_template'];

    // Ensure AbortSignal also stops the native session (thinking can ignore JS-only abort).
    const onAbort = () => {
      if (typeof nativeContext?.stopCompletion === 'function') {
        Promise.resolve(nativeContext.stopCompletion()).catch(() => {});
      }
    };
    if (signal) {
      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }
    }

    result = await nativeContext.completion(
      {
        messages: llamaMessages,
        n_predict: nPredict,
        temperature,
        top_p: topP,
        top_k: topK,
        // llama.rn 0.12+ native keys (OpenAI-style `repeat_penalty` is ignored).
        penalty_repeat: penaltyRepeat,
        penalty_present: penaltyPresent,
        stop,
        // Always pass an explicit boolean for Qwen so template v4 injects empty
        // <think></think> when false (skips CoT on "another fun fact").
        ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
        reasoning_format: reasoningFormat,
        ...(needsExplicitTemplate
          ? {
              chat_template: resolveModelPolicy(modelName).template.familyStub,
              jinja: true,
            }
          : {}),
      },
      (data: TokenData) => {
        if (signal?.aborted) return;

        if (data.reasoning_content && data.reasoning_content !== currentThought) {
          currentThought = data.reasoning_content;
          callbacks.onThought?.(currentThought);
          // Qwen3.5-0.8B can doom-loop in thinking — interrupt early (HF guidance).
          if (isThinkingMetaLoop(currentThought)) {
            Promise.resolve(nativeContext.stopCompletion?.()).catch(() => {});
          }
          return;
        }

        const token = data.token ?? data.content ?? '';
        if (!token) return;

        // Count only emission callbacks with actual token text (not reasoning updates).
        tokenCount++;

        fullText += token;

        if (supportsThinkTags) {
          if (token.includes('<think>')) {
            inThinkBlock = true;
            currentThought += token.replace(/<think>/gi, '');
            callbacks.onThought?.(currentThought);
            // Don't stream think tokens into the bubble — TextBlink "Thinking"
            // stays visible while content is empty.
            return;
          }
          if (inThinkBlock) {
            if (token.includes('</think>')) {
              inThinkBlock = false;
              currentThought += token.replace(/<\/think>/gi, '');
              currentThought = currentThought.trim();
              callbacks.onThought?.(currentThought);
            } else {
              currentThought += token;
              callbacks.onThought?.(currentThought);
              if (isThinkingMetaLoop(currentThought)) {
                Promise.resolve(nativeContext.stopCompletion?.()).catch(() => {});
              }
            }
            return;
          }
        }

        const visibleText = supportsThinkTags
          ? stripThinkBlocks(fullText)
          : fullText;
        if (visibleText) {
          callbacks.onToken?.(visibleText);
        }
      },
    );

    if (signal) {
      signal.removeEventListener('abort', onAbort);
    }
  } catch (err) {
    // User stop / abort should not surface as a hard failure.
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      const finalized = finalizeVisibleAndThought(
        fullText,
        currentThought,
        supportsThinkTags,
      );
      return {
        text: finalized.visibleContent,
        thought: finalized.thought || undefined,
        tokensPerSecond: 0,
        totalTokens: tokenCount,
        inferenceTimeMs: Date.now() - startTime,
        trimmedMessageCount,
      };
    }
    await logError(
      'Inference',
      `nativeCompletion threw: ${err instanceof Error ? err.message : String(err)}`,
      err instanceof Error ? err : undefined,
      { modelName, tokenCount, fullTextLen: fullText.length },
    );
    throw err;
  }

  // stopCompletion usually resolves (doesn't throw) — treat abort as partial result.
  if (signal?.aborted) {
    const finalized = finalizeVisibleAndThought(
      fullText,
      currentThought,
      supportsThinkTags,
    );
    return {
      text: finalized.visibleContent,
      thought: finalized.thought || undefined,
      tokensPerSecond: 0,
      totalTokens: tokenCount,
      inferenceTimeMs: Date.now() - startTime,
      trimmedMessageCount,
    };
  }

  const endTime = Date.now();
  const wallTimeMs = endTime - startTime;
  const timings = result?.timings ?? null;
  const usage = await recordCompletionUsage({
    model: modelName,
    wallTimeMs,
    streamTokenCount: tokenCount,
    timings,
  });
  const tpsRounded = usage?.tokensPerSecond ?? 0;
  const reportedTokenCount = usage?.tokenCount ?? tokenCount;
  const inferenceTimeMs = usage?.inferenceTime ?? wallTimeMs;

  const resultText =
    (typeof result?.text === 'string' && result.text) ||
    (typeof result?.content === 'string' && result.content) ||
    '';
  const combined = fullText.trim().length > 0 ? fullText : resultText;

  const finalized = finalizeVisibleAndThought(
    combined,
    currentThought,
    supportsThinkTags,
  );
  const visibleContent = finalized.visibleContent;
  currentThought = finalized.thought;

  await logError(
    'Inference',
    visibleContent.trim().length > 0
      ? 'nativeCompletion finished'
      : 'nativeCompletion finished with EMPTY visible text',
    undefined,
    {
      modelName,
      streamTokenCount: tokenCount,
      reportedTokenCount,
      streamedChars: fullText.length,
      resultTextChars: resultText.length,
      visibleChars: visibleContent.length,
      thoughtChars: currentThought.length,
      stillInThinkBlock: inThinkBlock,
      tps: tpsRounded,
      tpsSource: usage?.tpsSource ?? null,
      wallTimeMs,
      inferenceTimeMs,
      resultKeys:
        result && typeof result === 'object' ? Object.keys(result).slice(0, 20) : [],
      timings: timings ?? null,
      truncatedPreview: visibleContent.slice(0, 160) || currentThought.slice(0, 160),
    },
    visibleContent.trim().length > 0 ? 'INFO' : 'WARN',
  );

  if (__DEV__) {
    console.log('[nativeCompletion] done', {
      streamTokenCount: tokenCount,
      reportedTokenCount,
      streamedChars: fullText.length,
      resultTextChars: resultText.length,
      visibleChars: visibleContent.length,
      thoughtChars: currentThought.length,
      tps: tpsRounded,
      tpsSource: usage?.tpsSource,
      wallTimeMs,
      inferenceTimeMs,
    });
  }

  const completionResult: CompletionResult = {
    text: visibleContent,
    thought: currentThought || undefined,
    tokensPerSecond: tpsRounded,
    totalTokens: reportedTokenCount,
    inferenceTimeMs: wallTimeMs,
    trimmedMessageCount,
  };

  callbacks.onFinish?.(completionResult);
  return completionResult;
}
