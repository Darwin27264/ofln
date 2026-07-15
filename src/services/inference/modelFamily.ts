/**
 * Single source of truth for model-family detection and capability flags.
 *
 * Adding a new reasoning family = one profile here, not four regex islands
 * across aiChatService / llamaService / modelUtils / ModelCard.
 */

export type ModelFamilyId = 'qwen3' | 'deepseek-r1' | 'smollm3' | 'generic';

export interface ModelFamilyProfile {
  id: ModelFamilyId;
  /** Emit / parse literal <think>…</think> spans in the token stream. */
  supportsThinkTags: boolean;
  /** Pass Jinja `enable_thinking` (Qwen chat templates only). */
  usesEnableThinking: boolean;
  /**
   * Prefer reasoning_format 'auto' when thinking may run.
   * DeepSeek R1 / SmolLM3 are treated as always-on for format selection.
   */
  preferReasoningFormatAuto: boolean;
  /** UI affordance (psychology icon, etc.). */
  isThinkingModelForUi: boolean;
}

const GENERIC: ModelFamilyProfile = {
  id: 'generic',
  supportsThinkTags: false,
  usesEnableThinking: false,
  preferReasoningFormatAuto: false,
  isThinkingModelForUi: false,
};

const QWEN3: ModelFamilyProfile = {
  id: 'qwen3',
  supportsThinkTags: true,
  usesEnableThinking: true,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
};

const DEEPSEEK_R1: ModelFamilyProfile = {
  id: 'deepseek-r1',
  supportsThinkTags: true,
  usesEnableThinking: false,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
};

const SMOLLM3: ModelFamilyProfile = {
  id: 'smollm3',
  supportsThinkTags: true,
  usesEnableThinking: false,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
};

/**
 * Resolve family from a model filename / repo id / display name.
 *
 * Patterns match historical detectors:
 *   - qwen3(?![a-z]) — qwen3, qwen3.5, qwen3-4b…; NOT qwen2.5 / qwen3n
 *   - qwq
 *   - deepseek-r1, r1d
 *   - smollm3
 */
export function resolveModelFamily(modelName: string): ModelFamilyProfile {
  const name = (modelName || '').toLowerCase();
  if (!name) return GENERIC;

  if (/qwen3(?![a-z])/.test(name) || name.includes('qwq')) {
    return QWEN3;
  }
  if (name.includes('deepseek-r1') || /\br1d\b/.test(name) || /\br1\b/.test(name)) {
    return DEEPSEEK_R1;
  }
  if (/smollm3/.test(name)) {
    return SMOLLM3;
  }

  return GENERIC;
}

/**
 * UI helper: also accepts catalog tags / description (download picker).
 * Family id from name wins; tags/description are a soft fallback.
 */
export function isThinkingModelForUi(input: {
  id?: string;
  fileName?: string;
  description?: string;
  tags?: string[];
}): boolean {
  const haystack = `${input.id || ''} ${input.fileName || ''}`.toLowerCase();
  const family = resolveModelFamily(haystack);
  if (family.isThinkingModelForUi) return true;

  const tags = (input.tags || []).map((t) => t.toLowerCase());
  if (tags.includes('thinking') || tags.includes('reasoning')) return true;

  const description = (input.description || '').toLowerCase();
  const keywords = [
    'distilled reasoning',
    'reasoning (slower',
    'chain-of-thought',
  ];
  return keywords.some((k) => description.includes(k));
}
