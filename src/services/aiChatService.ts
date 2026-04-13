/**
 * AI Chat Service — Vercel AI SDK streamText orchestration
 *
 * Replaces the manual `context.completion()` call in the legacy
 * `handleSendMessageCompletion` (llamaService.ts) with the Vercel AI
 * SDK's `streamText()`, while preserving:
 *
 *   - Thinking/reasoning block handling (Qwen3, DeepSeek R1)
 *   - Sliding-window context trimming
 *   - Performance metrics (tok/s, inference time)
 *   - Per-model settings (temperature, top_p, etc.)
 *   - Persona system prompt injection
 *   - Multimodal image embedding for vision models
 *
 * The service operates on the singleton `llamaProvider` and exposes a
 * simple `streamChat()` function consumable by the `useAIChat` hook.
 */

import { streamText } from 'ai';
import type { LanguageModelV1 } from 'ai';

import { llamaProvider } from '../providers/llamaProvider';
import { getModelSettings, ModelSettings, DEFAULT_SETTINGS } from './modelSettingsService';
import { Persona, buildPersonaSystemPrompt } from './personaService';
import { formatMessagesForVision, isVisionModel, isQwen35Model } from './visionService';
import {
  parseDocument,
  extractTextFromAttachment,
  prepareAttachmentForVision,
} from './documentParsingService';
import { recordUsage, getPerformanceLevel } from './usageTracker';
import { logError } from '../utils/errorLogger';

import type {
  ChatMessage,
  AIMessage,
  SendOptions,
  StreamCallbacks,
  CompletionResult,
} from '../types/ai';

// ── Helpers ────────────────────────────────────────────────────────────────────

