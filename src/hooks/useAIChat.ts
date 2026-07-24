/**
 * useAIChat — on-device chat hook (useChat-compatible surface)
 *
 * Owns the live transcript. Parent screens may seed via chatId changes and
 * take idle snapshots for remount — they must not mirror every token update.
 */

import { useState, useCallback, useRef, useEffect, startTransition } from 'react';
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
  ModelStatus,
} from '../types/ai';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface UseAIChatOptions {
  initialMessages?: ChatMessage[];
  modelName: string;
  persona?: Persona | null;
  chatId?: string | null;
  onChatIdChange?: (chatId: string) => void;
  scrollViewRef?: React.RefObject<ScrollView>;
  /** Prefer llama.rn completion (thinking / stopCompletion parity). */
  useNativeCompletion?: boolean;
  onModelNotReady?: () => void;
  /** Skip chat-history writes (temporary mode). */
  disablePersistence?: boolean;
}

export interface UseAIChatReturn {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: (input: string) => void;
  handleInputChange: (text: string) => void;
  handleSubmit: (sendOptions?: SendOptions) => Promise<void>;
  stop: () => void;
  /**
   * Regenerate an assistant reply (ChatGPT / Claude / Gemini pattern):
   * keep context through the prompting user turn, drop that assistant reply
   * and anything after it, then auto-run a new completion. Does not touch
   * the composer.
   * @param assistantIndex Absolute index into `messages` (incl. system).
   *   Defaults to the last assistant message.
   */
  regenerate: (assistantIndex?: number) => Promise<void>;
  /** Alias for regenerating the latest assistant reply. */
  reload: () => Promise<void>;
  newChat: () => void;
  isLoading: boolean;
  isGenerating: boolean;
  error: Error | null;
  tokensPerSecond: number[];
  currentThought: string;
  modelStatus: ModelStatus;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SYSTEM_MESSAGE: ChatMessage = {
  role: 'system',
  content: 'This is a conversation between user and assistant, a friendly chatbot.',
};

const STOPPED_MARKER = '\n\n*Generation stopped by user*';
const EMPTY_REPLY_FALLBACK = '(No response from model. Try sending again.)';

type AssistantPatch = { content?: string; thought?: string };

function resolveVisibleText(text: string, thought?: string): string {
  const trimmed = text.trim();
  if (trimmed.length > 0) return text;
  if (thought) return '';
  return EMPTY_REPLY_FALLBACK;
}

function patchLastAssistant(
  messages: ChatMessage[],
  patch: AssistantPatch,
): ChatMessage[] | null {
  if (messages.length === 0) return null;
  const last = messages[messages.length - 1];
  if (last.role !== 'assistant') return null;

  const nextContent = patch.content !== undefined ? patch.content : last.content;
  const nextThought = patch.thought !== undefined ? patch.thought : last.thought;
  if (nextContent === last.content && nextThought === last.thought) {
    return null;
  }

  const updated = messages.slice();
  updated[updated.length - 1] = {
    ...last,
    content: nextContent,
    thought: nextThought,
  };
  return updated;
}

function finalizeLastAssistant(
  messages: ChatMessage[],
  result: { text: string; thought?: string; tokensPerSecond?: number },
): ChatMessage[] {
  const visible = resolveVisibleText(result.text, result.thought);
  return messages.map((m, i, arr) => {
    if (i !== arr.length - 1 || m.role !== 'assistant') return m;
    return {
      ...m,
      content: visible,
      thought: result.thought || m.thought,
      showThought: !!(result.thought && !visible.trim()),
      tokensPerSecond: result.tokensPerSecond,
    };
  });
}

// ── Hook ───────────────────────────────────────────────────────────────────────

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
    disablePersistence = false,
  } = options;

  const [messages, setMessagesState] = useState<ChatMessage[]>(
    initialMessages || [SYSTEM_MESSAGE],
  );
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [tokensPerSecond, setTokensPerSecond] = useState<number[]>(() =>
    tokensPerSecondFromMessages(initialMessages || [SYSTEM_MESSAGE]),
  );
  const [currentThought, setCurrentThought] = useState('');
  const [modelStatus, setModelStatus] = useState<ModelStatus>(
    llamaProvider.getStatus(),
  );

  const abortRef = useRef<(() => void) | null>(null);
  const chatIdRef = useRef<string | null>(externalChatId ?? null);
  const messagesRef = useRef<ChatMessage[]>(messages);
  const isGeneratingRef = useRef(false);
  /** Bumps on each submit/stop/newChat so late tokens from an old run are ignored. */
  const generationIdRef = useRef(0);
  const pendingPatchRef = useRef<AssistantPatch | null>(null);
  const flushRafRef = useRef<number | null>(null);

  // Stable latest callbacks / flags for async work (avoid stale closures).
  const onChatIdChangeRef = useRef(onChatIdChange);
  onChatIdChangeRef.current = onChatIdChange;
  const disablePersistenceRef = useRef(disablePersistence);
  disablePersistenceRef.current = disablePersistence;
  const onModelNotReadyRef = useRef(onModelNotReady);
  onModelNotReadyRef.current = onModelNotReady;
  const initialMessagesRef = useRef(initialMessages);
  initialMessagesRef.current = initialMessages;
  const lastSyncedChatIdRef = useRef<string | null | undefined>(undefined);

  /** Commit messages + keep messagesRef in lockstep (safe for external setMessages). */
  const commitMessages = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessagesState(next);
    setTokensPerSecond(tokensPerSecondFromMessages(next));
  }, []);

  const setMessages = useCallback(
    (action: React.SetStateAction<ChatMessage[]>) => {
      const prev = messagesRef.current;
      const next = typeof action === 'function' ? action(prev) : action;
      commitMessages(next);
    },
    [commitMessages],
  );

  useEffect(() => {
    chatIdRef.current = externalChatId ?? null;
  }, [externalChatId]);

  useEffect(() => llamaProvider.subscribe(setModelStatus), []);

  // Seed from parent only when chat identity changes (history load / new chat).
  useEffect(() => {
    const chatKey = externalChatId ?? null;
    if (lastSyncedChatIdRef.current === chatKey) return;
    lastSyncedChatIdRef.current = chatKey;

    // Drop in-flight generation if the user switched chats.
    if (isGeneratingRef.current) {
      generationIdRef.current += 1;
      abortRef.current?.();
      abortRef.current = null;
      pendingPatchRef.current = null;
      if (flushRafRef.current != null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      isGeneratingRef.current = false;
      setIsGenerating(false);
      setIsLoading(false);
    }

    const incoming = initialMessagesRef.current;
    commitMessages(
      incoming && incoming.length > 0 ? incoming : [SYSTEM_MESSAGE],
    );
    setCurrentThought('');
    setError(null);
  }, [externalChatId, commitMessages]);

  const scrollToEnd = useCallback(() => {
    if (!scrollViewRef?.current) return;
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: false });
    });
  }, [scrollViewRef]);

  const applyPendingPatch = useCallback(
    (generationId: number, opts?: { urgent?: boolean }) => {
      if (generationId !== generationIdRef.current) {
        pendingPatchRef.current = null;
        return;
      }
      const pending = pendingPatchRef.current;
      pendingPatchRef.current = null;
      if (!pending) return;

      const updated = patchLastAssistant(messagesRef.current, pending);
      if (!updated) return;
      messagesRef.current = updated;
      if (opts?.urgent) {
        setMessagesState(updated);
      } else {
        startTransition(() => setMessagesState(updated));
      }
    },
    [],
  );

  const flushAssistantPatch = useCallback(() => {
    if (flushRafRef.current != null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    applyPendingPatch(generationIdRef.current, { urgent: true });
  }, [applyPendingPatch]);

  const scheduleAssistantPatch = useCallback(
    (patch: AssistantPatch, generationId: number) => {
      if (generationId !== generationIdRef.current) return;

      pendingPatchRef.current = {
        ...(pendingPatchRef.current || {}),
        ...patch,
      };
      if (flushRafRef.current != null) return;

      flushRafRef.current = requestAnimationFrame(() => {
        flushRafRef.current = null;
        applyPendingPatch(generationId);
        if (generationId === generationIdRef.current) {
          scrollToEnd();
        }
      });
    },
    [applyPendingPatch, scrollToEnd],
  );

  useEffect(() => {
    return () => {
      generationIdRef.current += 1;
      if (flushRafRef.current != null) {
        cancelAnimationFrame(flushRafRef.current);
        flushRafRef.current = null;
      }
      abortRef.current?.();
      abortRef.current = null;
    };
  }, []);

  const handleInputChange = useCallback((text: string) => {
    setInput(text);
  }, []);

  const persistMessages = useCallback((toSave: ChatMessage[]) => {
    if (disablePersistenceRef.current) return;
    chatHistoryService
      .saveChat(toSave as any, chatIdRef.current)
      .then((savedId) => {
        if (!chatIdRef.current) {
          chatIdRef.current = savedId;
          onChatIdChangeRef.current?.(savedId);
        }
      })
      .catch((err) => {
        if (__DEV__) console.warn('[useAIChat] Save failed:', err);
      });
  }, []);

  /**
   * Shared completion runner. Assumes messagesRef already ends with an empty
   * assistant placeholder, and the preceding message is the prompting user turn.
   */
  const runCompletion = useCallback(
    async (
      generationId: number,
      opts?: { textForPrompt?: string; streamUserInput?: string; sendOptions?: SendOptions },
    ) => {
      const onToken = (visibleText: string) => {
        scheduleAssistantPatch({ content: visibleText }, generationId);
      };
      const onThought = (thought: string) => {
        if (generationId !== generationIdRef.current) return;
        setCurrentThought(thought);
        scheduleAssistantPatch({ thought }, generationId);
      };

      try {
        let completion: {
          text: string;
          thought?: string;
          tokensPerSecond: number;
        };

        if (preferNative) {
          const nativeContext = llamaProvider.getNativeContext();
          if (!nativeContext) {
            throw new Error(
              'Native context not available. Try switching the model off and on again.',
            );
          }

          const settings = await getModelSettings(modelName).catch(
            () => DEFAULT_SETTINGS,
          );
          if (generationId !== generationIdRef.current) return;

          const systemPrompt = buildPersonaSystemPrompt(
            persona,
            settings.systemPrompt,
          );
          const allMessages = messagesRef.current.slice(0, -1);
          const nativeMessages: ChatMessage[] = [];
          const sysIdx = allMessages.findIndex((m) => m.role === 'system');
          if (sysIdx >= 0) {
            const withSys = allMessages.slice();
            withSys[sysIdx] = { ...withSys[sysIdx], content: systemPrompt };
            nativeMessages.push(...withSys);
          } else {
            nativeMessages.push(
              { role: 'system', content: systemPrompt },
              ...allMessages,
            );
          }

          if (opts?.textForPrompt && nativeMessages.length > 0) {
            const lastIdx = nativeMessages.length - 1;
            if (nativeMessages[lastIdx].role === 'user') {
              nativeMessages[lastIdx] = {
                ...nativeMessages[lastIdx],
                content: opts.textForPrompt,
              };
            }
          }

          completion = await nativeCompletion(
            nativeContext,
            nativeMessages,
            modelName,
            settings,
            { onToken, onThought },
          );
        } else {
          const prior = messagesRef.current.slice(0, -2);
          const lastUser = messagesRef.current[messagesRef.current.length - 2];
          const userInput =
            opts?.streamUserInput ??
            (lastUser?.role === 'user' ? lastUser.content : '');
          const { result, abort } = streamChat(
            {
              messages: prior,
              userInput,
              modelName,
              persona,
              sendOptions: opts?.sendOptions,
            },
            {
              onToken,
              onThought,
              onError: (err) => {
                if (generationId === generationIdRef.current) setError(err);
              },
            },
          );
          abortRef.current = abort;
          completion = await result;
        }

        if (generationId !== generationIdRef.current) return;

        flushAssistantPatch();
        const finalized = finalizeLastAssistant(messagesRef.current, completion);
        commitMessages(finalized);
        persistMessages(finalized);
      } catch (err) {
        if (generationId !== generationIdRef.current) return;
        const error = err instanceof Error ? err : new Error(String(err));
        if (error.name === 'AbortError') return;

        setError(error);
        const prev = messagesRef.current;
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) {
          commitMessages([
            ...prev.slice(0, -1),
            {
              ...last,
              content: `Error: ${error.message}. Please try again.`,
            },
          ]);
        }
      } finally {
        if (generationId === generationIdRef.current) {
          flushAssistantPatch();
          isGeneratingRef.current = false;
          setIsLoading(false);
          setIsGenerating(false);
          abortRef.current = null;
        }
      }
    },
    [
      modelName,
      persona,
      preferNative,
      commitMessages,
      scheduleAssistantPatch,
      flushAssistantPatch,
      persistMessages,
    ],
  );

  const beginGeneration = useCallback(() => {
    const generationId = ++generationIdRef.current;
    pendingPatchRef.current = null;
    if (flushRafRef.current != null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    setError(null);
    isGeneratingRef.current = true;
    setIsLoading(true);
    setIsGenerating(true);
    setCurrentThought('');
    return generationId;
  }, []);

  const handleSubmit = useCallback(
    async (sendOptions?: SendOptions) => {
      if (isGeneratingRef.current) return;

      const hasAttachments = !!(
        sendOptions?.attachments && sendOptions.attachments.length > 0
      );
      const typed = (
        typeof sendOptions?.text === 'string' ? sendOptions.text : input
      ).trim();
      if (!hasAttachments && !typed) return;

      const noModelSelected = !modelName || modelName === 'unknown';
      if (!llamaProvider.isReady() || noModelSelected) {
        onModelNotReadyRef.current?.();
        setError(new Error('Model not loaded'));
        return;
      }

      const generationId = beginGeneration();

      const displayContent = typed || (hasAttachments ? '(Image attached)' : '');
      const userMessage: ChatMessage = {
        role: 'user',
        content: displayContent,
        attachments: sendOptions?.attachments,
        createdAt: new Date(),
      };
      const assistantPlaceholder: ChatMessage = {
        role: 'assistant',
        content: '',
        thought: undefined,
        showThought: false,
        createdAt: new Date(),
      };

      commitMessages([
        ...messagesRef.current,
        userMessage,
        assistantPlaceholder,
      ]);
      setInput('');
      scrollToEnd();

      await runCompletion(generationId, {
        textForPrompt: sendOptions?.textForPrompt,
        streamUserInput: displayContent,
        sendOptions,
      });
    },
    [
      input,
      modelName,
      beginGeneration,
      commitMessages,
      scrollToEnd,
      runCompletion,
    ],
  );

  /**
   * Regenerate an assistant reply without staging text in the composer.
   * Matches ChatGPT / Claude / Gemini / Cloudscape: replay the same user turn
   * against prior context; drop the old assistant reply and any later turns.
   */
  const regenerate = useCallback(
    async (assistantIndex?: number) => {
      if (isGeneratingRef.current) return;

      const noModelSelected = !modelName || modelName === 'unknown';
      if (!llamaProvider.isReady() || noModelSelected) {
        onModelNotReadyRef.current?.();
        setError(new Error('Model not loaded'));
        return;
      }

      const prev = messagesRef.current;
      let aIdx =
        typeof assistantIndex === 'number' ? assistantIndex : prev.length - 1;

      if (aIdx < 0 || aIdx >= prev.length || prev[aIdx].role !== 'assistant') {
        aIdx = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].role === 'assistant') {
            aIdx = i;
            break;
          }
        }
      }
      if (aIdx < 0) return;

      let uIdx = -1;
      for (let i = aIdx - 1; i >= 0; i--) {
        if (prev[i].role === 'user') {
          uIdx = i;
          break;
        }
      }
      if (uIdx < 0) return;

      const userTurn = prev[uIdx];
      // Keep system + history through the prompting user message; drop the
      // assistant reply and any forked-off later turns (Cloudscape context rule).
      const kept = prev.slice(0, uIdx + 1);
      const assistantPlaceholder: ChatMessage = {
        role: 'assistant',
        content: '',
        thought: undefined,
        showThought: false,
        createdAt: new Date(),
      };

      const generationId = beginGeneration();
      commitMessages([...kept, assistantPlaceholder]);
      scrollToEnd();

      await runCompletion(generationId, {
        streamUserInput: userTurn.content,
        sendOptions: userTurn.attachments?.length
          ? { attachments: userTurn.attachments, text: userTurn.content }
          : { text: userTurn.content },
      });
    },
    [modelName, beginGeneration, commitMessages, scrollToEnd, runCompletion],
  );

  const reload = useCallback(async () => {
    await regenerate();
  }, [regenerate]);

  const stop = useCallback(() => {
    generationIdRef.current += 1;
    abortRef.current?.();
    abortRef.current = null;

    const ctx = llamaProvider.getNativeContext();
    if (ctx && typeof ctx.stopCompletion === 'function') {
      ctx.stopCompletion().catch(() => {});
    }

    flushAssistantPatch();
    isGeneratingRef.current = false;
    setIsGenerating(false);
    setIsLoading(false);

    const prev = messagesRef.current;
    if (prev.length === 0) {
      return;
    }
    const last = prev[prev.length - 1];
    if (last.role !== 'assistant' || last.content.includes(STOPPED_MARKER)) {
      return;
    }
    const stopped = [
      ...prev.slice(0, -1),
      { ...last, content: last.content + STOPPED_MARKER },
    ];
    commitMessages(stopped);
    persistMessages(stopped);
  }, [flushAssistantPatch, commitMessages, persistMessages]);

  const newChat = useCallback(() => {
    generationIdRef.current += 1;
    abortRef.current?.();
    abortRef.current = null;
    pendingPatchRef.current = null;
    if (flushRafRef.current != null) {
      cancelAnimationFrame(flushRafRef.current);
      flushRafRef.current = null;
    }
    isGeneratingRef.current = false;
    setIsGenerating(false);
    setIsLoading(false);

    commitMessages([SYSTEM_MESSAGE]);
    setInput('');
    setCurrentThought('');
    setError(null);
    chatIdRef.current = null;
    lastSyncedChatIdRef.current = undefined;
  }, [commitMessages]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    handleInputChange,
    handleSubmit,
    stop,
    regenerate,
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
