jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 6 * 1024 ** 3),
  },
}));

import {
  bucketForDeviceRam,
  classifyRamFit,
  classifyRamFitFromSize,
  explainRamFit,
  RAM_FIT_LABELS,
  __resetRamFitCacheForTests,
} from '../src/services/ramFitService';

const GB = 1024 ** 3;

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
    // 6 GB device — 0.51 GB Qwen 0.8B should Fit
    expect(classifyRamFit(0.51 * GB, 6 * GB)).toBe('fits');
  });

  it('marks large files as Tight or Won’t fit', () => {
    // 4 GB device — 2.41 GB 4B is Tight or Won’t fit depending on bucket
    const tier4b = classifyRamFit(2.41 * GB, 4 * GB);
    expect(['tight', 'wont_fit']).toContain(tier4b);

    // 3 GB device — 3 GB file won't fit
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