function isComplexQuery(text: string): boolean {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 20) return true;
  if (
    /\b(explain|analyze|analyse|compare|solve|calculate|prove|derive|implement|debug|optimize|refactor|design|summarize|summarise|translate|evaluate|critique)\b/i.test(
      text,
    )
  )
    return true;
  if (/[+\-*/^=<>√∫∑∏≈≤≥≠]|\\[a-z]+\{/.test(text)) return true;
  if (/```|`[^`]+`/.test(text)) return true;
  if ((text.match(/\?/g) || []).length > 1) return true;
  return false;
}

const STOP_WORDS = [
  '</s>',
  '<|end|>',
  'user:',
  'assistant:',
  '<|im_end|>',
  '<|eot_id|>',
  '<|end▁of▁sentence|>',
  '<|end_of_text|>',
  '<｜end▁of▁sentence｜>',
  '<end_of_turn>',
  '<eos>',
  '</eos>',
];

// ── Sliding-window Context Trim ────────────────────────────────────────────────

function trimConversation(
  messages: AIMessage[],
  n_ctx: number,
  n_predict: number,
): AIMessage[] {
  if (messages.length <= 2) return messages;

  const CHARS_PER_TOKEN = 3.5;
  let budgetChars = Math.max(0, n_ctx - n_predict - 128) * CHARS_PER_TOKEN;

  const systemMsg = messages[0];
  const currentUserMsg = messages[messages.length - 1];
  const history = messages.slice(1, -1);

  const systemLen =
    typeof systemMsg.content === 'string'
      ? systemMsg.content.length
      : JSON.stringify(systemMsg.content).length;
  const currentLen =
    typeof currentUserMsg.content === 'string'
      ? currentUserMsg.content.length
      : JSON.stringify(currentUserMsg.content).length;

  budgetChars -= systemLen;
  budgetChars -= currentLen;

  if (budgetChars <= 0 || history.length === 0) {
    return [systemMsg, currentUserMsg];
  }

  const kept: AIMessage[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgLen =
      typeof history[i].content === 'string'
        ? (history[i].content as string).length + 20
        : JSON.stringify(history[i].content).length + 20;
    if (budgetChars - msgLen < 0) break;
    budgetChars -= msgLen;
    kept.unshift(history[i]);
  }

  return [systemMsg, ...kept, currentUserMsg];
}

// ── Think Block Parsing ────────────────────────────────────────────────────────

function stripThinkBlocks(text: string): string {
  return text
    .replace(/<think>.*?<\/redacted_reasoning>/gs, '')
    .replace(/<think>.*?<\/think>/gs, '')
    .replace(/<think>[\s\S]*$/, '')
    .replace(/<end_of_turn>/g, '')
    .replace(/<\/?eos>/g, '')
    .trim();
}

// ── Main Chat Stream ───────────────────────────────────────────────────────────

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
          pdfAttachments.map((a) => extractTextFromAttachment(a)),
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
        (sendOptions!.attachments || []).map((a) => extractTextFromAttachment(a)),
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
  aiMessages = trimConversation(aiMessages, settings.n_ctx, settings.n_predict);

  // ── Thinking / reasoning config ─────────────────────────────────────────
  const inputText = sendOptions?.textForPrompt || userInput;
  const isQwen3 = isQwen35Model(modelName) || /qwen3/i.test(modelName) || modelName.toLowerCase().includes('qwq');
  const isDeepSeekR1 =
    modelName.toLowerCase().includes('deepseek-r1') ||
    modelName.toLowerCase().includes('r1d');
  const complex = isComplexQuery(inputText);
  const enableThinking = isQwen3 ? complex : undefined;

  // ── Stream via Vercel AI SDK ────────────────────────────────────────────
  const startTime = Date.now();
  let fullText = '';
  let currentThought = '';
  let tokenCount = 0;

  try {
    const { textStream } = streamText({
      model,
      messages: aiMessages as any, // AI SDK message type
      maxTokens: settings.n_predict,
      temperature: settings.temperature,
      topP: settings.top_p,
      stopSequences: STOP_WORDS,
      abortSignal: signal,
    });

    const supportsThinkTags = isQwen3 || isDeepSeekR1;
    let inThinkBlock = false;

    for await (const delta of textStream) {
      if (signal.aborted) break;

      tokenCount++;

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
      const visibleText = supportsThinkTags ? stripThinkBlocks(fullText) : fullText;
      callbacks.onToken?.(visibleText);
    }

    // Finalise
    const endTime = Date.now();
    const inferenceTimeMs = endTime - startTime;
    const tps = tokenCount > 0 ? (tokenCount / inferenceTimeMs) * 1000 : 0;
    const visibleContent = supportsThinkTags ? stripThinkBlocks(fullText) : fullText.trim();

    const completionResult: CompletionResult = {
      text: visibleContent,
      thought: currentThought || undefined,
      tokensPerSecond: parseFloat(tps.toFixed(2)),
      totalTokens: tokenCount,
      inferenceTimeMs,
    };

    // Record usage metrics
    recordUsage({
      timestamp: Date.now(),
      inferenceTime: inferenceTimeMs,
      tokenCount,
      tokensPerSecond: tps,
      performanceLevel: getPerformanceLevel(tps),
      model: modelName,
    });

    callbacks.onFinish?.(completionResult);
    return completionResult;
  } catch (error) {
    if (signal.aborted) {
      const stoppedResult: CompletionResult = {
        text: fullText.trim() + '\n\n*Generation stopped by user*',
        thought: currentThought || undefined,
        tokensPerSecond: 0,
        totalTokens: tokenCount,
        inferenceTimeMs: Date.now() - startTime,
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
): Promise<CompletionResult> {
  const isQwen3 = isQwen35Model(modelName) || /qwen3/i.test(modelName) || modelName.toLowerCase().includes('qwq');
  const isDeepSeekR1 =
    modelName.toLowerCase().includes('deepseek-r1') ||
    modelName.toLowerCase().includes('r1d');
  const supportsThinkTags = isQwen3 || isDeepSeekR1;

  const userText = messages[messages.length - 1]?.content || '';
  const complex = isComplexQuery(userText);
  const enableThinking = isQwen3 ? complex : undefined;
  const reasoningFormat: 'auto' | 'none' =
    (isQwen3 && complex) || isDeepSeekR1 ? 'auto' : 'none';

  const startTime = Date.now();
  let fullText = '';
  let currentThought = '';
  let inThinkBlock = false;
  let tokenCount = 0;

  // Map ChatMessage[] to the shape llama.rn expects
  const llamaMessages = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  interface TokenData {
    token: string;
    reasoning_content?: string;
  }

  const result = await nativeContext.completion(
    {
      messages: llamaMessages,
      n_predict: settings.n_predict,
      temperature: settings.temperature,
      top_p: settings.top_p,
      top_k: settings.top_k,
      repeat_penalty: settings.repeat_penalty,
      stop: STOP_WORDS,
      ...(enableThinking !== undefined && { enable_thinking: enableThinking }),
      reasoning_format: reasoningFormat,
    },
    (data: TokenData) => {
      if (signal?.aborted) return;

      tokenCount++;

      // Native reasoning tokens (llama.rn reasoning_format: 'auto')
      if (data.reasoning_content && data.reasoning_content !== currentThought) {
        currentThought = data.reasoning_content;
        callbacks.onThought?.(currentThought);
        return;
      }

      const token = data.token;
      if (!token) return;

      fullText += token;

      if (supportsThinkTags) {
        if (token.includes('<think>')) {
          inThinkBlock = true;
          currentThought += token.replace('<think>', '');
          callbacks.onThought?.(currentThought);
          return;
        }
        if (inThinkBlock) {
          if (token.includes('</think>')) {
            inThinkBlock = false;
            currentThought += token.replace('</think>', '');
            currentThought = currentThought.trim();
            callbacks.onThought?.(currentThought);
          } else {
            currentThought += token;
            callbacks.onThought?.(currentThought);
          }
          return;
        }
      }

      const visibleText = supportsThinkTags ? stripThinkBlocks(fullText) : fullText;
      callbacks.onToken?.(visibleText);
    },
  );

  const endTime = Date.now();
  const inferenceTimeMs = endTime - startTime;
  const tps = result.timings?.predicted_per_second ?? 0;
  const visibleContent = supportsThinkTags ? stripThinkBlocks(fullText) : fullText.trim();

  const completionResult: CompletionResult = {
    text: visibleContent,
    thought: currentThought || undefined,
    tokensPerSecond: parseFloat(tps.toFixed(2)),
    totalTokens: tokenCount,
    inferenceTimeMs,
  };

  callbacks.onFinish?.(completionResult);
  return completionResult;
}
