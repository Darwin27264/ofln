import {
  shouldYieldForThermal,
  thermalYieldMs,
  formatThermalLabel,
  formatThermalHint,
  formatThermalGraphBand,
  thermalLevelToGraphValue,
  thermalLevelColor,
  thermalGraphValueColor,
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

  it('maps thermal to Cool / Warm / Hot / Crit graph values', () => {
    expect(thermalLevelToGraphValue('nominal')).toBe(1);
    expect(thermalLevelToGraphValue('fair')).toBe(2);
    expect(thermalLevelToGraphValue('serious')).toBe(3);
    expect(thermalLevelToGraphValue('critical')).toBe(4);
    expect(formatThermalGraphBand(4)).toBe('Crit');
    expect(formatThermalGraphBand(3)).toBe('Hot');
    expect(formatThermalGraphBand(2)).toBe('Warm');
    expect(formatThermalGraphBand(1)).toBe('Cool');
  });

  it('color-codes thermal levels for Diagnostics', () => {
    expect(thermalLevelColor('nominal')).toBe('#34C759');
    expect(thermalLevelColor('fair')).toBe('#FF9F0A');
    expect(thermalLevelColor('serious')).toBe('#FF6B00');
    expect(thermalLevelColor('critical')).toBe('#FF453A');
    expect(thermalGraphValueColor(4)).toBe(thermalLevelColor('critical'));
    expect(thermalGraphValueColor(1)).toBe(thermalLevelColor('nominal'));
  });
});
