/**
 * Unit tests for download speed / ETA formatting helpers.
 */

import {
  buildDownloadProgressInfo,
  computeDownloadRate,
  estimateEtaSeconds,
  formatBytesPerSecond,
  formatBytesShort,
  formatDownloadProgressLine,
  formatEtaSeconds,
  pushDownloadSample,
} from '../src/utils/downloadProgressFormat';

describe('computeDownloadRate', () => {
  it('returns null with fewer than 2 samples', () => {
    expect(computeDownloadRate([])).toBeNull();
    expect(computeDownloadRate([{ t: 1000, bytes: 100 }])).toBeNull();
  });

  it('computes bytes/sec over the window', () => {
    const samples = [
      { t: 0, bytes: 0 },
      { t: 2000, bytes: 2_000_000 },
    ];
    expect(computeDownloadRate(samples, 8000, 2000)).toBe(1_000_000);
  });
});

describe('estimateEtaSeconds', () => {
  it('returns null when rate or remaining is unusable', () => {
    expect(estimateEtaSeconds(0, 100)).toBeNull();
    expect(estimateEtaSeconds(1000, null)).toBeNull();
    expect(estimateEtaSeconds(1000, 0)).toBeNull();
  });

  it('divides remaining by rate', () => {
    expect(estimateEtaSeconds(5_000_000, 1_000_000)).toBe(5);
  });
});

describe('formatters', () => {
  it('formats bytes and speed', () => {
    expect(formatBytesShort(512)).toBe('512 B');
    expect(formatBytesShort(2048)).toBe('2 KB');
    expect(formatBytesPerSecond(1_500_000)).toMatch(/MB\/s/);
  });

  it('formats calm ETAs', () => {
    expect(formatEtaSeconds(3)).toBe('~5s');
    expect(formatEtaSeconds(42)).toBe('~40s');
    expect(formatEtaSeconds(125)).toBe('~2m');
    expect(formatEtaSeconds(3700)).toBe('~1h');
  });

  it('builds a secondary progress line with ETA under speed', () => {
    expect(
      formatDownloadProgressLine({
        bytesPerSecond: 1_500_000,
        etaSeconds: 120,
      }),
    ).toBe('1.4 MB/s\n~2m');
    expect(
      formatDownloadProgressLine({
        bytesPerSecond: 1_500_000,
        etaSeconds: 10,
      }),
    ).toBe('1.4 MB/s\n~10s');
    expect(
      formatDownloadProgressLine({
        bytesPerSecond: null,
        etaSeconds: null,
      }),
    ).toBe('');
  });
});

describe('buildDownloadProgressInfo', () => {
  it('combines percent, rate, and eta', () => {
    const samples = [
      { t: 0, bytes: 0 },
      { t: 2000, bytes: 50_000_000 },
    ];
    const info = buildDownloadProgressInfo({
      bytesWritten: 50_000_000,
      totalBytes: 100_000_000,
      samples,
      now: 2000,
    });
    expect(info.percent).toBe(50);
    expect(info.bytesPerSecond).toBe(25_000_000);
    expect(info.etaSeconds).toBe(2);
  });
});

describe('pushDownloadSample', () => {
  it('trims old samples outside the window', () => {
    const samples = pushDownloadSample([], 0, 0);
    pushDownloadSample(samples, 100, 1000);
    pushDownloadSample(samples, 200, 10_000);
    expect(samples[0].t).toBeGreaterThanOrEqual(10_000 - 8000);
  });
});
