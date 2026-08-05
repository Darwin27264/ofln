/**
 * Single source of truth for model-family detection and capability flags.
 *
 * Adding a new reasoning family = one profile here, not four regex islands
 * across aiChatService / llamaService / modelUtils / ModelCard.
 */

export type ModelFamilyId =
  | 'qwen3'
  | 'deepseek-r1'
  | 'smollm3'
  | 'gemma4'
  | 'phi'
  | 'generic';

/** Rough parameter-size bucket from filenames (0.8B → tiny, etc.). */
export type ModelSizeTier = 'tiny' | 'small' | 'medium' | 'large';

/**
 * How this family exposes “thinking” / reasoning to llama.rn.
 * - jinja_enable: Qwen-style enable_thinking in the chat template
 * - always_on: reasoning stream expected every turn (R1 / some Smol)
 * - none: no special thinking path
 */
export type ThinkingStrategy = 'none' | 'jinja_enable' | 'always_on';

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
  /** Runtime thinking strategy for ModelRuntimePolicy. */
  thinkingStrategy: ThinkingStrategy;
}

const GENERIC: ModelFamilyProfile = {
  id: 'generic',
  supportsThinkTags: false,
  usesEnableThinking: false,
  preferReasoningFormatAuto: false,
  isThinkingModelForUi: false,
  thinkingStrategy: 'none',
};

const QWEN3: ModelFamilyProfile = {
  id: 'qwen3',
  supportsThinkTags: true,
  usesEnableThinking: true,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
  thinkingStrategy: 'jinja_enable',
};

const DEEPSEEK_R1: ModelFamilyProfile = {
  id: 'deepseek-r1',
  supportsThinkTags: true,
  usesEnableThinking: false,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
  thinkingStrategy: 'always_on',
};

const SMOLLM3: ModelFamilyProfile = {
  id: 'smollm3',
  supportsThinkTags: true,
  usesEnableThinking: false,
  preferReasoningFormatAuto: true,
  isThinkingModelForUi: true,
  thinkingStrategy: 'always_on',
};

const GEMMA4: ModelFamilyProfile = {
  id: 'gemma4',
  supportsThinkTags: false,
  usesEnableThinking: false,
  preferReasoningFormatAuto: false,
  isThinkingModelForUi: false,
  thinkingStrategy: 'none',
};

const PHI: ModelFamilyProfile = {
  id: 'phi',
  supportsThinkTags: false,
  usesEnableThinking: false,
  preferReasoningFormatAuto: false,
  isThinkingModelForUi: false,
  thinkingStrategy: 'none',
};

/**
 * Resolve family from a model filename / repo id / display name.
 *
 * Patterns match historical detectors:
 *   - qwen3(?![a-z]) — qwen3, qwen3.5, qwen3-4b…; NOT qwen2.5 / qwen3n
 *   - qwq
 *   - deepseek-r1, r1d
 *   - smollm3
 *   - gemma-4 / gemma4
 *   - phi-4 / phi4 / phi-3
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
  if (/gemma[-_]?4|gemma4/.test(name)) {
    return GEMMA4;
  }
  if (/\bphi[-_]?[34]\b|phi[-_]?4|phi4|phi-3|phi3/.test(name)) {
    return PHI;
  }

  return GENERIC;
}

/**
 * Heuristic parameter-size bucket from filenames / display names.
 * Fail open to 'small' when unknown (mobile-safe middle ground).
 */
export function resolveSizeTier(modelName: string): ModelSizeTier {
  const n = (modelName || '').toLowerCase();
  if (!n) return 'small';

  // Explicit tiny markers first (0.8B, 800M, 1B, etc.)
  if (/0\.?5\s*b|0_5b|\b500m\b|\b0\.?6\s*b|0\.?8\s*b|0_8b|\b800m\b|\b1\s*b\b|\b1b\b|1\.5\s*b|1_5b/.test(n)) {
    // 1.5B is still "tiny-ish" for system-prompt length; keep tiny for ≤1B only
    if (/1\.5\s*b|1_5b/.test(n)) return 'small';
    return 'tiny';
  }

  if (/\b([2-3](\.\d+)?)\s*b\b|[2-3]_?\d*b\b|e2b|e4b/.test(n)) {
    // E2B / E4B are Gemma efficient tiers — treat as medium for prompt length
    if (/\be[24]b\b/.test(n)) return 'medium';
    return 'small';
  }

  if (/\b([4-7](\.\d+)?)\s*b\b|[4-7]_?\d*b\b/.test(n)) {
    return 'medium';
  }

  if (/\b(8|9|1[0-9]|[2-9][0-9])(\.\d+)?\s*b\b|\b1[0-9]b\b|\b[2-9][0-9]b\b/.test(n)) {
    return 'large';
  }

  return 'small';
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
