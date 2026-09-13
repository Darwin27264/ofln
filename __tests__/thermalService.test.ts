import {
  shouldYieldForThermal,
  thermalYieldMs,
  formatThermalLabel,
  formatThermalHint,
  thermalLevelToGraphValue,
  __resetThermalCacheForTests,
} from '../src/services/thermalService';

beforeEach(() => {
  __resetThermalCacheForTests();
});

describe('thermalYield', () => {
  it('yields on serious and critical only', () => {
    expect(shouldYieldForThermal('nominal')).toBe(false);
    expect(shouldYieldForThermal('fair')).toBe(false);
    expect(shouldYieldForThermal('serious')).toBe(true);
    expect(shouldYieldForThermal('critical')).toBe(true);
  });

  it('uses 5–10ms adaptive delays', () => {
    expect(thermalYieldMs('nominal')).toBe(0);
    expect(thermalYieldMs('critical')).toBe(10);
    const serious = thermalYieldMs('serious');
    expect(serious).toBeGreaterThanOrEqual(5);
    expect(serious).toBeLessThanOrEqual(8);
  });

  it('formats labels and hints for Diagnostics', () => {
    expect(formatThermalLabel('nominal')).toBe('Nominal');
    expect(formatThermalHint('serious')).toMatch(/yield/i);
  });

  it('maps thermal to Cool / Warm / Hot graph values', () => {
    expect(thermalLevelToGraphValue('nominal')).toBe(1);
    expect(thermalLevelToGraphValue('fair')).toBe(2);
    expect(thermalLevelToGraphValue('serious')).toBe(3);
    expect(thermalLevelToGraphValue('critical')).toBe(3);
  });
});
