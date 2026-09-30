/**
 * GGUF-first, runtime ModelRuntimePolicy resolver.
 *
 * No database — pure functions from filename + family/size heuristics.
 * Layer stack (most → least authoritative at call sites):
 *   GGUF template (load path) → user settings → this policy → generic
 *
 * Call `resolveModelPolicy(modelName)` from settings seed, sanitize fallback,
 * and completion param building. New models with healthy GGUFs need zero entries.
 */

import {
  resolveModelFamily,
  resolveSizeTier,
  type ModelFamilyId,
  type ModelFamilyProfile,
  type ModelSizeTier,
  type ThinkingStrategy,
} from './modelFamily';
import { getSafeChatTemplateStub } from './familyTemplates';
import { systemPromptForDefaults } from './promptDefaults';

/** Bump when default system / sampling packages change (settings refresh gate). */
export const POLICY_SCHEMA_VERSION = 1;

export type TemplatePrefer = 'gguf' | 'family_stub';

export interface ModelRuntimePolicy {
  family: ModelFamilyProfile;
  familyId: ModelFamilyId;
  sizeTier: ModelSizeTier;
  systemPromptDefault: string;
  thinking: {
    strategy: ThinkingStrategy;
    /** Product default when user has Auto. Complex-ask heuristic still applies for jinja_enable. */
    preferDefault: 'off' | 'auto';
  };
  sampling: {
    temperature: number;
    top_p: number;
    top_k: number;
    /** Mapped to settings.repeat_penalty / llama.rn penalty_repeat. */
    repeat_penalty: number;
    n_predict: number;
  };
  template: {
    prefer: TemplatePrefer;
    /** Jinja used only when GGUF template is missing/unusable. */
    familyStub: string;
  };
  /** How this object was derived (always heuristic today). */
  source: 'family' | 'generic';
  schemaVersion: number;
}

const BASE_SAMPLING: ModelRuntimePolicy['sampling'] = {
  temperature: 0.8,
  top_p: 0.95,
  top_k: 20,
  repeat_penalty: 1.05,
  n_predict: 256,
};

function samplingFor(familyId: ModelFamilyId, sizeTier: ModelSizeTier): ModelRuntimePolicy['sampling'] {
  const s = { ...BASE_SAMPLING };

  if (familyId === 'qwen3') {
    s.top_k = 20;
    s.temperature = 0.8;
    s.top_p = 0.95;
    if (sizeTier === 'tiny') {
      s.n_predict = 192;
      s.repeat_penalty = 1.05;
    }
  } else if (familyId === 'gemma4') {
    s.temperature = 0.7;
    s.top_p = 0.9;
    s.top_k = 40;
  } else if (familyId === 'phi') {
    s.temperature = 0.7;
    s.top_p = 0.9;
    s.top_k = 40;
  } else if (familyId === 'smollm3') {
    s.temperature = 0.75;
    s.top_p = 0.9;
    s.top_k = 40;
  }

  if (sizeTier === 'tiny' && familyId !== 'qwen3') {
    s.n_predict = Math.min(s.n_predict, 192);
  }

  return s;
}

/**
 * Resolve runtime policy for a model path / filename / display name.
 * Cheap and pure — safe to call every turn or once per load.
 */
export function resolveModelPolicy(modelName: string): ModelRuntimePolicy {
  const family = resolveModelFamily(modelName);
  const sizeTier = resolveSizeTier(modelName);
  const familyId = family.id;
  const source: ModelRuntimePolicy['source'] =
    familyId === 'generic' ? 'generic' : 'family';

  return {
    family,
    familyId,
    sizeTier,
    systemPromptDefault: systemPromptForDefaults(sizeTier, familyId),
    thinking: {
      strategy: family.thinkingStrategy,
      preferDefault:
        family.thinkingStrategy === 'jinja_enable' ||
        family.thinkingStrategy === 'always_on'
          ? 'auto'
          : 'off',
    },
    sampling: samplingFor(familyId, sizeTier),
    template: {
      prefer: 'gguf',
      familyStub: getSafeChatTemplateStub(familyId),
    },
    source,
    schemaVersion: POLICY_SCHEMA_VERSION,
  };
}

/** Short help blurb for Model Settings. */
export function policyRecommendedBlurb(policy: ModelRuntimePolicy): string {
  const think =
    policy.thinking.strategy === 'jinja_enable'
      ? 'Hybrid thinking (on for complex asks).'
      : policy.thinking.strategy === 'always_on'
        ? 'Reasoning-style streams when the template supports them.'
        : 'Standard chat (no special thinking switch).';
  return (
    `${policy.familyId} · ${policy.sizeTier} · ${think} ` +
    'Uses the GGUF chat template when available.'
  );
}
