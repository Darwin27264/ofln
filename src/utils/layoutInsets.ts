/**
 * Floating chrome (Back pills, docked actions) layout offsets.
 *
 * Edge-to-edge: status + nav/home indicator share the opaque shell color;
 * the app still lays out full-height under them. Back is offset by a real
 * bottom inset (or a minimum fallback when the OS reports 0) so it never
 * sits in the system nav.
 */
import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Extra gap above the nav / home-indicator clearance.
 * Keep this modest — the *inset* (or fallback) does most of the lift.
 */
export const FLOATING_BACK_GAP = 12;

/** @deprecated use FLOATING_BACK_GAP — kept for any lingering imports */
export const FLOATING_BACK_BOTTOM = FLOATING_BACK_GAP;

/**
 * When edge-to-edge is on, some Android builds briefly (or always) report
 * `insets.bottom === 0`. Without a floor, Back lands under the gesture bar and
 * GAP-only tweaks look like “nothing changed”.
 */
const ANDROID_MIN_NAV_CLEARANCE = 28;

/** Approximate height of the filled Back icon control (padding + icon). */
const FLOATING_BACK_CONTROL_H = 40;

/**
 * Fixed pad only (legacy). Prefer `useScrollPadForFloatingBack` so padding
 * tracks the real Back offset on every device.
 */
export const SCROLL_PAD_FOR_FLOATING_BACK = 60;

function resolvedBottomInset(insetBottom: number): number {
  const base = Math.max(0, insetBottom);
  if (Platform.OS === "android") {
    return Math.max(base, ANDROID_MIN_NAV_CLEARANCE);
  }
  return base;
}

/** bottom style value for absolute Back rows: above system nav. */
export function floatingBackBottom(insetBottom: number): number {
  return resolvedBottomInset(insetBottom) + FLOATING_BACK_GAP;
}

/** Scroll content bottom pad so the last item clears the floating Back row. */
export function scrollPadForFloatingBack(insetBottom: number): number {
  // Back offset + control height + small air under last item (Models-like density).
  return floatingBackBottom(insetBottom) + FLOATING_BACK_CONTROL_H + 4;
}

/** Hook for screens that float Back / bottom chrome. */
export function useFloatingBackBottom(): number {
  const insets = useSafeAreaInsets();
  return floatingBackBottom(insets.bottom);
}

/** Hook: ScrollView paddingBottom that matches the live Back position. */
export function useScrollPadForFloatingBack(): number {
  const insets = useSafeAreaInsets();
  return scrollPadForFloatingBack(insets.bottom);
}
