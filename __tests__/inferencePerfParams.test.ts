jest.mock('../src/services/deviceEnv', () => ({
  isAndroidEmulator: jest.fn(() => false),
}));

import { isAndroidEmulator } from '../src/services/deviceEnv';
import {
  getInferencePerfParams,
  LOW_RAM_TOTAL_BYTES,
  selectKvCacheType,
} from '../src/services/inferencePerfParams';

const GB = 1024 ** 3;

describe('selectKvCacheType', () => {
  it('uses q4_0 at or below 6GB total RAM', () => {
    expect(selectKvCacheType(6 * GB)).toBe('q4_0');
    expect(selectKvCacheType(4 * GB)).toBe('q4_0');
    expect(selectKvCacheType(LOW_RAM_TOTAL_BYTES)).toBe('q4_0');
  });

  it('uses q8_0 above 6GB or when RAM unknown', () => {
    expect(selectKvCacheType(6 * GB + 1)).toBe('q8_0');
    expect(selectKvCacheType(8 * GB)).toBe('q8_0');
    expect(selectKvCacheType(null)).toBe('q8_0');
    expect(selectKvCacheType(undefined)).toBe('q8_0');
    expect(selectKvCacheType(0)).toBe('q8_0');
  });
});

describe('getInferencePerfParams', () => {
  beforeEach(() => {
    (isAndroidEmulator as jest.Mock).mockReturnValue(false);
  });

  it('sets cache_type_k/v q8_0 on real devices with ample RAM', () => {
    const p = getInferencePerfParams(8, { totalMemoryBytes: 8 * GB });
    expect(p.cache_type_k).toBe('q8_0');
    expect(p.cache_type_v).toBe('q8_0');
  });

  it('defaults to q8_0 when totalMemoryBytes omitted (compat)', () => {
    const p = getInferencePerfParams(8);
    expect(p.cache_type_k).toBe('q8_0');
    expect(p.cache_type_v).toBe('q8_0');
  });

  it('falls back to q4_0 on ≤6GB devices', () => {
    const p = getInferencePerfParams(8, { totalMemoryBytes: 6 * GB });
    expect(p.cache_type_k).toBe('q4_0');
    expect(p.cache_type_v).toBe('q4_0');
  });

  it('omits KV quant on emulator', () => {
    (isAndroidEmulator as jest.Mock).mockReturnValue(true);
    const p = getInferencePerfParams(8, {
      isEmulator: true,
      totalMemoryBytes: 4 * GB,
    });
    expect(p.cache_type_k).toBeUndefined();
    expect(p.cache_type_v).toBeUndefined();
    expect(p.flash_attn_type).toBe('off');
  });

  it('still sets KV quant on CPU-only real devices', () => {
    const p = getInferencePerfParams(0, { totalMemoryBytes: 8 * GB });
    expect(p.cache_type_k).toBe('q8_0');
    expect(p.cache_type_v).toBe('q8_0');
    expect(p.flash_attn_type).toBe('off');
  });
});
