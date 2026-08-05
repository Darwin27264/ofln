jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  resolveModelFamily,
  resolveSizeTier,
} from '../../src/services/inference/modelFamily';
import {
  resolveModelPolicy,
  POLICY_SCHEMA_VERSION,
} from '../../src/services/inference/modelPolicy';
import {
  getSafeChatTemplateStub,
  STUB_CHATML_THINK,
  STUB_GEMMA,
  STUB_PHI,
} from '../../src/services/inference/familyTemplates';
import { SYSTEM_PROMPT_TINY } from '../../src/services/inference/promptDefaults';
import {
  getDefaultSettingsForModel,
  validateSettings,
} from '../../src/services/modelSettingsService';

describe('resolveModelFamily / sizeTier', () => {
  it('detects Qwen, Gemma, Phi, Smol families', () => {
    expect(resolveModelFamily('Qwen3.5-0.8B-Instruct-Q4_0.gguf').id).toBe('qwen3');
    expect(resolveModelFamily('gemma-4-E2B-it-Q4_0.gguf').id).toBe('gemma4');
    expect(resolveModelFamily('microsoft_Phi-4-mini-instruct-Q4_0.gguf').id).toBe(
      'phi',
    );
    expect(resolveModelFamily('SmolLM3-3B-Q4_0.gguf').id).toBe('smollm3');
    expect(resolveModelFamily('unknown-chat.gguf').id).toBe('generic');
  });

  it('buckets size tiers from filenames', () => {
    expect(resolveSizeTier('Qwen3.5-0.8B-Instruct-Q4_0.gguf')).toBe('tiny');
    expect(resolveSizeTier('Qwen3.5-2B-Instruct-Q4_0.gguf')).toBe('small');
    expect(resolveSizeTier('Qwen3.5-4B-Instruct-Q4_0.gguf')).toBe('medium');
    expect(resolveSizeTier('gemma-4-E2B-it-Q4_0.gguf')).toBe('medium');
  });
});

describe('resolveModelPolicy', () => {
  it('returns GGUF-preferring policy with family stub fallback', () => {
    const qwen = resolveModelPolicy('Qwen3.5-0.8B-Instruct-Q4_0.gguf');
    expect(qwen.schemaVersion).toBe(POLICY_SCHEMA_VERSION);
    expect(qwen.familyId).toBe('qwen3');
    expect(qwen.sizeTier).toBe('tiny');
    expect(qwen.systemPromptDefault).toBe(SYSTEM_PROMPT_TINY);
    expect(qwen.template.prefer).toBe('gguf');
    expect(qwen.template.familyStub).toBe(STUB_CHATML_THINK);
    expect(qwen.thinking.strategy).toBe('jinja_enable');
  });

  it('uses Gemma stub for Gemma 4 fallback', () => {
    const p = resolveModelPolicy('gemma-4-E2B-it-Q4_0.gguf');
    expect(p.familyId).toBe('gemma4');
    expect(p.template.familyStub).toBe(STUB_GEMMA);
    expect(getSafeChatTemplateStub('gemma4')).toContain('<start_of_turn>');
  });

  it('uses Phi stub for Phi-4 mini fallback', () => {
    const p = resolveModelPolicy('microsoft_Phi-4-mini-instruct-Q4_0.gguf');
    expect(p.familyId).toBe('phi');
    expect(p.template.familyStub).toBe(STUB_PHI);
    expect(getSafeChatTemplateStub('phi')).toContain('<|user|>');
  });
});

describe('getDefaultSettingsForModel / validateSettings source', () => {
  it('seeds system prompt from policy for tiny Qwen', () => {
    const s = getDefaultSettingsForModel('Qwen3.5-0.8B-Instruct-Q4_0.gguf');
    expect(s.systemPrompt).toBe(SYSTEM_PROMPT_TINY);
    expect(s.systemPromptSource).toBe('default');
  });

  it('refreshes default prompts but keeps user custom prompts', () => {
    const file = 'Qwen3.5-2B-Instruct-Q4_0.gguf';
    const defaults = getDefaultSettingsForModel(file);

    const refreshed = validateSettings(
      {
        systemPrompt: 'This is a conversation between user and assistant, a friendly chatbot.',
        systemPromptSource: 'default',
      },
      file,
    );
    expect(refreshed.systemPrompt).toBe(defaults.systemPrompt);
    expect(refreshed.systemPromptSource).toBe('default');

    const custom = validateSettings(
      {
        systemPrompt: 'You are a pirate who only talks about ships.',
        systemPromptSource: 'user',
      },
      file,
    );
    expect(custom.systemPrompt).toContain('pirate');
    expect(custom.systemPromptSource).toBe('user');
  });
});
