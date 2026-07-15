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
 * Always keep system (first) + current user (last); fill remaining budget
 * with history newest-first. ~3.5 chars ≈ 1 token.
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
  const currentUserMsg = messages[messages.length - 1];
  const history = messages.slice(1, -1);

  budgetChars -= contentLength(systemMsg.content);
  budgetChars -= contentLength(currentUserMsg.content);

  if (budgetChars <= 0 || history.length === 0) {
    return [systemMsg, currentUserMsg];
  }

  const kept: T[] = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const msgLen = contentLength(history[i].content) + 20;
    if (budgetChars - msgLen < 0) break;
    budgetChars -= msgLen;
    kept.unshift(history[i]);
  }

  return [systemMsg, ...kept, currentUserMsg];
}
