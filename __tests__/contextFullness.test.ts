import {
  CONTEXT_FULLNESS_THRESHOLD,
  estimateContextFullness,
  estimateConversationTokens,
  estimateTokensFromChars,
  shouldShowContextFullnessBanner,
} from '../src/utils/contextFullness';

describe('estimateTokensFromChars', () => {
  it('uses ~3.5 chars per token', () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(7)).toBe(2);
    expect(estimateTokensFromChars(350)).toBe(100);
  });
});

describe('estimateConversationTokens', () => {
  it('counts content and thought', () => {
    const tokens = estimateConversationTokens([
      { role: 'user', content: 'x'.repeat(35) },
      { role: 'assistant', content: 'y'.repeat(35), thought: 'z'.repeat(35) },
    ]);
    expect(tokens).toBeGreaterThan(20);
  });
});

describe('estimateContextFullness', () => {
  it('flags high when at or above threshold', () => {
    // Fill ~85% of 1000-token window with chars (minus overhead still high)
    const content = 'a'.repeat(Math.floor(1000 * 0.85 * 3.5));
    const r = estimateContextFullness([{ role: 'user', content }], 1000);
    expect(r.isHigh).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(CONTEXT_FULLNESS_THRESHOLD);
    expect(r.percent).toBeGreaterThanOrEqual(80);
  });

  it('is not high for short chats', () => {
    const r = estimateContextFullness(
      [
        { role: 'system', content: 'hi' },
        { role: 'user', content: 'hello' },
      ],
      2048,
    );
    expect(r.isHigh).toBe(false);
    expect(r.percent).toBeLessThan(80);
  });

  it('handles invalid n_ctx safely', () => {
    const r = estimateContextFullness([{ role: 'user', content: 'x'.repeat(1000) }], 0);
    expect(r.isHigh).toBe(false);
    expect(r.ratio).toBe(0);
  });
});

describe('shouldShowContextFullnessBanner', () => {
  it('requires high + active chat + not dismissed', () => {
    expect(
      shouldShowContextFullnessBanner({
        isHigh: true,
        dismissed: false,
        hasUserMessages: true,
      }),
    ).toBe(true);
    expect(
      shouldShowContextFullnessBanner({
        isHigh: true,
        dismissed: true,
        hasUserMessages: true,
      }),
    ).toBe(false);
    expect(
      shouldShowContextFullnessBanner({
        isHigh: true,
        dismissed: false,
        hasUserMessages: false,
      }),
    ).toBe(false);
  });
});
