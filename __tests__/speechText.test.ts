import {
  prepareSpeechText,
  SPEECH_MAX_CHARS,
} from '../src/utils/speechText';

describe('prepareSpeechText', () => {
  it('strips think blocks and leaves the final answer', () => {
    const out = prepareSpeechText(
      '<think>internal monologue</think>\nThe capital is Paris.',
    );
    expect(out).toBe('The capital is Paris.');
    expect(out).not.toMatch(/think|monologue/i);
  });

  it('soft-strips markdown so speech is readable', () => {
    const out = prepareSpeechText(
      '## Title\n\nUse **bold** and [docs](https://example.com).\n\n```\ncode\n```\nDone.',
    );
    expect(out).toContain('Title');
    expect(out).toContain('bold');
    expect(out).toContain('docs');
    expect(out).not.toContain('```');
    expect(out).not.toContain('https://');
    expect(out).toContain('Done.');
  });

  it('returns empty for think-only messages', () => {
    expect(prepareSpeechText('<think>only thinking</think>')).toBe('');
    expect(prepareSpeechText('   ')).toBe('');
  });

  it('caps very long answers', () => {
    const long = 'word '.repeat(SPEECH_MAX_CHARS);
    const out = prepareSpeechText(long);
    expect(out.length).toBeLessThanOrEqual(SPEECH_MAX_CHARS);
  });
});
