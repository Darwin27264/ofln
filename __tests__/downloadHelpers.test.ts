jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(),
  stat: jest.fn(),
  unlink: jest.fn(),
  moveFile: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    config: jest.fn(() => ({
      fetch: jest.fn(),
    })),
  },
}));

jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly' },
  setGenericPassword: jest.fn(),
  getGenericPassword: jest.fn(),
  resetGenericPassword: jest.fn(),
}));

import {
  getModelDestPath,
  getPartialPath,
  isPartialFileName,
  normalizeModelFileName,
  sizesMatch,
} from '../src/api/model';

describe('normalizeModelFileName', () => {
  it('appends .gguf when missing', () => {
    expect(normalizeModelFileName('model')).toBe('model.gguf');
    expect(normalizeModelFileName('model.GGUF')).toBe('model.GGUF');
    expect(normalizeModelFileName('model.gguf')).toBe('model.gguf');
  });
});

describe('partial path helpers', () => {
  it('builds dest and .partial paths', () => {
    expect(getModelDestPath('foo.gguf')).toBe('/mock/docs/foo.gguf');
    expect(getPartialPath('/mock/docs/foo.gguf')).toBe('/mock/docs/foo.gguf.partial');
  });

  it('detects partial file names', () => {
    expect(isPartialFileName('foo.gguf.partial')).toBe(true);
    expect(isPartialFileName('foo.gguf')).toBe(false);
    expect(isPartialFileName('FOO.GGUF.PARTIAL')).toBe(true);
  });
});

describe('sizesMatch (S07)', () => {
  it('passes when expected is missing or zero', () => {
    expect(sizesMatch(100, null)).toBe(true);
    expect(sizesMatch(100, undefined)).toBe(true);
    expect(sizesMatch(100, 0)).toBe(true);
  });

  it('allows 64KB absolute tolerance', () => {
    const expected = 1_000_000;
    expect(sizesMatch(expected, expected)).toBe(true);
    expect(sizesMatch(expected + 64 * 1024, expected)).toBe(true);
    expect(sizesMatch(expected - 64 * 1024, expected)).toBe(true);
    expect(sizesMatch(expected + 64 * 1024 + 1, expected)).toBe(false);
  });

  it('allows 5% relative tolerance for large GGUFs', () => {
    const expected = 2_000_000_000;
    expect(sizesMatch(expected * 0.96, expected)).toBe(true);
    expect(sizesMatch(expected * 1.04, expected)).toBe(true);
    expect(sizesMatch(expected * 0.9, expected)).toBe(false);
  });
});
