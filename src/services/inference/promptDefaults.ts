/**
 * Short, positive system prompts by size tier.
 * Tiny models burn budget debating long negative rule lists — keep strings brief.
 */

import type { ModelSizeTier } from './modelFamily';

/** Universal mobile baseline (also exported for settings DEFAULT_SETTINGS). */
export const SYSTEM_PROMPT_MOBILE =
  "You are a helpful assistant on the user's device. " +
  "Answer the latest user message clearly and accurately. " +
  "Keep simple asks short; give more detail only when the question needs it. " +
  "Start with the answer — avoid reply openers like \"I need to\" or \"Wait,\".";

/** ≤1B: minimal identity so the user turn owns the task. */
export const SYSTEM_PROMPT_TINY =
  'You are a concise assistant on this phone. ' +
  "Answer the user's latest message clearly. Prefer short answers unless detail is needed.";

/** Gemma / general instruct — same habit, slightly warmer. */
export const SYSTEM_PROMPT_GEMMA =
  "You are a helpful assistant on the user's device. " +
  'Answer the latest user message clearly and accurately. ' +
  'Match reply length to the question.';

/** Phi: optional precision tilt without long constraint lists. */
export const SYSTEM_PROMPT_PHI =
  "You are a careful assistant on the user's device. " +
  'Answer the latest user message clearly and accurately. ' +
  'Be precise on math and logic; keep simple asks short.';

/**
 * Resolve default system text from size + optional family id.
 * Does not include persona content — that is composed later.
 */
export function systemPromptForDefaults(
  sizeTier: ModelSizeTier,
  familyId?: string,
): string {
  if (sizeTier === 'tiny') return SYSTEM_PROMPT_TINY;
  if (familyId === 'phi') return SYSTEM_PROMPT_PHI;
  if (familyId === 'gemma4') return SYSTEM_PROMPT_GEMMA;
  return SYSTEM_PROMPT_MOBILE;
}
