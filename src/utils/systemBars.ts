// systemBars.ts
import { NativeModules, Platform } from 'react-native';

// @ts-ignore - Native module may not be available during development
const { SystemBars } = NativeModules as {
  SystemBars?: {
    setSystemBarColors: (status: string, nav: string, darkIcons: boolean) => void;
  };
};

function isColorLight(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length < 6) return false;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 180;
}

function parseHex(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.substring(0, 2), 16),
    parseInt(c.substring(2, 4), 16),
    parseInt(c.substring(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear interpolate between two #RRGGBB colors. t in [0, 1]. */
export function lerpHexColor(from: string, to: string, t: number): string {
  const clamped = Math.max(0, Math.min(1, t));
  const [r1, g1, b1] = parseHex(from);
  const [r2, g2, b2] = parseHex(to);
  return toHex(
    r1 + (r2 - r1) * clamped,
    g1 + (g2 - g1) * clamped,
    b1 + (b2 - b1) * clamped,
  );
}

/**
 * Android system bars: both status + nav stay transparent so the app shell
 * paints underneath. `statusBarColor` only drives glyph light/dark.
 */
export function applySystemBarTheme({
  statusBarColor,
}: {
  statusBarColor: string;
  /** @deprecated Ignored — bars are always transparent. */
  navBarColor?: string;
}) {
  if (Platform.OS !== 'android' || !SystemBars) {
    return;
  }

  const darkIcons = isColorLight(statusBarColor);
  SystemBars.setSystemBarColors('transparent', 'transparent', darkIcons);
}
