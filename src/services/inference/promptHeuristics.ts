/**
 * Prompt complexity heuristics used to decide dynamic thinking /
 * token budgets for on-device inference.
 */

/** Strong signals that justify spending tokens on private reasoning. */
const STRONG_THINKING_RE =
  /\b(step by step|think (hard|carefully|deeply)|reason through|prove|derive|debug|optimize|refactor|implement|calculate|solve|algorithm|complexity|proof)\b/i;

/** Softer analysis verbs — only count when the ask isn't tiny. */
const SOFT_COMPLEX_RE =
  /\b(explain|analyze|analyse|compare|design|summarize|summarise|translate|evaluate|critique|walk me through|how does|how do|why (does|do|is|are))\b/i;

function isComplexQuery(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  const wordCount = t.split(/\s+/).filter(Boolean).length;

  if (STRONG_THINKING_RE.test(t)) return true;
  if (/[+\-*/^=<>√∫∑∏≈≤≥≠]|\\[a-z]+\{/.test(t)) return true;
  if (/```|`[^`]+`/.test(t)) return true;
  if ((t.match(/\?/g) || []).length > 1) return true;

  // Soft analysis verbs need a bit of substance — avoid thinking on "explain hi".
  if (wordCount >= 8 && SOFT_COMPLEX_RE.test(t)) return true;

  // Long multi-part asks only (raised so casual chat stays non-thinking).
  if (wordCount >= 32) return true;

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
  // Prefer off: only complex asks turn thinking on.
  return isComplexQuery(userText);
}

/**
 * When thinking is on, strip anti-CoT / meta rules that fight enable_thinking.
 * Tiny models (≤1B) otherwise burn n_predict listing constraints and looping on
 * conversation-history / "do not debate instructions" checks.
 */
export function adaptSystemPromptForThinking(
  prompt: string,
  thinkingEnabled: boolean,
): string {
  if (!thinkingEnabled || !prompt) return prompt;

  let p = prompt
    .replace(/\s*Never write chain-of-thought[^.]*\.\s*/gi, ' ')
    .replace(/\s*Never include chain-of-thought[^.]*\.\s*/gi, ' ')
    .replace(/\s*Reply briefly with the answer only\.\s*/gi, ' ')
    .replace(/\s*Prefer a direct answer in the user-visible reply[^.]*\.\s*/gi, ' ')
    .replace(
      /\s*Do not narrate planning or inner monologue in the reply[^.]*\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*For simple questions, reply in 1[–-]3 short sentences with the answer only\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Do not repeat facts already given in this conversation\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Match reply length to the question[^.]*\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Be helpful and match reply length to the question\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Start with the answer[^.]*\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Keep simple asks short[^.]*\.\s*/gi,
      ' ',
    )
    // Drop any prior thinking suffix so we don't stack meta rules.
    .replace(
      /\s*For this turn you may use brief private reasoning[^.]*\.\s*/gi,
      ' ',
    )
    .replace(
      /\s*Keep reasoning focused[^.]*\.\s*/gi,
      ' ',
    )
    .replace(/\s*Think briefly about the user's question[^.]*\.\s*/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!/Think briefly about the user's question/i.test(p)) {
    // Short + positive only — negative meta rules ("do not debate…") cause loops.
    p += ' Think briefly about the user\'s question, then answer.';
  }
  return p;
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
