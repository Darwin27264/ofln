jest.mock('../src/components/CustomAlert', () => ({
  showAlert: jest.fn(),
}));

jest.mock('../src/services/modelSettingsService', () => ({
  SETTING_RANGES: {
    n_ctx: { values: [512, 1024, 2048, 4096, 8192] },
  },
  snapNCtx: (v: number) => {
    const values = [512, 1024, 2048, 4096, 8192];
    let best = values[0];
    let bestDist = Math.abs(v - best);
    for (const x of values) {
      const d = Math.abs(v - x);
      if (d < bestDist) {
        best = x;
        bestDist = d;
      }
    }
    return best;
  },
  getModelSettings: jest.fn(),
  saveModelSettings: jest.fn(),
}));

import { showAlert } from '../src/components/CustomAlert';
import {
  getModelSettings,
  saveModelSettings,
} from '../src/services/modelSettingsService';
import {
  lowerModelContextOneStep,
  showLoadFailureAlert,
} from '../src/utils/loadFailureAlert';

describe('lowerModelContextOneStep', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('steps n_ctx down one notch', async () => {
    (getModelSettings as jest.Mock).mockResolvedValueOnce({
      systemPrompt: '',
      n_ctx: 2048,
      n_gpu_layers: 0,
      temperature: 0.8,
      top_p: 0.95,
      top_k: 20,
      repeat_penalty: 1.1,
      n_predict: 256,
    });
    (saveModelSettings as jest.Mock).mockResolvedValueOnce(undefined);

    const result = await lowerModelContextOneStep('model.gguf');
    expect(result).toEqual({ ok: true, n_ctx: 1024 });
    expect(saveModelSettings).toHaveBeenCalledWith(
      'model.gguf',
      expect.objectContaining({ n_ctx: 1024 }),
    );
  });

  it('reports already_min at 512', async () => {
    (getModelSettings as jest.Mock).mockResolvedValueOnce({
      systemPrompt: '',
      n_ctx: 512,
      n_gpu_layers: 0,
      temperature: 0.8,
      top_p: 0.95,
      top_k: 20,
      repeat_penalty: 1.1,
      n_predict: 256,
    });

    const result = await lowerModelContextOneStep('model.gguf');
    expect(result).toEqual({ ok: false, reason: 'already_min' });
    expect(saveModelSettings).not.toHaveBeenCalled();
  });
});

describe('showLoadFailureAlert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('offers Lower context + Models + Retry for OOM', () => {
    const onRetry = jest.fn();
    const onModels = jest.fn();
    showLoadFailureAlert(
      {
        kind: 'oom',
        title: 'Not enough memory',
        message: 'Try a smaller GGUF',
      },
      { onRetry, onModels, modelFileName: 'x.gguf' },
    );

    expect(showAlert).toHaveBeenCalled();
    const buttons = (showAlert as jest.Mock).mock.calls[0][2] as Array<{ text: string }>;
    const labels = buttons.map((b) => b.text);
    expect(labels).toContain('Lower context');
    expect(labels).toContain('Models');
    expect(labels).toContain('Retry');
  });

  it('offers Retry as primary for generic_load', () => {
    showLoadFailureAlert(
      {
        kind: 'generic_load',
        title: "Couldn't load model",
        message: 'Try again',
      },
      { onRetry: jest.fn(), onModels: jest.fn() },
    );
    const buttons = (showAlert as jest.Mock).mock.calls[0][2] as Array<{
      text: string;
      style?: string;
    }>;
    expect(buttons[0].text).toBe('Retry');
    expect(buttons[0].style).toBeUndefined();
  });
});
