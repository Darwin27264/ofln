/**
 * Sliding-window conversation trim so the system prompt is not silently
 * dropped when n_ctx fills up.
 */

export type TrimableMessage = {
  role: string;
  content: string | unknown;
};

/**
 * Conservative vs chat banner (~3.5): URL-heavy source text tokenizes denser,
 * and chat templates eat extra tokens. Under-estimating chars/token caused
 * "fits in trim, context_full at native" Unknown errors on emulator n_ctx=1024.
 */
const CHARS_PER_TOKEN = 3.0;
/** Reserve tokens for chat-template overhead beyond n_predict. */
const TEMPLATE_OVERHEAD_TOKENS = 192;
const TRUNCATION_MARKER = '\n\n[…truncated for context…]';

function contentLength(content: string | unknown): number {
  if (typeof content === 'string') return content.length;
  return JSON.stringify(content).length;
}

function contextCharBudget(n_ctx: number, n_predict: number): number {
  return Math.max(0, n_ctx - n_predict - TEMPLATE_OVERHEAD_TOKENS) * CHARS_PER_TOKEN;
}

function truncateStringToChars(content: string, maxChars: number): string {
  if (maxChars <= 0) return '';
  if (content.length <= maxChars) return content;
  if (maxChars <= TRUNCATION_MARKER.length) {
    return content.slice(0, maxChars);
  }
  return content.slice(0, maxChars - TRUNCATION_MARKER.length) + TRUNCATION_MARKER;
}

/**
 * When system + current turn alone exceed the context budget (common for
 * Source Monitor tasks: exactly 2 messages with a large fetched body),
 * shrink the last string user message so native completion does not OOM /
 * throw opaque "Unknown error".
 */
export function fitMessagesToCharBudget<T extends TrimableMessage>(
  messages: T[],
  budgetChars: number,
): T[] {
  if (messages.length === 0) return messages;
  // n_predict ≥ n_ctx yields a 0 budget — do not wipe the turn; caller already
  // kept system + anchor. Real loads use n_ctx ≥ 512 so this is test/edge only.
  if (budgetChars <= 0) return messages;

  const total =
    messages.reduce((sum, m) => sum + contentLength(m.content) + 20, 0) - 20;
  if (total <= budgetChars) return messages;

  let truncIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user' && typeof messages[i].content === 'string') {
      truncIdx = i;
      break;
    }
  }
  if (truncIdx < 0) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (typeof messages[i].content === 'string') {
        truncIdx = i;
        break;
      }
    }
  }
  if (truncIdx < 0) return messages;

  const other = total - contentLength(messages[truncIdx].content);
  const maxForTarget = Math.max(0, Math.floor(budgetChars - other));
  const content = messages[truncIdx].content as string;
  if (content.length <= maxForTarget) return messages;

  const next = messages.slice();
  next[truncIdx] = {
    ...messages[truncIdx],
    content: truncateStringToChars(content, maxForTarget),
  };
  return next;
}

/**
 * Always keep system (first) + the current turn anchor; fill remaining budget
 * with history newest-first. ~3.5 chars ≈ 1 token.
 *
 * Anchor = last user message through the end of the list. That covers normal
 * chat (last message is user) and Perspective multi-seat turns (user topic
 * followed by one or more assistant replies) so the real topic is never
 * dropped when the list ends on an assistant.
 *
 * Also clamps oversized single-turn bodies (system+user) that previously
 * bypassed trim when `messages.length <= 2`.
 */
export function trimConversation<T extends TrimableMessage>(
  messages: T[],
  n_ctx: number,
  n_predict: number,
): T[] {
  const budgetChars = contextCharBudget(n_ctx, n_predict);

  if (messages.length <= 2) {
    return fitMessagesToCharBudget(messages, budgetChars);
  }

  let remaining = budgetChars;

  const systemMsg = messages[0];

  let anchorStart = messages.length - 1;
  if (messages[anchorStart]?.role !== 'user') {
    for (let i = messages.length - 1; i >= 1; i--) {
      if (messages[i].role === 'user') {
        anchorStart = i;
        break;
      }
    }
  }

  const anchorTail = messages.slice(anchorStart);
  const history = messages.slice(1, anchorStart);

  remaining -= contentLength(systemMsg.content);
  for (const m of anchorTail) {
    remaining -= contentLength(m.content);
  }

  if (remaining <= 0 || history.length === 0) {
    return fitMessagesToCharBudget([systemMsg, ...anchorTail], budgetChars);
  }

  const kept: T[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgLen = contentLength(history[i].content) + 20;
    if (remaining - msgLen < 0) break;
    remaining -= msgLen;
    kept.unshift(history[i]);
  }

  return fitMessagesToCharBudget(
    [systemMsg, ...kept, ...anchorTail],
    budgetChars,
  );
}

export type ConversationTrimResult<T extends TrimableMessage> = {
  messages: T[];
  /** How many turns were dropped (0 = no trim). Algorithm unchanged. */
  droppedCount: number;
};

/** Same trim as `trimConversation`, plus drop metadata for UI honesty. */
export function applyConversationTrim<T extends TrimableMessage>(
  messages: T[],
  n_ctx: number,
  n_predict: number,
): ConversationTrimResult<T> {
  const trimmed = trimConversation(messages, n_ctx, n_predict);
  return {
    messages: trimmed,
    droppedCount: Math.max(0, messages.length - trimmed.length),
  };
}

export interface ContextPartition<T extends TrimableMessage> {
  systemMessage: T;
  earlierTurnsToSummarize: T[];
  recentTurnsToKeep: T[];
}

/**
 * Partitions conversation turns for auto-summarization when context is full.
 * Preserves the system prompt (turn 0) and the last `recentTurnCount` turns verbatim.
 * The middle turns are designated for summarization into a pinned context note.
 */
export function partitionForSummarization<T extends TrimableMessage>(
  messages: T[],
  recentTurnCount = 6,
): ContextPartition<T> | null {
  if (messages.length <= recentTurnCount + 1) {
    return null;
  }
  const systemMessage = messages[0];
  const splitIndex = Math.max(1, messages.length - recentTurnCount);
  const earlierTurnsToSummarize = messages.slice(1, splitIndex);
  const recentTurnsToKeep = messages.slice(splitIndex);

  return {
    systemMessage,
    earlierTurnsToSummarize,
    recentTurnsToKeep,
  };
}

/**
 * Builds the on-device summarization prompt for older conversation turns.
 */
export function buildSummarizationPrompt<T extends TrimableMessage>(
  earlierTurns: T[],
): string {
  const dialog = earlierTurns
    .map((m) => {
      const role = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : m.role;
      const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
      return `${role}: ${text}`;
    })
    .join('\n\n');

  return (
    'Summarize the key facts, user preferences, and important context from this earlier conversation into 3-5 concise bullet points:\n\n' +
    dialog +
    '\n\nContext Summary:'
  );
}

/**
 * Formats a pinned earlier-context system note.
 */
export function formatPinnedEarlierSummary(summaryText: string): string {
  return `Earlier in this chat:\n${summaryText.trim()}`;
}

/**
 * Consolidates the conversation by keeping system prompt, inserting the summary note,
 * and appending recent turns verbatim.
 */
export function consolidateWithSummary<T extends TrimableMessage>(
  systemMessage: T,
  summaryText: string,
  recentTurns: T[],
  createSummaryMessage: (content: string) => T,
): T[] {
  const summaryMsg = createSummaryMessage(formatPinnedEarlierSummary(summaryText));
  return [systemMessage, summaryMsg, ...recentTurns];
}
