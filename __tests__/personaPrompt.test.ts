jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(async () => false),
  mkdir: jest.fn(async () => undefined),
  copyFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
}));

import {
  buildPersonaSystemPrompt,
  isDefaultSystemPrompt,
  type Persona,
} from '../src/services/personaService';
import {
  SYSTEM_PROMPT_MOBILE,
  SYSTEM_PROMPT_TINY,
} from '../src/services/inference/promptDefaults';

const basePersona = (): Persona => ({
  id: 'p1',
  name: 'Noir Detective',
  tagline: 'PI',
  createdAt: 1,
  identity: 'You are a hard-boiled detective.',
  backstory: 'Fifteen years on the job.',
  speakingStyle: 'Short punchy sentences.',
  boundaries: 'No illegal jobs.',
  breakCharacterWhen: 'user asks to break character',
  examples: [
    { user: 'Need a case.', persona: "Alright. What's the story?" },
  ],
  personaStrength: 'high',
});

describe('isDefaultSystemPrompt', () => {
  it('treats empty and stock mobile prompts as default', () => {
    expect(isDefaultSystemPrompt('')).toBe(true);
    expect(isDefaultSystemPrompt(SYSTEM_PROMPT_MOBILE)).toBe(true);
    expect(isDefaultSystemPrompt(SYSTEM_PROMPT_TINY)).toBe(true);
    expect(isDefaultSystemPrompt('This is a conversation between user and assistant, a friendly chatbot.')).toBe(true);
  });

  it('treats custom user prompts as non-default', () => {
    expect(isDefaultSystemPrompt('Always reply in pirate speak.')).toBe(false);
  });
});

describe('buildPersonaSystemPrompt', () => {
  it('replaces stock assistant prompt with persona identity', () => {
    const out = buildPersonaSystemPrompt(basePersona(), SYSTEM_PROMPT_MOBILE);
    expect(out.startsWith('You are Noir Detective.')).toBe(true);
    expect(out).toContain('You ARE Noir Detective.');
    expect(out).toContain('hard-boiled detective');
    expect(out).toContain('Fifteen years');
    expect(out).toContain("Alright. What's the story?");
    expect(out).not.toContain('helpful assistant on the user');
    expect(out).not.toContain('roleplaying as');
  });

  it('low strength only injects speaking style', () => {
    const out = buildPersonaSystemPrompt(
      { ...basePersona(), personaStrength: 'low' },
      SYSTEM_PROMPT_MOBILE,
    );
    expect(out).toContain('Short punchy sentences');
    expect(out).not.toContain('hard-boiled detective');
    expect(out).not.toContain('Fifteen years');
    expect(out).not.toContain("Alright. What's the story?");
  });

  it('medium strength skips backstory and examples', () => {
    const out = buildPersonaSystemPrompt(
      { ...basePersona(), personaStrength: 'medium' },
      SYSTEM_PROMPT_MOBILE,
    );
    expect(out).toContain('hard-boiled detective');
    expect(out).toContain('No illegal jobs');
    expect(out).not.toContain('Fifteen years');
    expect(out).not.toContain("Alright. What's the story?");
  });

  it('keeps custom system prompt secondary to character', () => {
    const out = buildPersonaSystemPrompt(
      basePersona(),
      'Prefer metric units.',
    );
    expect(out.indexOf('You are Noir Detective.')).toBe(0);
    expect(out).toContain('Prefer metric units.');
    expect(out).toContain('do not conflict with staying in character');
  });

  it('returns helpful baseline when no persona', () => {
    const out = buildPersonaSystemPrompt(null, '');
    expect(out).toContain('helpful');
  });
});
