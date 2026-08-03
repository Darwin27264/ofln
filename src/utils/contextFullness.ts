/**
 * Context fullness estimate (S14) — heuristic aligned with contextTrim (~3.5 chars/token).
 * Not a real tokenizer; good enough for a soft “getting full” banner.
 */

export const CONTEXT_CHARS_PER_TOKEN = 3.5;
/** Show soft banner at or above this fraction of n_ctx. */
export const CONTEXT_FULLNESS_THRESHOLD = 0.8;

export type FullnessMessage = {
  role?: string;
  content?: string | unknown;
  thought?: string;
};

function contentCharLength(content: string | unknown | undefined): number {
  if (content == null) return 0;
  if (typeof content === 'string') return content.length;
  try {
    return JSON.stringify(content).length;
  } catch {
    return 0;
  }
}

/** Rough token count from character length (ceil). */
export function estimateTokensFromChars(charCount: number): number {
  if (!(charCount > 0)) return 0;
  return Math.ceil(charCount / CONTEXT_CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for the visible conversation (content + thought + small per-message overhead).
 * Skips empty system-only noise the same way users see the thread.
 */
export function estimateConversationTokens(messages: FullnessMessage[]): number {
  let chars = 0;
  for (const m of messages) {
    chars += contentCharLength(m.content);
    if (typeof m.thought === 'string' && m.thought.length > 0) {
      chars += m.thought.length;
    }
    // Role / formatting overhead — matches trimConversation’s +20-ish per history turn spirit.
    chars += 20;
  }
  return estimateTokensFromChars(chars);
}

export type ContextFullnessResult = {
  usedTokens: number;
  nCtx: number;
  /** usedTokens / nCtx, clamped to [0, 1+]. */
  ratio: number;
  /** True when ratio ≥ CONTEXT_FULLNESS_THRESHOLD. */
  isHigh: boolean;
  /** Rounded percent for UI (capped display at 99+ when ≥1). */
  percent: number;
};

export function estimateContextFullness(
  messages: FullnessMessage[],
  nCtx: number,
): ContextFullnessResult {
  const safeCtx = Number.isFinite(nCtx) && nCtx > 0 ? Math.floor(nCtx) : 0;
  const usedTokens = estimateConversationTokens(messages);
  if (safeCtx <= 0) {
    return { usedTokens, nCtx: safeCtx, ratio: 0, isHigh: false, percent: 0 };
  }
  const ratio = usedTokens / safeCtx;
  const isHigh = ratio >= CONTEXT_FULLNESS_THRESHOLD;
  const percent =
    ratio >= 1 ? 100 : Math.max(0, Math.min(99, Math.round(ratio * 100)));
  return { usedTokens, nCtx: safeCtx, ratio, isHigh, percent };
}

/** Whether the banner should show given estimate + dismiss + chat activity. */
export function shouldShowContextFullnessBanner(opts: {
  isHigh: boolean;
  dismissed: boolean;
  hasUserMessages: boolean;
}): boolean {
  return opts.isHigh && !opts.dismissed && opts.hasUserMessages;
}
