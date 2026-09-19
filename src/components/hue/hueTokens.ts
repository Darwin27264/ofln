/**
 * Shared tokens for every ambient hue surface (chat canvas, app-shell edge,
 * onboarding lava, composer listening glow, response loader).
 *
 * Why this file exists: the glow used to be five near-identical copies of a
 * 4-stop radial gradient. That profile is piecewise *linear*, so alpha is still
 * falling when it reaches 0 at the outer stop and then flattens — a slope break
 * the eye reads as a drawn circle outline. Stacking nine of them multiplied the
 * artifact instead of hiding it.
 *
 * The fix is a falloff (`hueStops`) that reaches zero *with zero slope*, sampled
 * at enough offsets that the piecewise-linear approximation stays below the
 * visible threshold. Combined with fewer, oversized blobs and the grain overlay
 * in `HueGrain`, individual discs stop being discernible.
 */

/** Shared gold / fade-yellow family (logo sun-amber; matches onboarding lava). */
export const AMBIENT_GOLD = {
  // Logo solar flare: burnt amber → saturated gold → pale sun highlight
  deepDark: '#F5A623',
  softDark: '#FFC845',
  fadeDark: '#FFF0B8',
  deepLight: '#D48E2F',
  softLight: '#E8B040',
  fadeLight: '#F5D78A',
} as const;

/** Cool violet — ephemeral / temporary mode. */
export const AMBIENT_VIOLET = {
  deepDark: '#8B7CF6',
  softDark: '#B4A7FB',
  fadeDark: '#D4CCFD',
  deepLight: '#6D5BD0',
  softLight: '#9B8CE8',
  fadeLight: '#C5BBF0',
} as const;

/** Soft teal — multi-speaker / perspective mode. */
export const AMBIENT_TEAL = {
  deepDark: '#2DB8A8',
  softDark: '#5ED4C6',
  fadeDark: '#A8EBE3',
  deepLight: '#1F9A8C',
  softLight: '#4AB8AA',
  fadeLight: '#9AD9D1',
} as const;

/** Chat mode drives the hue family; gold is the only one promoted to `accent`. */
export type HueMode = 'default' | 'temporary' | 'perspective';

export type HuePalette = {
  deep: string;
  soft: string;
  fade: string;
};

const FAMILIES = {
  default: AMBIENT_GOLD,
  temporary: AMBIENT_VIOLET,
  perspective: AMBIENT_TEAL,
} as const;

export function huePalette(mode: HueMode, isDark: boolean): HuePalette {
  const family = FAMILIES[mode] ?? AMBIENT_GOLD;
  return {
    deep: isDark ? family.deepDark : family.deepLight,
    soft: isDark ? family.softDark : family.softLight,
    fade: isDark ? family.fadeDark : family.fadeLight,
  };
}

/**
 * Exponent for the `(1 - t^2)^P` falloff.
 *
 * Chosen over a Gaussian because it hits exactly 0 at the rim on its own. A
 * Gaussian has to be clamped there, and that clamp is a slope break — the same
 * artifact, just smaller. This kernel's derivative is `-2Pt(1-t^2)^(P-1)`, which
 * is also 0 at t=1, so value and slope both land flat and there is no rim to see.
 * At P=3 the interior is close to a Gaussian, so the shape still reads as a soft
 * bloom rather than a hard-edged disc.
 */
export const HUE_FALLOFF_POWER = 3;

/**
 * Gradient stop count. At 12 the worst-case gap between the piecewise-linear
 * approximation and the true curve is ~0.4% of peak — well under one 8-bit level
 * at the alphas the hue runs at.
 */
export const HUE_STOP_COUNT = 12;

export type HueStop = {
  /** SVG offset, e.g. `"25%"`. */
  offset: string;
  /** Absolute stop opacity, peak already applied. */
  opacity: number;
};

/**
 * Alpha ramp for a radial gradient. `peak` is the alpha at the center; the ramp
 * reaches 0 at the rim with zero slope, so the blob has no visible boundary.
 */
export function hueStops(
  peak: number,
  steps: number = HUE_STOP_COUNT,
  power: number = HUE_FALLOFF_POWER,
): HueStop[] {
  const stops: HueStop[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const raw = peak * Math.pow(1 - t * t, power);
    stops.push({
      offset: `${Math.round(t * 1000) / 10}%`,
      // 4dp is finer than an 8-bit channel can resolve; keeps SVG props stable.
      opacity: Math.round(raw * 10000) / 10000,
    });
  }
  return stops;
}

export type HueRampStop = HueStop & { color: string };

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const channel = (from: number, to: number) =>
    Math.round(from + (to - from) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ar, br)}${channel(ag, bg)}${channel(ab, bb)}`;
}

/** Samples a list of hex colors as an evenly spaced ramp. */
function sampleRamp(colors: readonly string[], t: number): string {
  if (colors.length === 1) return colors[0];
  const scaled = Math.min(t, 1) * (colors.length - 1);
  const i = Math.min(Math.floor(scaled), colors.length - 2);
  return mixHex(colors[i], colors[i + 1], scaled - i);
}

/**
 * Like `hueStops`, but blends through a color ramp on the way out — e.g. pale
 * highlight at the core through to burnt amber at the rim.
 *
 * Interpolating the ramp per stop keeps the hue shift continuous. Assigning one
 * color per band instead puts a color boundary mid-falloff, which reads as an
 * edge for the same reason a slope break does.
 */
export function hueRampStops(
  peak: number,
  colors: readonly string[],
  steps: number = HUE_STOP_COUNT,
  power: number = HUE_FALLOFF_POWER,
): HueRampStop[] {
  return hueStops(peak, steps, power).map((stop, i) => ({
    ...stop,
    color: sampleRamp(colors, i / steps),
  }));
}

/**
 * Blobs should be drawn larger than the area they visibly cover so the rim —
 * where any residual contour lives — sits off-screen or under other layers.
 * Applied when porting the old blob sizes; keep new specs generous for the same
 * reason. A blob whose rim lands mid-screen will read as a circle no matter how
 * smooth its falloff is.
 */
export const HUE_BLOB_OVERSIZE = 1.6;

/**
 * Grain opacity per theme. The texture is uniform noise, so this works out to a
 * standard deviation of roughly two 8-bit levels — enough to break quantization
 * bands, below the threshold where it reads as texture.
 */
export const HUE_GRAIN_OPACITY = {
  dark: 0.03,
  light: 0.022,
} as const;
