jest.mock('llama.rn', () => ({
  loadLlamaModelInfo: jest.fn(),
}));

import {
  detectQuantFromFilename,
  isQuantAllowedForAndroidAccel,
} from '../../src/services/modelInfoService';

describe('isQuantAllowedForAndroidAccel', () => {
  it('allows only Q4_0 and Q6_K', () => {
    expect(isQuantAllowedForAndroidAccel('Q4_0')).toBe(true);
    expect(isQuantAllowedForAndroidAccel('q6_k')).toBe(true);
    expect(isQuantAllowedForAndroidAccel('Q4_K_M')).toBe(false);
    expect(isQuantAllowedForAndroidAccel('Q8_0')).toBe(false);
    expect(isQuantAllowedForAndroidAccel(null)).toBe(false);
    expect(isQuantAllowedForAndroidAccel(undefined)).toBe(false);
  });
});

describe('detectQuantFromFilename', () => {
  it('prefers K-quant suffixes before bare _K', () => {
    expect(detectQuantFromFilename('model-Q4_K_M.gguf')).toBe('Q4_K_M');
    expect(detectQuantFromFilename('model-q6_k.gguf')).toBe('Q6_K');
    expect(detectQuantFromFilename('model-Q4_0.gguf')).toBe('Q4_0');
  });
});
