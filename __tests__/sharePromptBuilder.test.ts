import {
  buildPromptText,
  ACTION_PILLS,
  SHARE_SYSTEM_PROMPT,
  type ActionType,
} from '../src/services/sharePromptBuilder';

describe('sharePromptBuilder', () => {
  const sampleText = 'This is a test message to evaluate offline transformations.';

  it('includes expected quick actions in ACTION_PILLS', () => {
    const ids = ACTION_PILLS.map((p) => p.id);
    expect(ids).toContain('summarize');
    expect(ids).toContain('rephrase');
    expect(ids).toContain('fix_grammar');
    expect(ids).toContain('translate');
    expect(ids).toContain('draft_reply');
    expect(ids).toContain('tone_formal');
    expect(ids).toContain('tone_casual');
    expect(ids).toContain('key_points');
    expect(ids).toContain('simplify');
    expect(ids).toContain('custom');
  });

  it('builds summarize prompt', () => {
    const p = buildPromptText('summarize', sampleText);
    expect(p).toContain('Summarize the following content');
    expect(p).toContain(sampleText);
  });

  it('builds fix_grammar prompt', () => {
    const p = buildPromptText('fix_grammar', 'He dont know nothing.');
    expect(p).toContain('Fix all grammar, spelling, punctuation');
    expect(p).toContain('He dont know nothing.');
  });

  it('builds translate prompt', () => {
    const p = buildPromptText('translate', 'Hola como estas');
    expect(p).toContain('Translate the following text');
    expect(p).toContain('Hola como estas');
  });

  it('builds draft_reply prompt', () => {
    const p = buildPromptText('draft_reply', 'Can you meet tomorrow at 10am?');
    expect(p).toContain('Draft a thoughtful, concise, and helpful reply');
    expect(p).toContain('Can you meet tomorrow at 10am?');
  });

  it('builds tone_formal and tone_casual prompts', () => {
    const formal = buildPromptText('tone_formal', 'hey what is up');
    expect(formal).toContain('formal tone');
    const casual = buildPromptText('tone_casual', 'Dear Sir or Madam');
    expect(casual).toContain('Casual Version:');
  });

  it('builds custom prompt when provided', () => {
    const custom = buildPromptText('custom', sampleText, 'Write a haiku about this:');
    expect(custom).toContain('Write a haiku about this:');
    expect(custom).toContain(sampleText);
  });

  it('has a strict offline instruction system prompt', () => {
    expect(SHARE_SYSTEM_PROMPT).toContain('on-device text processing assistant');
    expect(SHARE_SYSTEM_PROMPT).toContain('without conversational preamble');
  });
});
