/**
 * Sliding-window conversation trim so the system prompt is not silently
 * dropped when n_ctx fills up.
 */

export type TrimableMessage = {
  role: string;
  content: string | unknown;
};

function contentLength(content: string | unknown): number {
  if (typeof content === 'string') return content.length;
  return JSON.stringify(content).length;
}

/**
 * Always keep system (first) + the current turn anchor; fill remaining budget
 * with history newest-first. ~3.5 chars ≈ 1 token.
 *
 * Anchor = last user message through the end of the list. That covers normal
 * chat (last message is user) and Perspective multi-seat turns (user topic
 * followed by one or more assistant replies) so the real topic is never
 * dropped when the list ends on an assistant.
 */
export function trimConversation<T extends TrimableMessage>(
  messages: T[],
  n_ctx: number,
  n_predict: number,
): T[] {
  if (messages.length <= 2) return messages;

  const CHARS_PER_TOKEN = 3.5;
  let budgetChars = Math.max(0, n_ctx - n_predict - 128) * CHARS_PER_TOKEN;

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

  budgetChars -= contentLength(systemMsg.content);
  for (const m of anchorTail) {
    budgetChars -= contentLength(m.content);
  }

  if (budgetChars <= 0 || history.length === 0) {
    return [systemMsg, ...anchorTail];
  }

  const kept: T[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgLen = contentLength(history[i].content) + 20;
    if (budgetChars - msgLen < 0) break;
    budgetChars -= msgLen;
    kept.unshift(history[i]);
  }

  return [systemMsg, ...kept, ...anchorTail];
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
