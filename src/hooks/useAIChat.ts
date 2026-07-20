/**
 * useAIChat — useChat-compatible hook for on-device inference
 *
 * Provides the same DX as Vercel AI SDK's `useChat` but works entirely
 * on-device using the local llama provider + streamText/nativeCompletion.
 *
 * API surface mirrors useChat:
 *   - messages / setMessages
 *   - input / handleInputChange
 *   - handleSubmit / stop
 *   - isLoading
 *   - error
 *
 * Additional fields for app-specific features:
 *   - tokensPerSecond
 *   - currentThought (live reasoning/thinking content)
 *   - isGenerating
 *   - modelStatus
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ScrollView } from 'react-native';

import { llamaProvider } from '../providers/llamaProvider';
import { streamChat, nativeCompletion } from '../services/aiChatService';
import { getModelSettings, DEFAULT_SETTINGS } from '../services/modelSettingsService';
import { buildPersonaSystemPrompt, Persona } from '../services/personaService';
import { chatHistoryService } from '../services/chatHistoryService';
import { tokensPerSecondFromMessages } from '../services/performanceTracking';

import type {
  ChatMessage,
  SendOptions,
  CompletionResult,
  ModelStatus,
} from '../types/ai';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseAIChatOptions {
  /** Initial messages to populate the chat (e.g. from history) */
  initialMessages?: ChatMessage[];
  /** Currently selected model file name */
  modelName: string;
  /** Active persona (optional) */
  persona?: Persona | null;
  /** Chat ID for history persistence */
  chatId?: string | null;
  /** Callback when chat ID changes (new chat created) */
  onChatIdChange?: (chatId: string) => void;
  /** Ref to ScrollView for auto-scrolling */
  scrollViewRef?: React.RefObject<ScrollView>;
  /**
   * When true, uses the native llama.rn context.completion() path
   * instead of the AI SDK streamText() path. Useful as a fallback
   * or when enable_thinking / reasoning_format are needed.
   */
  useNativeCompletion?: boolean;
  /** Called when send is blocked because no model is loaded. */
  onModelNotReady?: () => void;
}

export interface UseAIChatReturn {
  // Core chat state
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: (input: string) => void;

  // Actions
  handleInputChange: (text: string) => void;
  handleSubmit: (sendOptions?: SendOptions) => Promise<void>;
  stop: () => void;
  reload: () => Promise<void>;
  newChat: () => void;

  // Status
  isLoading: boolean;
  isGenerating: boolean;
  error: Error | null;

  // Metrics
  tokensPerSecond: number[];
  currentThought: string;

  // Provider status
  modelStatus: ModelStatus;
}

// ── Initial State ──────────────────────────────────────────────────────────────

const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'This is a conversation between user and assistant, a friendly chatbot.',
};

// ── Hook Implementation ────────────────────────────────────────────────────────

