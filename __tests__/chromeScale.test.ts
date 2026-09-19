import {
  CHROME_SCALES,
  DEFAULT_CHROME_SCALE,
  chromeFont,
  chromeFontForRole,
  chromeScaleChipLabel,
  chromeSpace,
  isChromeScale,
  parseChromeScale,
} from '../src/utils/chromeScale';

describe('chromeScale', () => {
  it('accepts the discrete preference values', () => {
    expect(CHROME_SCALES).toEqual([0.85, 0.92, 1]);
    expect(DEFAULT_CHROME_SCALE).toBe(1);
    expect(isChromeScale(0.85)).toBe(true);
    expect(isChromeScale(0.9)).toBe(false);
    expect(parseChromeScale('0.92')).toBe(0.92);
    expect(parseChromeScale('nope')).toBeNull();
  });

  it('labels chips S / M / L', () => {
    expect(chromeScaleChipLabel(0.85)).toBe('S');
    expect(chromeScaleChipLabel(0.92)).toBe('M');
    expect(chromeScaleChipLabel(1)).toBe('L');
  });

  it('keeps full size at default preference', () => {
    expect(chromeFont(18)).toBe(18);
    expect(chromeSpace(12)).toBe(12);
  });

  it('shrinks fonts and spacing for compact preference', () => {
    expect(chromeFont(18, 0.85)).toBeLessThan(18);
    expect(chromeFont(18, 0.85)).toBeGreaterThanOrEqual(Math.floor(18 * 0.85));
    expect(chromeSpace(12, 0.85)).toBeLessThan(12);
  });

  it.each(CHROME_SCALES)(
    'preserves semantic type hierarchy at scale %s',
    (scale) => {
      const tile = chromeFontForRole('tile', scale);
      const modelTile = chromeFontForRole('modelTile', scale);
      const tab = chromeFontForRole('tab', scale);
      const control = chromeFontForRole('control', scale);
      const caption = chromeFontForRole('caption', scale);

      expect(tile).toBeGreaterThan(modelTile);
      expect(modelTile).toBeGreaterThanOrEqual(tab);
      expect(tab).toBeGreaterThanOrEqual(control);
      expect(control).toBeGreaterThan(caption);
      expect(tab).toBeGreaterThanOrEqual(15);
    },
  );
});
