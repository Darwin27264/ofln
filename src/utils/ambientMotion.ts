/**
 * Ambient motion preference — whether the hue drifts or sits as a static wash.
 *
 * Off keeps the hue (it is part of the visual identity) and only stops the idle
 * animation, which is the part that costs battery and GPU while the user is
 * reading rather than interacting.
 */

export const AMBIENT_MOTION_STORAGE_KEY = '@app_ambient_motion';

export const DEFAULT_AMBIENT_MOTION = true;

export function parseAmbientMotion(raw: string | null): boolean | null {
  if (raw === 'on') return true;
  if (raw === 'off') return false;
  return null;
}

export function serializeAmbientMotion(enabled: boolean): string {
  return enabled ? 'on' : 'off';
}