export function useAIChat(options: UseAIChatOptions): UseAIChatReturn {
  const {
    initialMessages,
    modelName,
    persona = null,
    chatId: externalChatId,
    onChatIdChange,
    scrollViewRef,
    useNativeCompletion: preferNative = false,
    onModelNotReady,
  } = options;

  // State
  const [messages, setMessages] = useState<ChatMessage[]>(
    initialMessages || [SYSTEM_MESSAGE],
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>([]);
  const [currentThought, setCurrentThought] = useState('');
  const [modelStatus, setModelStatus] = useState<ModelStatus>(
    llamaProvider.getStatus(),
  );

  // Refs
  const abortRef = useRef<(() => void) | null>(null);
  const chatIdRef = useRef<string | null>(externalChatId ?? null);
  const messagesRef = useRef<ChatMessage[]>(messages);

  // Keep a live ref to avoid stale closures during streaming.
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Sync external chatId
  useEffect(() => {
    chatIdRef.current = externalChatId ?? null;
  }, [externalChatId]);

  // Subscribe to provider status changes
  useEffect(() => {
    return llamaProvider.subscribe(setModelStatus);
  }, []);

  // Sync messages from parent only when the chat identity changes (history load /
  // new chat). Syncing on every `initialMessages` reference change races with
  // ConversationScreen writing `aiChat.messages` back into `conversation` and
  // triggers "Maximum update depth exceeded".
  const lastSyncedChatIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const chatKey = externalChatId ?? null;
    if (lastSyncedChatIdRef.current === chatKey) {
      return;
    }
    lastSyncedChatIdRef.current = chatKey;
    if (initialMessages && initialMessages.length > 0) {
      setMessages(initialMessages);
      setTokensPerSecond(tokensPerSecondFromMessages(initialMessages));
    }
  }, [externalChatId, initialMessages]);

  // ── Auto-scroll helper ──────────────────────────────────────────────────

  const scrollToEnd = useCallback(() => {
    if (scrollViewRef?.current) {
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: false });
      });
    }
  }, [scrollViewRef]);

  // Throttle streaming UI updates to reduce re-renders on mobile.
  const pendingAssistantPatchRef = useRef<{ content?: string; thought?: string } | null>(null);
  const flushRafRef = useRef<number | null>(null);

  const scheduleAssistantPatch = useCallback(
    (patch: { content?: string; thought?: string }) => {
      pendingAssistantPatchRef.current = {
        ...(pendingAssistantPatchRef.current || {}),
        ...patch,
      };

      if (flushRafRef.current != null) return;

      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;
        const pending = pendingAssistantPatchRef.current;
        pendingAssistantPatchRef.current = null;
        if (!pending) return;

        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            ...(pending.content !== undefined ? { content: pending.content } : null),
            ...(pending.thought !== undefined ? { thought: pending.thought } : null),
          };
          return updated;
        });

        scrollToEnd();
      });
    },
    [scrollToEnd],
  );

  // ── Input handling ──────────────────────────────────────────────────────

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
  }, []);

  // ── Submit message ──────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (sendOptions?: SendOptions) => {
      const hasAttachments = !!(sendOptions?.attachments && sendOptions.attachments.length > 0);
      // Prefer explicit text — ConversationScreen owns userInput and setInput is async.
      const typed =
        (typeof sendOptions?.text === 'string' ? sendOptions.text : input).trim();
      if (!hasAttachments && !typed) return;

      const noModelSelected = !modelName || modelName === 'unknown';
      if (!llamaProvider.isReady() || noModelSelected) {
        onModelNotReady?.();
        setError(new Error('Model not loaded'));
        if (__DEV__) {
          console.warn('[useAIChat] handleSubmit blocked: model not ready', {
            status: llamaProvider.getStatus(),
            modelName,
          });
        }
        return;
      }

      setError(null);
      setIsLoading(true);
      setIsGenerating(true);
      setCurrentThought('');

      const displayContent = typed || (hasAttachments ? '(Image attached)' : '');

      // Add user message to conversation
      const userMessage: ChatMessage = {
        role: 'user',
        content: displayContent,
        attachments: sendOptions?.attachments,
        createdAt: new Date(),
      };

      // Add assistant placeholder
      const assistantPlaceholder: ChatMessage = {
        role: 'assistant',
        content: '',
        thought: undefined,
        showThought: false,
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setInput('');
      scrollToEnd();

      try {
        if (preferNative) {
          // Native llama.rn completion path
          const nativeContext = llamaProvider.getNativeContext();
          if (!nativeContext) {
            throw new Error(
              'Native context not available. Try switching the model off and on again.',
            );
          }

          const settings = await getModelSettings(modelName).catch(() => DEFAULT_SETTINGS);
          const systemPrompt = buildPersonaSystemPrompt(persona, settings.systemPrompt);

          // Build messages for native completion from current conversation
          // (all messages before the assistant placeholder we just added)
          const allMessages = [...messagesRef.current, userMessage];
          const nativeMessages: ChatMessage[] = [];
          const sysIdx = allMessages.findIndex((m) => m.role === 'system');
          if (sysIdx >= 0) {
            allMessages[sysIdx] = { ...allMessages[sysIdx], content: systemPrompt };
            nativeMessages.push(...allMessages);
          } else {
            nativeMessages.push({ role: 'system', content: systemPrompt }, ...allMessages);
          }

          // Apply textForPrompt if set
          if (sendOptions?.textForPrompt && nativeMessages.length > 0) {
            const lastIdx = nativeMessages.length - 1;
            if (nativeMessages[lastIdx].role === 'user') {
              nativeMessages[lastIdx] = {
                ...nativeMessages[lastIdx],
                content: sendOptions.textForPrompt,
              };
            }
          }

          const result = await nativeCompletion(
            nativeContext,
            nativeMessages,
            modelName,
            settings,
            {
              onToken: (visibleText) => {
                scheduleAssistantPatch({ content: visibleText });
              },
              onThought: (thought) => {
                setCurrentThought(thought);
                scheduleAssistantPatch({ thought });
              },
              onFinish: (res) => {
                setTokensPerSecond((prev) => [...prev, res.tokensPerSecond]);
              },
            },
          );

          // Finalise assistant message
          const finalText =
            result.text.trim().length > 0
              ? result.text
              : result.thought
                ? ""
                : "(No response from model. Try sending again.)";
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = {
              ...last,
              content: finalText,
              thought: result.thought || last.thought,
              // Auto-expand thinking when the bubble would otherwise be empty.
              showThought: !!(result.thought && !finalText.trim()),
              tokensPerSecond: result.tokensPerSecond,
            };
            return updated;
          });
        } else {
          // AI SDK streamText path
          const { result, abort } = streamChat(
            {
              messages: messagesRef.current,
              userInput: displayContent,
              modelName,
              persona,
              sendOptions,
            },
            {
              onToken: (visibleText) => {
                scheduleAssistantPatch({ content: visibleText });
              },
              onThought: (thought) => {
                setCurrentThought(thought);
                scheduleAssistantPatch({ thought });
              },
              onFinish: (res) => {
                setTokensPerSecond((prev) => [...prev, res.tokensPerSecond]);
              },
              onError: (err) => {
                setError(err);
              },
            },
          );

          abortRef.current = abort;
          const completionResult = await result;

          // Finalise assistant message
          const streamText =
            completionResult.text.trim().length > 0
              ? completionResult.text
              : completionResult.thought
                ? ""
                : "(No response from model. Try sending again.)";
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            updated[updated.length - 1] = {
              ...last,
              content: streamText,
              thought: completionResult.thought || last.thought,
              showThought: !!(completionResult.thought && !streamText.trim()),
              tokensPerSecond: completionResult.tokensPerSecond,
            };
            return updated;
          });
        }

        // Persist to chat history
        setMessages((prev) => {
          chatHistoryService
            .saveChat(prev as any, chatIdRef.current)
            .then((savedId) => {
              if (!chatIdRef.current) {
                chatIdRef.current = savedId;
                onChatIdChange?.(savedId);
              }
            })
            .catch((err) => {
              if (__DEV__) console.warn('[useAIChat] Save failed:', err);
            });
          return prev;
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.name !== 'AbortError') {
          setError(error);
          // Update assistant message with error
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.role === 'assistant' && !last.content) {
              updated[updated.length - 1] = {
                ...last,
                content: `Error: ${error.message}. Please try again.`,
              };
            }
            return updated;
          });
        }
      } finally {
        setIsLoading(false);
        setIsGenerating(false);
        abortRef.current = null;
      }
    },
    [input, messages, modelName, persona, scrollToEnd, onChatIdChange, preferNative, onModelNotReady],
  );

  // ── Stop generation ─────────────────────────────────────────────────────

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }

    // Also try native stopCompletion
    const ctx = llamaProvider.getNativeContext();
    if (ctx && typeof ctx.stopCompletion === 'function') {
      ctx.stopCompletion().catch(() => {});
    }

    setIsGenerating(false);
    setIsLoading(false);

    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.role === 'assistant') {
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + '\n\n*Generation stopped by user*' },
        ];
      }
      return prev;
    });
  }, []);

  // ── Reload last message ─────────────────────────────────────────────────

  const reload = useCallback(async () => {
    setMessages((prev) => {
      if (prev.length < 2) return prev;
      // Remove last assistant message
      const last = prev[prev.length - 1];
      if (last.role === 'assistant') {
        return prev.slice(0, -1);
      }
      return prev;
    });
    // Re-submit will be triggered by the caller
  }, []);

  // ── New chat ────────────────────────────────────────────────────────────

  const newChat = useCallback(() => {
    setMessages([SYSTEM_MESSAGE]);
    setInput('');
    setTokensPerSecond([]);
    setCurrentThought('');
    setError(null);
    chatIdRef.current = null;
  }, []);

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    stop,
    reload,
    newChat,
    isLoading,
    isGenerating,
    error,
    tokensPerSecond,
    currentThought,
    modelStatus,
  };
}
