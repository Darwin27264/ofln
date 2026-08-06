jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(async () => false),
  readFile: jest.fn(async () => ''),
  appendFile: jest.fn(async () => undefined),
  writeFile: jest.fn(async () => undefined),
  unlink: jest.fn(async () => undefined),
}));

import {
  buildUsageHistory,
  computeUsageTrend,
  type UsageMetrics,
} from '../src/services/performanceTracking';

function row(
  partial: Partial<UsageMetrics> &
    Pick<UsageMetrics, 'timestamp' | 'tokensPerSecond' | 'model'>,
): UsageMetrics {
  return {
    inferenceTime: 1000,
    tokenCount: 64,
    performanceLevel: 'Medium',
    ...partial,
  };
}

describe('buildUsageHistory', () => {
  it('returns newest-first valid runs up to limit', () => {
    const records = [
      row({ timestamp: 1000, tokensPerSecond: 8, model: 'a.gguf' }),
      row({ timestamp: 2000, tokensPerSecond: 10, model: 'a.gguf' }),
      row({ timestamp: 3000, tokensPerSecond: 12, model: 'a.gguf' }),
      row({ timestamp: 4000, tokensPerSecond: 9, model: 'b.gguf' }),
    ];
    const hist = buildUsageHistory(records, 'a.gguf', 2);
    expect(hist).toHaveLength(2);
    expect(hist[0].timestamp).toBe(3000);
    expect(hist[0].tokensPerSecond).toBe(12);
    expect(hist[1].timestamp).toBe(2000);
  });

  it('returns empty for missing model', () => {
    expect(buildUsageHistory([row({ timestamp: 1, tokensPerSecond: 5, model: 'x.gguf' })], null)).toEqual([]);
  });
});

describe('computeUsageTrend', () => {
  it('is flat with too few samples', () => {
    const t = computeUsageTrend([10, 12, 11]);
    expect(t.direction).toBe('flat');
    expect(t.deltaPct).toBeNull();
  });

  it('detects upward trend when recent half is faster', () => {
    // older: 8,8 recent: 16,16 → +100%
    const t = computeUsageTrend([8, 8, 16, 16], { flatPct: 5 });
    expect(t.direction).toBe('up');
    expect(t.deltaPct).toBe(100);
  });

  it('detects downward trend', () => {
    const t = computeUsageTrend([16, 16, 8, 8], { flatPct: 5 });
    expect(t.direction).toBe('down');
    expect(t.deltaPct).toBe(-50);
  });

  it('is flat when change is small', () => {
    const t = computeUsageTrend([10, 10, 10.2, 10.1], { flatPct: 5 });
    expect(t.direction).toBe('flat');
  });
});
