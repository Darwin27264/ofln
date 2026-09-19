/**
 * Centralized animation configuration for consistent, native-driver motion.
 */

import { Easing, Platform } from 'react-native';

/** Standard durations tuned for mobile responsiveness. */
export const ANIMATION_DURATIONS = {
  /** Fast interactions (buttons, toggles) */
  FAST: 120,
  /** Standard interactions (panels, menus) */
  STANDARD: 200,
  /** Page transitions */
  PAGE: Platform.OS === 'ios' ? 220 : 250,
  /** Slow transitions (complex animations) */
  SLOW: 300,
} as const;

/** Shared easing curves (Material-inspired). */
export const EASING = {
  STANDARD: Easing.bezier(0.4, 0.0, 0.2, 1),
  EASE_OUT: Easing.out(Easing.cubic),
  EASE_IN: Easing.bezier(0.55, 0.06, 0.68, 0.19),
  DECELERATE: Easing.bezier(0.0, 0.0, 0.2, 1),
  ACCELERATE: Easing.bezier(0.4, 0.0, 1, 1),
} as const;

/**
 * Centered overlay enter/exit — alerts, floating panels, page fades.
 * FADE_OUT_MS is also used for shell frost lerp when chrome closes.
 */
export const OVERLAY_MOTION = {
  FROM_SCALE: 0.98,
  FADE_IN_MS: 240,
  SCALE_IN_MS: 260,
  FADE_OUT_MS: 200,
  SCALE_OUT_MS: 200,
} as const;

/**
 * Full-width history drawer spring — snappy, critically damped, no bounce.
 * Higher rest thresholds end the spring once the slide is visually done.
 */
export const HISTORY_PANEL_SPRING = {
  tension: 200,
  friction: 26,
  overshootClamping: true,
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 1,
} as const;

/** Common Animated.timing presets (all use the native driver). */
export const ANIMATION_CONFIG = {
  panel: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  menu: {
    duration: ANIMATION_DURATIONS.FAST,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  toast: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  page: {
    duration: ANIMATION_DURATIONS.PAGE,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  card: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.EASE_OUT,
  },
  button: {
    duration: ANIMATION_DURATIONS.FAST,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  thinking: {
    duration: ANIMATION_DURATIONS.SLOW,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
} as const;

/** Staggered list entrance delays. */
export const STAGGER_CONFIG = {
  DELAY_MULTIPLIER: 25,
  MAX_DELAY: 200,
} as const;

/** Delay for list item `index`, capped at MAX_DELAY. */
export const getStaggeredDelay = (index: number): number => {
  return Math.min(index * STAGGER_CONFIG.DELAY_MULTIPLIER, STAGGER_CONFIG.MAX_DELAY);
};
