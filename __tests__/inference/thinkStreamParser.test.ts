import {
  finalizeVisibleAndThought,
  buildStopSequences,
} from '../../src/services/inference/thinkStreamParser';

describe('buildStopSequences', () => {
  it('includes CoT cutoffs only for simple prompts', () => {
    expect(buildStopSequences(false)).not.toContain('<think>');
    expect(buildStopSequences(true)).toEqual(
      expect.arrayContaining(['<think>', 'Thinking Process:']),
    );
  });
});

describe('finalizeVisibleAndThought', () => {
  it('strips closed think tags from visible content', () => {
    const result = finalizeVisibleAndThought(
      '<think>private plan</think>\nThe capital is Paris.',
      '',
      true,
    );

    expect(result.visibleContent).toBe('The capital is Paris.');
    expect(result.thought).toMatch(/private plan/i);
  });

  it('drops incomplete think blocks from the visible answer', () => {
    const result = finalizeVisibleAndThought(
      'Hello <think>still thinking about this',
      '',
      true,
    );

    expect(result.visibleContent).toBe('Hello');
    expect(result.thought).toMatch(/still thinking/i);
  });

  it('trims degenerate phrase loops in the visible answer', () => {
    const result = finalizeVisibleAndThought(
      'The number of the number of the number of the number of items is five.',
      '',
      false,
    );

    expect(result.visibleContent.toLowerCase()).toContain('the number');
    expect(result.visibleContent.match(/the number/gi)?.length).toBe(1);
  });
});
