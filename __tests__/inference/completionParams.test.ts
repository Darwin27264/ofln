import { buildCompletionParams } from '../../src/services/inference/completionParams';

const baseSettings = {
  temperature: 0.65,
  n_predict: 256,
  repeat_penalty: 1.2,
  top_p: 0.9,
  top_k: 40,
};

describe('buildCompletionParams', () => {
  it('adds simple-prompt stop extras for short asks', () => {
    const params = buildCompletionParams({
      userText: 'hi',
      modelName: 'Qwen3.5-4B-Instruct-Q4_0.gguf',
      settings: baseSettings,
    });

    expect(params.simple).toBe(true);
    expect(params.enable_thinking).toBe(false);
    expect(params.stop).toEqual(
      expect.arrayContaining(['<think>', 'Thinking Process:']),
    );
    expect(params.n_predict).toBe(96);
  });

  it('caps tiny Qwen thinking budget at 384', () => {
    const params = buildCompletionParams({
      userText: 'Solve step by step: integrate x^2 from 0 to 1 and show the proof',
      modelName: 'Qwen3.5-0.8B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, n_predict: 1024 },
    });

    expect(params.enable_thinking).toBe(true);
    expect(params.n_predict).toBe(384);
    expect(params.penalty_present).toBe(1.5);
    expect(params.reasoning_format).toBe('auto');
  });

  it('does not apply tiny-Qwen cap on larger Qwen thinking turns', () => {
    const params = buildCompletionParams({
      userText: 'Solve step by step: integrate x^2 from 0 to 1 and show the proof',
      modelName: 'Qwen3.5-4B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, n_predict: 1024 },
    });

    expect(params.enable_thinking).toBe(true);
    expect(params.n_predict).toBe(1024);
    expect(params.penalty_present).toBe(1.25);
  });

  it('keeps base stops (no CoT extras) for complex non-simple prompts', () => {
    const params = buildCompletionParams({
      userText: 'Explain how a binary search tree balances itself during insertions',
      modelName: 'Phi-4-mini-instruct-Q4_0.gguf',
      settings: baseSettings,
    });

    expect(params.simple).toBe(false);
    expect(params.stop).not.toEqual(
      expect.arrayContaining(['<think>', 'Thinking Process:']),
    );
    expect(params.stop).toEqual(expect.arrayContaining(['</s>', '<|im_end|>']));
  });
});
