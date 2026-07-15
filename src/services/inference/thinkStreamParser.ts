/**
 * Shared stop sequences and think-block / CoT parsing helpers
 * used by nativeCompletion, streamChat, and legacy llamaService.
 */

export const STOP_WORDS = [
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

/** Extra stops for simple prompts so CoT monologues cut off early. */
export const SIMPLE_PROMPT_STOP_EXTRAS = [
  '<think>',
  'Thinking in English',
  'Thinking Process:',
];

export function buildStopSequences(simple: boolean): string[] {
  return simple ? [...STOP_WORDS, ...SIMPLE_PROMPT_STOP_EXTRAS] : [...STOP_WORDS];
}

export function isLikelyChainOfThought(text: string): boolean {
  const t = text.trim();
  if (t.length < 80) return false;
  if (/^Thinking\b/i.test(t)) return true;
  if (/Thinking Process:/i.test(t)) return true;
  const needCount = (t.match(/\bI need to\b/gi) || []).length;
  const waitCount = (t.match(/\bWait[, ]/gi) || []).length;
  if (needCount + waitCount >= 3) return true;
  if (/The user (has asked|is asking)/i.test(t) && t.length > 300) return true;
  return false;
}

/**
 * Prefer a short trailing sentence that looks like an answer, not internal monologue.
 */
export function extractAnswerFromCotDump(text: string): string | null {
  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\/?think>/gi, '')
    .trim();
  const sentences = cleaned
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 280);
  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i];
    if (/^(So |Wait|I need|The user|I will|I should|Let me|Hmm)/i.test(s)) continue;
    if (
      /^(The |A |An |Octop|Honey|Earth|Pyramid|Moon|Water|Human)/i.test(s) ||
      /\b(is|are|was|has|have)\b/i.test(s)
    ) {
      return s;
    }
  }
  return null;
}

export function stripThinkBlocks(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const openIdx = t.search(/<think>/i);
  if (openIdx >= 0) {
    // Incomplete think block — drop from visible answer (kept via `thought`).
    t = t.slice(0, openIdx);
  }
  return t
    .replace(/<end_of_turn>/g, '')
    .replace(/<\/?eos>/g, '')
    .trim();
}

/**
 * Cut output when a short phrase starts looping (common on tiny Q4 models).
 * Keeps the first occurrence of the phrase; drops the rest of the run.
 */
export function trimDegenerateRepetition(text: string): string {
  if (!text || text.length < 40) return text;

  // Consecutive repeats of a 2–6 token phrase, e.g. "of the number of the number"
  const consecutive = text.match(
    /((?:[A-Za-z0-9']+\s+){1,5}[A-Za-z0-9']+)(?:\s+\1){2,}/,
  );
  if (consecutive && consecutive.index != null) {
    return text.slice(0, consecutive.index + consecutive[1].length).trim();
  }

  // Same short word repeated many times in a row: "number number number…"
  const wordSpam = text.match(/\b([A-Za-z]{3,})\b(?:\s+\1\b){4,}/);
  if (wordSpam && wordSpam.index != null) {
    return text.slice(0, wordSpam.index + wordSpam[1].length).trim();
  }

  return text;
}

export interface ThinkStreamState {
  inThinkBlock: boolean;
  thought: string;
  visibleAccum: string;
}

export function createThinkStreamState(): ThinkStreamState {
  return { inThinkBlock: false, thought: '', visibleAccum: '' };
}

/**
 * Feed one streamed delta into think/visible state.
 * Returns whether the delta was consumed into thought (caller should skip
 * pushing raw think tokens into the visible bubble).
 */
export function ingestThinkDelta(
  state: ThinkStreamState,
  delta: string,
  supportsThinkTags: boolean,
): { consumedAsThought: boolean; visibleText: string } {
  if (!supportsThinkTags) {
    state.visibleAccum += delta;
    return { consumedAsThought: false, visibleText: state.visibleAccum };
  }

  if (delta.includes('<think>')) {
    state.inThinkBlock = true;
    state.thought += delta.replace(/<think>/gi, '');
    return { consumedAsThought: true, visibleText: stripThinkBlocks(state.visibleAccum) };
  }

  if (state.inThinkBlock) {
    if (delta.includes('</think>')) {
      state.inThinkBlock = false;
      state.thought += delta.replace(/<\/think>/gi, '');
      state.thought = state.thought.trim();
    } else {
      state.thought += delta;
    }
    return { consumedAsThought: true, visibleText: stripThinkBlocks(state.visibleAccum) };
  }

  state.visibleAccum += delta;
  return {
    consumedAsThought: false,
    visibleText: stripThinkBlocks(state.visibleAccum),
  };
}

/**
 * After generation: repair visible vs thought when CoT leaked without tags.
 */
export function finalizeVisibleAndThought(
  combined: string,
  currentThought: string,
  supportsThinkTags: boolean,
): { visibleContent: string; thought: string } {
  let thought = currentThought;
  const thinkMatch = combined.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch?.[1]?.trim()) {
    thought = (thought || thinkMatch[1]).trim();
  }

  let visibleContent = supportsThinkTags
    ? stripThinkBlocks(combined)
    : combined.trim();

  if (
    (!visibleContent.trim() || isLikelyChainOfThought(visibleContent)) &&
    (thought || isLikelyChainOfThought(combined))
  ) {
    const cotSource = thought || combined;
    if (!thought) thought = cotSource.trim();
    const extracted = extractAnswerFromCotDump(cotSource);
    visibleContent = extracted || '';
  }

  visibleContent = trimDegenerateRepetition(visibleContent);
  return { visibleContent, thought };
}
