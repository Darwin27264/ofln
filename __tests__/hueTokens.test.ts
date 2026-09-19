import {
  HUE_STOP_COUNT,
  hueRampStops,
  hueStops,
  huePalette,
  AMBIENT_GOLD,
} from '../src/components/hue/hueTokens';
import {
  DEFAULT_AMBIENT_MOTION,
  parseAmbientMotion,
  serializeAmbientMotion,
} from '../src/utils/ambientMotion';

/** Slope of the last gradient segment, as a fraction of peak per unit radius. */
function rimSlope(stops: { offset: string; opacity: number }[], peak: number) {
  const last = stops[stops.length - 1];
  const prev = stops[stops.length - 2];
  const dt =
    (parseFloat(last.offset) - parseFloat(prev.offset)) / 100;
  return Math.abs(last.opacity - prev.opacity) / dt / peak;
}

describe('hueStops', () => {
  const PEAK = 0.19;

  it('spans center peak to a fully transparent rim', () => {
    const stops = hueStops(PEAK);
    expect(stops).toHaveLength(HUE_STOP_COUNT + 1);
    expect(stops[0].offset).toBe('0%');
    expect(stops[0].opacity).toBeCloseTo(PEAK, 4);
    expect(stops[stops.length - 1].offset).toBe('100%');
    expect(stops[stops.length - 1].opacity).toBe(0);
  });

  it('decreases monotonically', () => {
    const stops = hueStops(PEAK);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i].opacity).toBeLessThan(stops[i - 1].opacity);
    }
  });

  // The whole point of the kernel: alpha arrives at 0 with ~no slope, so there
  // is no Mach band for the eye to read as a drawn circle.
  it('flattens out at the rim instead of cutting off', () => {
    // The 4-stop profile this replaced ran 0.1 → 0 over the outer 42% of the
    // radius, against a 0.7 center stop.
    const legacyRimSlope = 0.1 / (1 - 0.58) / 0.7;
    expect(rimSlope(hueStops(PEAK), PEAK)).toBeLessThan(legacyRimSlope / 5);
  });

  it('leaves a rim step below one 8-bit level', () => {
    const stops = hueStops(PEAK);
    const lastLit = stops[stops.length - 2].opacity;
    expect(lastLit * 255).toBeLessThan(1);
  });

  it('stays under one 8-bit level of chord error against the true curve', () => {
    const stops = hueStops(PEAK);
    for (let i = 1; i < stops.length; i++) {
      const t0 = parseFloat(stops[i - 1].offset) / 100;
      const t1 = parseFloat(stops[i].offset) / 100;
      const mid = (t0 + t1) / 2;
      const chord = (stops[i - 1].opacity + stops[i].opacity) / 2;
      const actual = PEAK * Math.pow(1 - mid * mid, 3);
      // Rendered over an opaque background, one level is ~1/255 of full swing.
      expect(Math.abs(chord - actual)).toBeLessThan(1 / 255);
    }
  });

  it('scales linearly with peak', () => {
    const dim = hueStops(0.1);
    const bright = hueStops(0.2);
    for (let i = 0; i < dim.length; i++) {
      expect(bright[i].opacity).toBeCloseTo(dim[i].opacity * 2, 3);
    }
  });
});

describe('hueRampStops', () => {
  it('blends from the first color to the last across the falloff', () => {
    const stops = hueRampStops(0.5, ['#FFFFFF', '#000000']);
    expect(stops[0].color.toLowerCase()).toBe('#ffffff');
    expect(stops[stops.length - 1].color.toLowerCase()).toBe('#000000');
  });

  it('emits well-formed hex for every stop', () => {
    const stops = hueRampStops(0.4, [
      AMBIENT_GOLD.fadeDark,
      AMBIENT_GOLD.softDark,
      AMBIENT_GOLD.deepDark,
    ]);
    for (const stop of stops) {
      expect(stop.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('keeps a single-color ramp constant', () => {
    const stops = hueRampStops(0.3, ['#FFC845']);
    for (const stop of stops) {
      expect(stop.color).toBe('#FFC845');
    }
  });

  it('matches hueStops opacities', () => {
    const plain = hueStops(0.33);
    const ramped = hueRampStops(0.33, ['#FFFFFF', '#000000']);
    expect(ramped.map((s) => s.opacity)).toEqual(plain.map((s) => s.opacity));
  });
});

describe('huePalette', () => {
  it('returns the gold family for default mode', () => {
    expect(huePalette('default', true).soft).toBe(AMBIENT_GOLD.softDark);
    expect(huePalette('default', false).soft).toBe(AMBIENT_GOLD.softLight);
  });

  it('gives each mode a distinct family', () => {
    const modes = (['default', 'temporary', 'perspective'] as const).map(
      (mode) => huePalette(mode, true).deep,
    );
    expect(new Set(modes).size).toBe(3);
  });
});

describe('ambient motion preference', () => {
  it('round-trips both states', () => {
    expect(parseAmbientMotion(serializeAmbientMotion(true))).toBe(true);
    expect(parseAmbientMotion(serializeAmbientMotion(false))).toBe(false);
  });

  it('falls back to the default for missing or unrecognized values', () => {
    expect(parseAmbientMotion(null)).toBeNull();
    expect(parseAmbientMotion('')).toBeNull();
    expect(parseAmbientMotion('true')).toBeNull();
    expect(DEFAULT_AMBIENT_MOTION).toBe(true);
  });
});
