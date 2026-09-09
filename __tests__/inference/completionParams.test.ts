import { buildCompletionParams } from '../../src/services/inference/completionParams';
import { resolveThinkingModeForTurn } from '../../src/services/inference/promptHeuristics';

const baseSettings = {
  temperature: 0.65,
  n_predict: 256,
  repeat_penalty: 1.2,
  top_p: 0.9,
  top_k: 40,
};

const SIMPLE = 'hi';
const COMPLEX =
  'Solve step by step: integrate x^2 from 0 to 1 and show the proof';

describe('resolveThinkingModeForTurn', () => {
  it('auto defers to heuristic for jinja_enable', () => {
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'auto',
        strategy: 'jinja_enable',
        userText: SIMPLE,
      }),
    ).toBe(false);
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'auto',
        strategy: 'jinja_enable',
        userText: COMPLEX,
      }),
    ).toBe(true);
  });

  it('on forces true only for jinja_enable', () => {
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'on',
        strategy: 'jinja_enable',
        userText: SIMPLE,
      }),
    ).toBe(true);
    // always_on: On is a no-op vs Auto — omit enable_thinking
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'on',
        strategy: 'always_on',
        userText: SIMPLE,
      }),
    ).toBeUndefined();
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'on',
        strategy: 'none',
        userText: SIMPLE,
      }),
    ).toBeUndefined();
  });

  it('off forces false only for jinja_enable', () => {
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'off',
        strategy: 'jinja_enable',
        userText: COMPLEX,
      }),
    ).toBe(false);
    // always_on stream parsing must not be stripped via this flag
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'off',
        strategy: 'always_on',
        userText: COMPLEX,
      }),
    ).toBeUndefined();
  });

  it('preferNoThinking forces Auto off for jinja_enable', () => {
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'auto',
        strategy: 'jinja_enable',
        userText: COMPLEX,
        preferNoThinking: true,
      }),
    ).toBe(false);
    expect(
      resolveThinkingModeForTurn({
        thinkingMode: 'on',
        strategy: 'jinja_enable',
        userText: SIMPLE,
        preferNoThinking: true,
      }),
    ).toBe(true);
  });

  it('missing thinkingMode defaults to auto', () => {
    expect(
      resolveThinkingModeForTurn({
        strategy: 'jinja_enable',
        userText: SIMPLE,
      }),
    ).toBe(false);
  });
});

describe('buildCompletionParams', () => {
  it('adds simple-prompt stop extras for short asks', () => {
    const params = buildCompletionParams({
      userText: SIMPLE,
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

  it('Auto matches pre-S20: no thinking on simple Qwen prompts', () => {
    const params = buildCompletionParams({
      userText: SIMPLE,
      modelName: 'Qwen3.5-0.8B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, thinkingMode: 'auto' },
    });
    expect(params.enable_thinking).toBe(false);
  });

  it('On forces enable_thinking even on simple Qwen prompts', () => {
    const params = buildCompletionParams({
      userText: SIMPLE,
      modelName: 'Qwen3.5-4B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, thinkingMode: 'on' },
    });
    expect(params.enable_thinking).toBe(true);
  });

  it('Off forces enable_thinking false on complex Qwen prompts', () => {
    const params = buildCompletionParams({
      userText: COMPLEX,
      modelName: 'Qwen3.5-4B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, thinkingMode: 'off' },
    });
    expect(params.enable_thinking).toBe(false);
  });

  it('omits enable_thinking for always_on families (On is no-op)', () => {
    const autoParams = buildCompletionParams({
      userText: COMPLEX,
      modelName: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
      settings: { ...baseSettings, thinkingMode: 'auto' },
    });
    const onParams = buildCompletionParams({
      userText: COMPLEX,
      modelName: 'DeepSeek-R1-Distill-Qwen-1.5B-Q4_K_M.gguf',
      settings: { ...baseSettings, thinkingMode: 'on' },
    });
    expect(autoParams.enable_thinking).toBeUndefined();
    expect(onParams.enable_thinking).toBeUndefined();
    expect(autoParams.reasoning_format).toBe('auto');
    expect(onParams.reasoning_format).toBe('auto');
  });

  it('omits enable_thinking for none strategy (Gemma/Phi)', () => {
    const params = buildCompletionParams({
      userText: COMPLEX,
      modelName: 'gemma-4-E2B-it-Q4_0.gguf',
      settings: { ...baseSettings, thinkingMode: 'on' },
    });
    expect(params.enable_thinking).toBeUndefined();
  });

  it('caps tiny Qwen thinking budget at 384', () => {
    const params = buildCompletionParams({
      userText: COMPLEX,
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
      userText: COMPLEX,
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

  it('debate mode honors n_predict and prefers Auto thinking off', () => {
    const shortTopic = 'Meaning of life is to suffer';
    const priorSpeaker =
      'That is a bold claim, but it does not hold up under scrutiny. '.repeat(8);

    const fromTopic = buildCompletionParams({
      userText: shortTopic,
      modelName: 'Qwen3.5-0.8B-Instruct-Q4_0.gguf',
      settings: {
        ...baseSettings,
        n_predict: 384,
        thinkingMode: 'auto',
      },
      heuristicMode: 'debate',
    });
    expect(fromTopic.enable_thinking).toBe(false);
    expect(fromTopic.n_predict).toBe(384);
    expect(fromTopic.stop).toEqual(
      expect.arrayContaining(['<think>', 'Thinking Process:']),
    );

    // Even if a caller mistakenly passed the prior assistant as userText,
    // debate Auto still prefers thinking off.
    const fromPrior = buildCompletionParams({
      userText: priorSpeaker,
      modelName: 'Qwen3.5-0.8B-Instruct-Q4_0.gguf',
      settings: {
        ...baseSettings,
        n_predict: 384,
        thinkingMode: 'auto',
      },
      heuristicMode: 'debate',
    });
    expect(fromPrior.enable_thinking).toBe(false);
    expect(fromPrior.n_predict).toBe(384);
  });

  it('debate mode still honors explicit thinking On', () => {
    const params = buildCompletionParams({
      userText: 'hi',
      modelName: 'Qwen3.5-4B-Instruct-Q4_0.gguf',
      settings: { ...baseSettings, n_predict: 384, thinkingMode: 'on' },
      heuristicMode: 'debate',
    });
    expect(params.enable_thinking).toBe(true);
    expect(params.n_predict).toBe(512);
  });
});
