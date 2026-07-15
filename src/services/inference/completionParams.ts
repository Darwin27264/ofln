/**
 * Single builder for per-turn inference knobs (thinking, n_predict, stop, temp).
 * Used by nativeCompletion, streamChat, and legacy handleSendMessageCompletion.
 */

import type { ModelSettings } from '../modelSettingsService';
import { resolveModelFamily, type ModelFamilyProfile } from './modelFamily';
import {
  isSimplePrompt,
  resolveEnableThinking,
  resolveNPredict,
} from './promptHeuristics';
import { buildStopSequences } from './thinkStreamParser';

export interface BuildCompletionParamsInput {
  userText: string;
  modelName: string;
  settings: Pick<ModelSettings, 'temperature' | 'n_predict' | 'repeat_penalty'>;
}

export interface BuiltCompletionParams {
  family: ModelFamilyProfile;
  n_predict: number;
  temperature: number;
  repeat_penalty: number;
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
  const family = resolveModelFamily(modelName);
  const simple = isSimplePrompt(userText);

  const enableThinking = family.usesEnableThinking
    ? resolveEnableThinking(userText, true)
    : undefined;

  const thinkingActive = !!enableThinking;
  const n_predict = resolveNPredict(userText, settings.n_predict, thinkingActive);

  // Keep user temperature for simple asks — cooling toward 0.55 makes tiny
  // Q4 models stick in "of the X of the X …" loops once they start.
  const temperature = settings.temperature;

  // Stronger anti-repeat on short creative turns (facts/jokes) where tiny
  // models otherwise fill the whole n_predict budget with one phrase.
  const repeat_penalty = simple
    ? Math.min(1.5, Math.max(settings.repeat_penalty, 1.35))
    : settings.repeat_penalty;

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
    repeat_penalty,
    stop,
    ...(enableThinking !== undefined ? { enable_thinking: enableThinking } : {}),
    reasoning_format,
    simple,
    supportsThinkTags: family.supportsThinkTags,
  };
}
