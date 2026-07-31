/**
 * Centralized Animation Configuration
 * 
 * Provides standardized animation configurations optimized for mobile devices.
 * All animations use native driver for 60fps performance and Material Design easing curves.
 * 
 * Performance optimizations:
 * - Native driver enabled for all animations (runs on UI thread)
 * - Reduced durations for snappy, responsive feel
 * - Consistent easing curves for cohesive user experience
 * - Platform-specific optimizations where needed
 */

import { Easing, Platform } from 'react-native';

/**
 * Standard animation durations optimized for mobile
 * Reduced from typical desktop values for better responsiveness
 */
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

/**
 * Material Design easing curves
 * Provides smooth, natural-feeling animations
 */
export const EASING = {
  /** Standard Material Design easing (most common) */
  STANDARD: Easing.bezier(0.4, 0.0, 0.2, 1),
  /** Ease out for entering animations */
  EASE_OUT: Easing.out(Easing.cubic),
  /** Ease in for exiting animations */
  EASE_IN: Easing.bezier(0.55, 0.06, 0.68, 0.19),
  /** Decelerate for smooth stops */
  DECELERATE: Easing.bezier(0.0, 0.0, 0.2, 1),
  /** Accelerate for quick starts */
  ACCELERATE: Easing.bezier(0.4, 0.0, 1, 1),
} as const;

/**
 * Standardized animation configurations for common use cases
 * All use native driver for optimal performance
 */
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

export const ANIMATION_CONFIG = {
  /** Panel slide animations (side panels, bottom sheets) */
  panel: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  /** Menu animations (context menus, dropdowns) */
  menu: {
    duration: ANIMATION_DURATIONS.FAST,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  /** Toast notifications */
  toast: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  /** Page transitions */
  page: {
    duration: ANIMATION_DURATIONS.PAGE,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  /** Card animations (fade in, slide up) */
  card: {
    duration: ANIMATION_DURATIONS.STANDARD,
    useNativeDriver: true,
    easing: EASING.EASE_OUT, // Better for entering animations - starts fast, ends smooth
  },
  /** Button press feedback */
  button: {
    duration: ANIMATION_DURATIONS.FAST,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
  /** Thinking indicator (loading dots) */
  thinking: {
    duration: ANIMATION_DURATIONS.SLOW,
    useNativeDriver: true,
    easing: EASING.STANDARD,
  },
} as const;

/**
 * Staggered animation configuration
 * Used for animating lists of items with delays
 */
export const STAGGER_CONFIG = {
  /** Delay between each item (in milliseconds) */
  DELAY_MULTIPLIER: 25,
  /** Maximum total delay to prevent long animation chains */
  MAX_DELAY: 200,
} as const;

/**
 * Calculate staggered delay for list item animations
 * 
 * @param index - Item index in the list
 * @returns Delay in milliseconds (capped at MAX_DELAY)
 */
export const getStaggeredDelay = (index: number): number => {
  return Math.min(index * STAGGER_CONFIG.DELAY_MULTIPLIER, STAGGER_CONFIG.MAX_DELAY);
};

