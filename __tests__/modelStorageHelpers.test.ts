import {
  isFinalGgufFileName,
  safeModelFileName,
  sortStoredModelsBySizeDesc,
  storedModelsFromDirEntries,
  sumStoredModelBytes,
} from '../src/utils/modelStorageHelpers';

describe('isFinalGgufFileName', () => {
  it('accepts final models only', () => {
    expect(isFinalGgufFileName('Qwen.gguf')).toBe(true);
    expect(isFinalGgufFileName('model.GGUF')).toBe(true);
    expect(isFinalGgufFileName('model.gguf.partial')).toBe(false);
    expect(isFinalGgufFileName('model.partial')).toBe(false);
    expect(isFinalGgufFileName('model.gguf.chunk')).toBe(false);
    expect(isFinalGgufFileName('notes.txt')).toBe(false);
  });
});

describe('safeModelFileName', () => {
  it('strips path segments and rejects traversal / partials', () => {
    expect(safeModelFileName('a.gguf')).toBe('a.gguf');
    expect(safeModelFileName('/data/files/a.gguf')).toBe('a.gguf');
    // Leading path is discarded — delete only targets basename in DocumentDirectory.
    expect(safeModelFileName('../a.gguf')).toBe('a.gguf');
    expect(safeModelFileName('..')).toBeNull();
    expect(safeModelFileName('a.gguf.partial')).toBeNull();
  });
});

describe('storedModelsFromDirEntries', () => {
  it('filters and sorts by size desc', () => {
    const entries = [
      { name: 'small.gguf', path: '/s', size: 100, isFile: () => true },
      { name: 'big.gguf', path: '/b', size: 900, isFile: () => true },
      { name: 'mid.gguf.partial', path: '/p', size: 5000, isFile: () => true },
      { name: 'dir', path: '/d', size: 0, isFile: () => false },
    ];
    const models = storedModelsFromDirEntries(entries);
    expect(models.map((m) => m.fileName)).toEqual(['big.gguf', 'small.gguf']);
    expect(sumStoredModelBytes(models)).toBe(1000);
  });
});

describe('sortStoredModelsBySizeDesc', () => {
  it('breaks ties by name', () => {
    const sorted = sortStoredModelsBySizeDesc([
      { fileName: 'b.gguf', path: '/b', sizeBytes: 10 },
      { fileName: 'a.gguf', path: '/a', sizeBytes: 10 },
    ]);
    expect(sorted.map((m) => m.fileName)).toEqual(['a.gguf', 'b.gguf']);
  });
});
