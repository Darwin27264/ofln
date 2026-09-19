/**
 * Persistent top-left edge glow for non-chat pages.
 *
 * Lives at the App shell (not per-screen) so idle motion keeps running across
 * Settings → Models → … transitions. Hidden on chat / onboarding.
 *
 * Enter: light blooms from past the top + left edges — staggered blobs, soft
 * fade, and a brief scale settle — so it feels like wash arriving, not a slide.
 *
 * The blobs are clipped to the corner, but grain spans the full screen: a grain
 * layer that stopped at the clip box would draw its own rectangular edge, which
 * is exactly the artifact it exists to remove.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAmbientMotion } from '../context/AmbientMotionContext';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';
import {
  HueField,
  HueGrain,
  huePalette,
  type HueBlobExtras,
  type HueBlobSpec,
} from './hue';

const { width: W, height: H } = Dimensions.get('window');

const BLEED_IN_MS = 920;
const BLEED_OUT_MS = 340;
/** Park past both edges — shorter travel so motion is a bloom, not a panel slide. */
const BLEED_FROM_X = -Math.min(72, W * 0.18);
const BLEED_FROM_Y = -Math.min(64, H * 0.09);
/** Enter scale: slightly contracted → rest (one continuous ease with bleed). */
const BLOOM_FROM = 0.92;
const ENTER_EASE = Easing.bezier(0.16, 1, 0.3, 1);

/** Adds the staggered-entrance fields to the shared blob spec. */
type EdgeBlob = HueBlobSpec & {
  /** 0–1 fraction of enter progress before this blob starts arriving. */
  stagger: number;
  /** Extra local offset while entering (edge-creep direction). */
  enterDx: number;
  enterDy: number;
};

/**
 * Hugs the physical top-left corner + top/left edges of the screen. Three
 * oversized blobs replace the previous four: with the Gaussian falloff each one
 * spreads much further, so a fourth only added overlap seams.
 */
function buildEdgeBlobs(isDark: boolean): EdgeBlob[] {
  const { deep, soft, fade } = huePalette('default', isDark);
  return [
    {
      id: 'corner',
      width: W * 0.78,
      height: H * 0.36,
      left: -W * 0.29,
      top: -H * 0.11,
      color: soft,
      peak: isDark ? 0.17 : 0.105,
      dx: 14,
      dy: 10,
      duration: 6800,
      stagger: 0,
      enterDx: -14,
      enterDy: -10,
    },
    {
      id: 'top-edge',
      width: W * 0.88,
      height: H * 0.2,
      left: -W * 0.22,
      top: -H * 0.09,
      color: fade,
      peak: isDark ? 0.12 : 0.07,
      dx: 22,
      dy: 6,
      duration: 7600,
      stagger: 0.06,
      enterDx: 8,
      enterDy: -16,
    },
    {
      id: 'left-edge',
      width: W * 0.46,
      height: H * 0.52,
      left: -W * 0.25,
      top: -H * 0.08,
      color: deep,
      peak: isDark ? 0.14 : 0.085,
      dx: 8,
      dy: 18,
      duration: 8200,
      stagger: 0.1,
      enterDx: -18,
      enterDy: 8,
    },
  ];
}

export type EdgeGlowProps = {
  /** When false (chat / onboarding), retreats past the edges and hides. */
  active: boolean;
};

/**
 * App-shell overlay. Keep mounted across page changes so idle motion
 * does not restart; only `active` toggles bleed in/out.
 */
export function EdgeGlow({ active }: EdgeGlowProps) {
  const { isDark } = useTheme();
  const { ambientMotion } = useAmbientMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  /** 0 = parked past the top-left edges, 1 = settled on-screen. */
  const bleed = useRef(new Animated.Value(0)).current;
  const wasActive = useRef(false);
  const blobs = useMemo(() => buildEdgeBlobs(isDark), [isDark]);

  // All blobs finish together at bleed=1 — stagger only delays the start.
  const extras = useMemo(() => {
    const map: Record<string, HueBlobExtras> = {};
    for (const blob of blobs) {
      const ramp = { inputRange: [blob.stagger, 1], extrapolate: 'clamp' as const };
      map[blob.id] = {
        opacity: bleed.interpolate({ ...ramp, outputRange: [0, 1] }),
        offsetX: bleed.interpolate({ ...ramp, outputRange: [blob.enterDx, 0] }),
        offsetY: bleed.interpolate({ ...ramp, outputRange: [blob.enterDy, 0] }),
        scale: bleed.interpolate({ ...ramp, outputRange: [0.92, 1] }),
      };
    }
    return map;
  }, [blobs, bleed]);

  useEffect(() => {
    if (active) {
      const fromHidden = !wasActive.current;
      wasActive.current = true;
      if (fromHidden) {
        // Blobs own the fade (staggered); group stays lit so edge-creep reads clearly.
        bleed.setValue(0);
        opacity.setValue(1);
      }
      const anim = fromHidden
        ? Animated.timing(bleed, {
            toValue: 1,
            duration: BLEED_IN_MS,
            easing: ENTER_EASE,
            useNativeDriver: true,
          })
        : Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: OVERLAY_MOTION.FADE_IN_MS,
              easing: EASING.EASE_OUT,
              useNativeDriver: true,
            }),
            Animated.timing(bleed, {
              toValue: 1,
              duration: 280,
              easing: EASING.EASE_OUT,
              useNativeDriver: true,
            }),
          ]);
      anim.start();
      return () => anim.stop();
    }

    wasActive.current = false;
    const anim = Animated.parallel([
      Animated.timing(bleed, {
        toValue: 0,
        duration: BLEED_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: BLEED_OUT_MS,
        delay: Math.round(BLEED_OUT_MS * 0.2),
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, bleed, opacity]);

  // One progress drives slide + bloom so enter never splits into two beats.
  const translateX = bleed.interpolate({
    inputRange: [0, 1],
    outputRange: [BLEED_FROM_X, 0],
  });
  const translateY = bleed.interpolate({
    inputRange: [0, 1],
    outputRange: [BLEED_FROM_Y, 0],
  });
  const bloom = bleed.interpolate({
    inputRange: [0, 1],
    outputRange: [BLOOM_FROM, 1],
  });

  return (
    <Animated.View pointerEvents="none" style={[styles.root, { opacity }]}>
      {/* Clip: wash is revealed as it crosses the screen edges. */}
      <View style={styles.corner} pointerEvents="none">
        <HueField
          blobs={blobs}
          isDark={isDark}
          motionEnabled={ambientMotion}
          extras={extras}
          // Full-screen grain below; a clipped grain layer would show its edge.
          grain={false}
          style={{
            transform: [{ translateX }, { translateY }, { scale: bloom }],
          }}
        />
      </View>
      {/* Ramps with the wash so the grain does not pop in ahead of the blobs. */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { opacity: bleed }]}
      >
        <HueGrain isDark={isDark} />
      </Animated.View>
    </Animated.View>
  );
}

/** @deprecated Use EdgeGlow. */
export const TitleHue = EdgeGlow;

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  corner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: Math.min(W * 0.86, 400),
    height: Math.min(H * 0.46, 380),
    overflow: 'hidden',
  },
});
