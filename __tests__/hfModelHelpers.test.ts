jest.mock('../src/services/hfTokenService', () => ({
  hfAxiosGet: jest.fn(),
}));

import {
  buildHfResolveUrl,
  buildQuantOptions,
  filterMobileFriendlyGgufs,
  parseHuggingFaceUrl,
  pickPreferredGgufFile,
  resolveHfDownloadUrl,
} from '../src/services/hfModelHelpers';
import { hfAxiosGet } from '../src/services/hfTokenService';
import { clearModelCaches } from '../src/utils/modelUtils';

const mockedHfGet = hfAxiosGet as jest.MockedFunction<typeof hfAxiosGet>;

beforeEach(() => {
  clearModelCaches();
  mockedHfGet.mockReset();
});

describe('parseHuggingFaceUrl', () => {
  it('parses repo-only URLs', () => {
    expect(parseHuggingFaceUrl('https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF')).toEqual({
      repoId: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
      fileName: undefined,
      revision: undefined,
    });
  });

  it('parses resolve URLs with revision and file', () => {
    expect(
      parseHuggingFaceUrl(
        'https://huggingface.co/unsloth/Llama-3.2-1B-Instruct-GGUF/resolve/master/Llama-3.2-1B-Instruct-Q4_0.gguf',
      ),
    ).toEqual({
      repoId: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
      revision: 'master',
      fileName: 'Llama-3.2-1B-Instruct-Q4_0.gguf',
    });
  });

  it('rejects non-HF URLs', () => {
    expect(parseHuggingFaceUrl('https://example.com/a/b')).toBeNull();
  });
});

describe('pickPreferredGgufFile', () => {
  it('prefers Q4_0 over Q4_K_M for Accel', () => {
    const pick = pickPreferredGgufFile([
      { rfilename: 'model-Q4_K_M.gguf', size: 2 },
      { rfilename: 'model-Q4_0.gguf', size: 1 },
      { rfilename: 'model-Q5_K_M.gguf', size: 3 },
    ]);
    expect(pick?.rfilename).toBe('model-Q4_0.gguf');
  });

  it('falls back to Q6_K then Q4_K_M', () => {
    expect(
      pickPreferredGgufFile([
        { rfilename: 'model-Q4_K_M.gguf' },
        { rfilename: 'model-Q6_K.gguf' },
      ])?.rfilename,
    ).toBe('model-Q6_K.gguf');
  });
});

describe('buildQuantOptions', () => {
  it('extracts full K-quant labels (not truncated Q4_K)', () => {
    const opts = buildQuantOptions([
      { rfilename: 'foo-Q4_K_M.gguf', size: 10 },
      { rfilename: 'foo-Q4_0.gguf', size: 8 },
    ]);
    expect(opts.map((o) => o.quantization)).toEqual(['Q4_0', 'Q4_K_M']);
  });
});

describe('filterMobileFriendlyGgufs', () => {
  it('keeps Accel and mobile quants', () => {
    const filtered = filterMobileFriendlyGgufs([
      { rfilename: 'a-Q4_0.gguf' },
      { rfilename: 'b-F16.gguf' },
      { rfilename: 'c-Q6_K.gguf' },
    ]);
    expect(filtered.map((f) => f.rfilename)).toEqual(['a-Q4_0.gguf', 'c-Q6_K.gguf']);
  });
});

describe('buildHfResolveUrl / resolveHfDownloadUrl', () => {
  it('builds resolve URLs with revision', () => {
    expect(buildHfResolveUrl('org/model', 'file.gguf', 'abc123')).toBe(
      'https://huggingface.co/org/model/resolve/abc123/file.gguf',
    );
  });

  it('uses API sha when revision omitted', async () => {
    mockedHfGet.mockResolvedValue({
      status: 200,
      data: { sha: 'deadbeef' },
    } as any);
    await expect(resolveHfDownloadUrl('org/model', 'file.gguf')).resolves.toBe(
      'https://huggingface.co/org/model/resolve/deadbeef/file.gguf',
    );
  });

  it('falls back to main when API has no sha', async () => {
    mockedHfGet.mockResolvedValue({
      status: 200,
      data: {},
    } as any);
    await expect(resolveHfDownloadUrl('org/model', 'file.gguf')).resolves.toBe(
      'https://huggingface.co/org/model/resolve/main/file.gguf',
    );
  });
});
