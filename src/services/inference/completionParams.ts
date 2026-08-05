/**
 * Single builder for per-turn inference knobs (thinking, n_predict, stop, sampling).
 * Used by nativeCompletion, streamChat, and legacy handleSendMessageCompletion.
 *
 * Qwen3.5 sampling follows the HF model card (presence_penalty over high repeat
 * penalty; 0.8B gets tighter thinking budgets). llama.rn 0.12 keys are
 * `penalty_repeat` / `penalty_present` (not OpenAI `repeat_penalty`).
 */

import type { ModelSettings } from '../modelSettingsService';
import type { ModelFamilyProfile } from './modelFamily';
import { resolveModelPolicy } from './modelPolicy';
import {
  isSimplePrompt,
  resolveNPredict,
  resolveThinkingModeForTurn,
} from './promptHeuristics';
import { buildStopSequences } from './thinkStreamParser';

export interface BuildCompletionParamsInput {
  userText: string;
  modelName: string;
  settings: Pick<
    ModelSettings,
    'temperature' | 'n_predict' | 'repeat_penalty' | 'top_p' | 'top_k'
  > & {
    /** Optional for older call sites; defaults to auto (pre-S20 behavior). */
    thinkingMode?: ModelSettings['thinkingMode'];
  };
}

export interface BuiltCompletionParams {
  family: ModelFamilyProfile;
  n_predict: number;
  temperature: number;
  top_p: number;
  top_k: number;
  /** llama.rn / llama.cpp key (maps from settings.repeat_penalty). */
  penalty_repeat: number;
  /** llama.rn / llama.cpp key — Qwen's preferred anti-loop lever. */
  penalty_present: number;
  stop: string[];
  /** Only set for families that use Jinja enable_thinking (Qwen). */
  enable_thinking?: boolean;
  reasoning_format: 'auto' | 'none';
  simple: boolean;
  /** Convenience: family.supportsThinkTags */
  supportsThinkTags: boolean;
}

export function buildCompletionParams(
  input: BuildCompletionParamsInput,
): BuiltCompletionParams {
  const { userText, modelName, settings } = input;
  const policy = resolveModelPolicy(modelName);
  const family = policy.family;
  const simple = isSimplePrompt(userText);
  // Qwen tiny (≤1B): HF warns 0.8B loops more in thinking mode.
  const tinyQwen = family.id === 'qwen3' && policy.sizeTier === 'tiny';

  // Auto/On/Off only set enable_thinking for jinja_enable (Qwen). always_on/none omit it.
  const enableThinking = resolveThinkingModeForTurn({
    thinkingMode: settings.thinkingMode,
    strategy: policy.thinking.strategy,
    userText,
  });

  const thinkingActive = !!enableThinking;
  let n_predict = resolveNPredict(userText, settings.n_predict, thinkingActive);

  // Cap thinking budget on tiny Qwen so loops cannot burn the whole phone turn.
  if (thinkingActive && tinyQwen) {
    n_predict = Math.min(n_predict, 384);
  }

  let temperature = settings.temperature;
  let top_p = settings.top_p;
  let top_k = settings.top_k;
  let penalty_repeat = settings.repeat_penalty;
  let penalty_present = 0;

  if (family.id === 'qwen3') {
    // Official guidance uses top_k=20 for both modes.
    top_k = Math.min(top_k, 20);

    if (thinkingActive) {
      // Thinking text defaults from Qwen3.5 model card (mobile-tempered).
      top_p = Math.max(top_p, 0.95);
      temperature = Math.min(1.0, Math.max(temperature, 0.85));
      penalty_repeat = 1.0;
      penalty_present = tinyQwen ? 1.5 : 1.25;
    } else if (simple) {
      // Non-thinking: presence_penalty fights phrase loops better than high repeat.
      top_p = Math.min(1.0, Math.max(top_p, 0.95));
      penalty_repeat = 1.0;
      penalty_present = tinyQwen ? 2.0 : 1.5;
    } else {
      penalty_repeat = Math.min(penalty_repeat, 1.1);
      penalty_present = 1.0;
    }
  } else if (simple) {
    // Non-Qwen: keep stronger sequence penalty on short creative turns.
    penalty_repeat = Math.min(1.5, Math.max(penalty_repeat, 1.35));
  }

  const stop = buildStopSequences(simple);

  // Qwen: auto only when thinking on this turn.
  // DeepSeek / Smol: always auto (always-on reasoning families).
  let reasoning_format: 'auto' | 'none' = 'none';
  if (family.id === 'deepseek-r1' || family.id === 'smollm3') {
    reasoning_format = 'auto';
  } else if (family.preferReasoningFormatAuto && thinkingActive) {
    reasoning_format = 'auto';
  }

  return {
    family,
    n_predict,
    temperature,
    top_p,
    top_k,
    penalty_repeat,
    penalty_present,
    stop,
    ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
    reasoning_format,
    simple,
    supportsThinkTags: family.supportsThinkTags,
  };
}
