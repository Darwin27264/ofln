import {
  modelFileNameFromPath,
  shouldRehydrateSelectionFromProvider,
} from '../src/utils/modelSelectionRehydrate';

describe('modelFileNameFromPath', () => {
  it('extracts basename from absolute and file:// paths', () => {
    expect(modelFileNameFromPath('/data/user/0/com.ofln/files/Qwen.gguf')).toBe('Qwen.gguf');
    expect(modelFileNameFromPath('file:///data/Qwen3.5-0.8B-Q4_0.gguf')).toBe(
      'Qwen3.5-0.8B-Q4_0.gguf',
    );
  });

  it('rejects missing or non-gguf paths', () => {
    expect(modelFileNameFromPath(null)).toBeNull();
    expect(modelFileNameFromPath('/tmp/model.bin')).toBeNull();
  });
});

describe('shouldRehydrateSelectionFromProvider', () => {
  const ready = {
    ready: true,
    modelPath: '/files/A.gguf',
    hasNativeContext: true,
  };

  it('rehydrates only when UI selection is empty and provider is live', () => {
    expect(shouldRehydrateSelectionFromProvider(ready, null)).toEqual({
      rehydrate: true,
      fileName: 'A.gguf',
    });
    expect(shouldRehydrateSelectionFromProvider(ready, 'B.gguf')).toEqual({
      rehydrate: false,
    });
  });

  it('does not rehydrate when provider is not ready or context is missing', () => {
    expect(
      shouldRehydrateSelectionFromProvider(
        { ready: false, modelPath: '/files/A.gguf', hasNativeContext: true },
        null,
      ),
    ).toEqual({ rehydrate: false });
    expect(
      shouldRehydrateSelectionFromProvider(
        { ready: true, modelPath: '/files/A.gguf', hasNativeContext: false },
        null,
      ),
    ).toEqual({ rehydrate: false });
  });
});
