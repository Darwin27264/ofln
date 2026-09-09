/**
 * Persistent top-left edge glow for non-chat pages.
 *
 * Lives at the App shell (not per-screen) so idle motion keeps running across
 * Settings → Models → … transitions. Hidden on chat / onboarding.
 *
 * Enter: light blooms from past the top + left edges — staggered blobs, soft
 * fade, and a brief scale settle — so it feels like wash arriving, not a slide.
 */
import React, { useEffect, useId, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import { AMBIENT_GOLD } from './AmbientHue';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';

const { width: W, height: H } = Dimensions.get('window');

const BLEED_IN_MS = 920;
const BLEED_OUT_MS = 340;
/** Park past both edges — shorter travel so motion is a bloom, not a panel slide. */
const BLEED_FROM_X = -Math.min(72, W * 0.18);
const BLEED_FROM_Y = -Math.min(64, H * 0.09);
/** Enter scale: slightly contracted → rest (one continuous ease with bleed). */
const BLOOM_FROM = 0.92;
const ENTER_EASE = Easing.bezier(0.16, 1, 0.3, 1);

type GlowSpec = {
  id: string;
  width: number;
  height: number;
  left: number;
  top: number;
  color: string;
  peak: number;
  dx: number;
  dy: number;
  duration: number;
  /** 0–1 fraction of enter progress before this blob starts arriving. */
  stagger: number;
  /** Extra local offset while entering (edge-creep direction). */
  enterDx: number;
  enterDy: number;
};

function palette(isDark: boolean) {
  return {
    deep: isDark ? AMBIENT_GOLD.deepDark : AMBIENT_GOLD.deepLight,
    soft: isDark ? AMBIENT_GOLD.softDark : AMBIENT_GOLD.softLight,
    fade: isDark ? AMBIENT_GOLD.fadeDark : AMBIENT_GOLD.fadeLight,
  };
}

/** Hugs the physical top-left corner + top/left edges of the screen. */
function buildEdgeGlows(isDark: boolean): GlowSpec[] {
  const { deep, soft, fade } = palette(isDark);
  return [
    {
      id: 'corner',
      width: W * 0.48,
      height: H * 0.22,
      left: -W * 0.14,
      top: -H * 0.04,
      color: soft,
      peak: isDark ? 0.32 : 0.2,
      dx: 14,
      dy: 10,
      duration: 6800,
      stagger: 0,
      enterDx: -14,
      enterDy: -10,
    },
    {
      id: 'top-edge',
      width: W * 0.55,
      height: H * 0.12,
      left: -W * 0.06,
      top: -H * 0.05,
      color: fade,
      peak: isDark ? 0.22 : 0.13,
      dx: 22,
      dy: 6,
      duration: 7600,
      stagger: 0.06,
      enterDx: 8,
      enterDy: -16,
    },
    {
      id: 'left-edge',
      width: W * 0.28,
      height: H * 0.32,
      left: -W * 0.16,
      top: -H * 0.02,
      color: deep,
      peak: isDark ? 0.26 : 0.15,
      dx: 8,
      dy: 18,
      duration: 8200,
      stagger: 0.1,
      enterDx: -18,
      enterDy: 8,
    },
    {
      id: 'corner-soft',
      width: W * 0.36,
      height: H * 0.18,
      left: -W * 0.1,
      top: H * 0.01,
      color: soft,
      peak: isDark ? 0.14 : 0.08,
      dx: -10,
      dy: 12,
      duration: 9000,
      stagger: 0.14,
      enterDx: -6,
      enterDy: 12,
    },
  ];
}

function EdgeGlowBlob({
  id,
  width,
  height,
  left,
  top,
  color,
  peak,
  dx,
  dy,
  duration,
  stagger,
  enterDx,
  enterDy,
  enter,
}: GlowSpec & { enter: Animated.Value }) {
  const idleTx = useRef(new Animated.Value(0)).current;
  const idleTy = useRef(new Animated.Value(0)).current;
  const reactId = useId().replace(/:/g, '');
  const gradId = `edge-glow-${id}-${reactId}`;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(idleTx, {
            toValue: dx,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: dy,
            duration,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(idleTx, {
            toValue: -dx * 0.7,
            duration: duration * 0.85,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: -dy * 0.65,
            duration: duration * 0.85,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(idleTx, {
            toValue: 0,
            duration: duration * 0.65,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: 0,
            duration: duration * 0.65,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dx, dy, duration, idleTx, idleTy]);

  // All blobs finish together at enter=1 — stagger only delays the start.
  const blobOpacity = enter.interpolate({
    inputRange: [stagger, 1],
    outputRange: [0, peak],
    extrapolate: 'clamp',
  });
  const localTx = enter.interpolate({
    inputRange: [stagger, 1],
    outputRange: [enterDx, 0],
    extrapolate: 'clamp',
  });
  const localTy = enter.interpolate({
    inputRange: [stagger, 1],
    outputRange: [enterDy, 0],
    extrapolate: 'clamp',
  });
  const localScale = enter.interpolate({
    inputRange: [stagger, 1],
    outputRange: [0.92, 1],
    extrapolate: 'clamp',
  });

  const translateX = Animated.add(idleTx, localTx);
  const translateY = Animated.add(idleTy, localTy);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        opacity: blobOpacity,
        transform: [
          { translateX },
          { translateY },
          { scale: localScale },
        ],
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.75} />
            <Stop offset="30%" stopColor={color} stopOpacity={0.34} />
            <Stop offset="62%" stopColor={color} stopOpacity={0.1} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={`url(#${gradId})`}
        />
      </Svg>
    </Animated.View>
  );
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
  const opacity = useRef(new Animated.Value(0)).current;
  /** 0 = parked past the top-left edges, 1 = settled on-screen. */
  const bleed = useRef(new Animated.Value(0)).current;
  const wasActive = useRef(false);
  const glows = useMemo(() => buildEdgeGlows(isDark), [isDark]);

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
    <View pointerEvents="none" style={styles.root}>
      {/* Clip: wash is revealed as it crosses the screen edges. */}
      <View style={styles.corner} pointerEvents="none">
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              opacity,
              transform: [
                { translateX },
                { translateY },
                { scale: bloom },
              ],
            },
          ]}
        >
          {glows.map((g) => (
            <EdgeGlowBlob key={g.id} {...g} enter={bleed} />
          ))}
        </Animated.View>
      </View>
    </View>
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
    width: Math.min(W * 0.72, 340),
    height: Math.min(H * 0.38, 320),
    overflow: 'hidden',
  },
});
