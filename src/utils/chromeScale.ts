/**
 * Manual chrome / button label density from Display preferences (S / M / L).
 * No screen-width auto-scaling — size only changes when the user picks it.
 */
import { PixelRatio } from "react-native";

export const CHROME_SCALES = [0.85, 0.92, 1] as const;
export type ChromeScale = (typeof CHROME_SCALES)[number];

export const DEFAULT_CHROME_SCALE: ChromeScale = 1;

export const CHROME_SCALE_STORAGE_KEY = "@app_chrome_scale";

export function isChromeScale(value: unknown): value is ChromeScale {
  return (
    typeof value === "number" &&
    (CHROME_SCALES as readonly number[]).includes(value)
  );
}

export function parseChromeScale(raw: string | null): ChromeScale | null {
  if (raw == null) return null;
  const n = Number(raw);
  return isChromeScale(n) ? n : null;
}

/** Chip label in Display preferences (S / M / L). */
export function chromeScaleChipLabel(scale: ChromeScale): string {
  if (scale <= 0.85) return "S";
  if (scale <= 0.92) return "M";
  return "L";
}

export type ChromeTextRole =
  | "tile"
  | "modelTile"
  | "tab"
  | "control"
  | "caption";

/**
 * Explicit type sizes for each manual preference. These preserve hierarchy
 * instead of shrinking every label by the same percentage.
 */
const CHROME_TYPE_SIZES: Record<ChromeTextRole, readonly [number, number, number]> = {
  tile: [16, 17, 18],
  modelTile: [15, 16, 17],
  tab: [15, 15.5, 16],
  control: [14, 15, 16],
  caption: [12, 12.5, 13],
};

export function chromeFontForRole(
  role: ChromeTextRole,
  scale: ChromeScale = DEFAULT_CHROME_SCALE,
): number {
  const preferenceIndex = CHROME_SCALES.indexOf(scale);
  return CHROME_TYPE_SIZES[role][preferenceIndex < 0 ? 2 : preferenceIndex];
}

/** Round to a clean pixel-ish font size for Poppins labels. */
export function chromeFont(
  size: number,
  scale: number = DEFAULT_CHROME_SCALE,
): number {
  const scaled = size * scale;
  return Math.round(PixelRatio.roundToNearestPixel(scaled) * 10) / 10;
}

export function chromeSpace(
  size: number,
  scale: number = DEFAULT_CHROME_SCALE,
): number {
  return Math.round(PixelRatio.roundToNearestPixel(size * scale));
}
