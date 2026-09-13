jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 6 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 2 * 1024 ** 3),
  },
}));

import {
  bucketForDeviceRam,
  classifyRamFit,
  classifyRamFitFromSize,
  estimateKvCacheBytes,
  explainRamFit,
  pickLargestNCtxThatFits,
  preflightLoadRam,
  suggestNCtxForRam,
  RAM_FIT_LABELS,
  __resetRamFitCacheForTests,
} from '../src/services/ramFitService';
import DeviceInfo from 'react-native-device-info';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

beforeEach(() => {
  __resetRamFitCacheForTests();
});

describe('bucketForDeviceRam', () => {
  it('picks higher buckets as device RAM grows', () => {
    expect(bucketForDeviceRam(2 * GB).fitsMaxFile).toBeLessThan(
      bucketForDeviceRam(4 * GB).fitsMaxFile,
    );
    expect(bucketForDeviceRam(8 * GB).tightMaxFile).toBeGreaterThan(
      bucketForDeviceRam(4 * GB).tightMaxFile,
    );
  });
});

describe('classifyRamFit', () => {
  it('marks small files as Fits on mid-range phones', () => {
    expect(classifyRamFit(0.51 * GB, 6 * GB)).toBe('fits');
  });

  it('marks large files as Tight or Won’t fit', () => {
    const tier4b = classifyRamFit(2.41 * GB, 4 * GB);
    expect(['tight', 'wont_fit']).toContain(tier4b);
    expect(classifyRamFit(3 * GB, 3 * GB)).toBe('wont_fit');
  });

  it('is conservative on low-RAM / emulator-like devices', () => {
    expect(classifyRamFit(1.13 * GB, 2 * GB)).toBe('wont_fit');
    expect(classifyRamFit(0.51 * GB, 2 * GB)).toBe('fits');
  });
});

describe('classifyRamFitFromSize', () => {
  it('parses display sizes and returns labels', () => {
    const r = classifyRamFitFromSize('0.51 GB', 6 * GB);
    expect(r?.tier).toBe('fits');
    expect(r?.label).toBe(RAM_FIT_LABELS.fits);
  });

  it('returns null when size or RAM unknown', () => {
    expect(classifyRamFitFromSize(undefined, 6 * GB)).toBeNull();
    expect(classifyRamFitFromSize('1 GB', null)).toBeNull();
  });
});

describe('explainRamFit', () => {
  it('includes rating, file size, and device RAM', () => {
    const r = classifyRamFitFromSize('2.41 GB', 4 * GB)!;
    const { title, message } = explainRamFit(r);
    expect(title).toMatch(/RAM fit:/);
    expect(message).toMatch(/2\.4/);
    expect(message).toMatch(/4(\.0)? GB/);
    expect(message.toLowerCase()).toMatch(/tight|won.?t fit|fits/);
  });
});

describe('estimateKvCacheBytes', () => {
  it('scales with n_ctx', () => {
    expect(estimateKvCacheBytes(4096)).toBeGreaterThan(estimateKvCacheBytes(2048));
  });

  it('estimates less KV for q4_0 than q8_0', () => {
    const q8 = estimateKvCacheBytes(2048, { cacheType: 'q8_0' });
    const q4 = estimateKvCacheBytes(2048, { cacheType: 'q4_0' });
    expect(q4).toBeLessThan(q8);
    expect(q4).toBe(Math.floor(q8 * 0.5));
  });
});

describe('pickLargestNCtxThatFits', () => {
  it('returns requested ladder value when RAM is ample', () => {
    expect(
      pickLargestNCtxThatFits({
        availableBytes: 8 * GB,
        modelBytes: 0.5 * GB,
        requestedNCtx: 4096,
        cacheType: 'q8_0',
      }),
    ).toBe(4096);
  });

  it('never exceeds requested n_ctx', () => {
    expect(
      pickLargestNCtxThatFits({
        availableBytes: 16 * GB,
        modelBytes: 0.1 * GB,
        requestedNCtx: 1024,
      }),
    ).toBe(1024);
  });

  it('steps down the ladder when KV would not fit', () => {
    // Tight budget: force smaller than 8192.
    const n = pickLargestNCtxThatFits({
      availableBytes: 1.2 * GB,
      modelBytes: 0.4 * GB,
      requestedNCtx: 8192,
      cacheType: 'q8_0',
    });
    expect(n).toBeLessThan(8192);
    expect([512, 1024, 2048, 4096]).toContain(n);
  });

  it('returns 512 when nothing larger fits', () => {
    expect(
      pickLargestNCtxThatFits({
        availableBytes: 100 * MB,
        modelBytes: 90 * MB,
        requestedNCtx: 2048,
      }),
    ).toBe(512);
  });
});

describe('suggestNCtxForRam', () => {
  it('clamps using available = total − used from DeviceInfo mock', async () => {
    // Mock: total 6GB, used 2GB → available 4GB
    const n = await suggestNCtxForRam({
      modelBytes: 0.5 * GB,
      requestedNCtx: 8192,
      cacheType: 'q8_0',
    });
    expect(n).toBeGreaterThanOrEqual(512);
    expect(n).toBeLessThanOrEqual(8192);
    expect([512, 1024, 2048, 4096, 8192]).toContain(n);
  });

  it('snaps to ladder when available RAM is unknown', async () => {
    (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValueOnce(0);
    __resetRamFitCacheForTests();
    try {
      const n = await suggestNCtxForRam({
        modelBytes: 1 * GB,
        requestedNCtx: 3000,
      });
      expect(n).toBe(2048);
    } finally {
      (DeviceInfo.getTotalMemory as jest.Mock).mockResolvedValue(6 * GB);
      __resetRamFitCacheForTests();
    }
  });
});

describe('preflightLoadRam', () => {
  it('passes when free RAM exceeds model + KV + 500MB', async () => {
    const r = await preflightLoadRam({ modelBytes: 0.5 * GB, nCtx: 2048 });
    expect(r.ok).toBe(true);
    expect(r.headroomBytes).toBe(500 * MB);
  });

  it('fails when model + KV + headroom exceeds available', async () => {
    const r = await preflightLoadRam({ modelBytes: 3.5 * GB, nCtx: 8192 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/insufficient_ram/);
  });

  it('is more permissive with q4_0 KV than q8_0 for the same budget', async () => {
    // Use a tight-ish model so q8 may fail while q4 passes (or q4 requires less).
    const q8 = await preflightLoadRam({
      modelBytes: 2.8 * GB,
      nCtx: 4096,
      cacheType: 'q8_0',
    });
    __resetRamFitCacheForTests();
    const q4 = await preflightLoadRam({
      modelBytes: 2.8 * GB,
      nCtx: 4096,
      cacheType: 'q4_0',
    });
    expect(q4.requiredBytes).toBeLessThan(q8.requiredBytes);
    if (!q8.ok) {
      // When q8 fails, q4 should have a better chance (may still fail).
      expect(q4.requiredBytes).toBeLessThan(q8.requiredBytes);
    }
  });
});
