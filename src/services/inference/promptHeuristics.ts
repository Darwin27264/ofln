/**
 * Prompt complexity heuristics used to decide dynamic thinking /
 * token budgets for on-device inference.
 */

export function isComplexQuery(text: string): boolean {
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 20) return true;
  if (
    /\b(explain|analyze|analyse|compare|solve|calculate|prove|derive|implement|debug|optimize|refactor|design|summarize|summarise|translate|evaluate|critique)\b/i.test(
      text,
    )
  ) {
    return true;
  }
  if (/[+\-*/^=<>√∫∑∏≈≤≥≠]|\\[a-z]+\{/.test(text)) return true;
  if (/```|`[^`]+`/.test(text)) return true;
  if ((text.match(/\?/g) || []).length > 1) return true;
  return false;
}

/**
 * Short / conversational asks that should never burn tokens on chain-of-thought
 * (e.g. "another fun fact", "hi", "thanks", "one more").
 * Complex signals (explain/solve/math/code) win even when the prompt is short.
 */
export function isSimplePrompt(text: string): boolean {
  if (isComplexQuery(text)) return false;

  const t = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return true;
  const words = t.split(' ').filter(Boolean);
  if (words.length <= 6) return true;
  if (words.length > 16) return false;

  if (
    /^(another|one more|again|more please|more|yes|yep|yeah|ok|okay|sure|thanks|thank you|cool|nice|lol)\b/.test(
      t,
    )
  ) {
    return true;
  }

  if (
    words.length <= 14 &&
    /\b(fun fact|random fact|fact|joke|riddle|quote|tip|trivia)\b/.test(t)
  ) {
    return true;
  }

  if (
    words.length <= 12 &&
    /^(give me|tell me|say|name|list)\b/.test(t) &&
    !/\b(why|how come|explain|analyze|step by step)\b/.test(t)
  ) {
    return true;
  }

  return false;
}

/** Resolve whether this turn should enable model "thinking". */
export function resolveEnableThinking(
  userText: string,
  modelSupportsThinking: boolean,
): boolean {
  if (!modelSupportsThinking) return false;
  if (isSimplePrompt(userText)) return false;
  return isComplexQuery(userText);
}

/** Token budget: keep simple turns snappy on-device / emulator. */
export function resolveNPredict(
  userText: string,
  settingsNPredict: number,
  thinking: boolean,
): number {
  if (thinking) {
    return Math.max(settingsNPredict, 512);
  }
  if (isSimplePrompt(userText)) {
    return Math.min(settingsNPredict, 96);
  }
  return settingsNPredict;
}
