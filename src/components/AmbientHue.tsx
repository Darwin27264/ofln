/**
 * Center-focused ambient hue for the empty chat canvas.
 * Palette shifts with chat mode (default gold, temporary violet, perspective teal)
 * via a soft crossfade — never an abrupt swap.
 * - Handoff from onboarding: edge energy gathers to the middle
 * - Cold empty chat: subtle fade-in after load
 * - Keyboard / input focus: slides down and fades out
 * - New empty chat: fades back in (any mode)
 *
 * Four oversized blobs rather than the nine it used to stack: with a Gaussian
 * falloff (see hue/hueTokens.ts) each blob covers far more ground, and fewer
 * alpha-composited layers means no lens-shaped seams where they overlap.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
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
  type HueMode,
} from './hue';

const { width: W, height: H } = Dimensions.get('window');

const MODE_CROSSFADE_MS = 480;

export type AmbientHueMode = HueMode;

/** Adds the onboarding-handoff start offset to the shared blob spec. */
type AmbientBlob = HueBlobSpec & {
  /** Where the blob sits before it gathers to the middle. */
  edgeLeft: number;
  edgeTop: number;
};

function buildBlobs(mode: AmbientHueMode, isDark: boolean): AmbientBlob[] {
  const { deep, soft, fade } = huePalette(mode, isDark);
  return [
    {
      id: 'core',
      width: W * 1.5,
      height: H * 0.72,
      left: -W * 0.25,
      top: H * 0.1,
      edgeLeft: W * 0.18,
      edgeTop: H * 0.22,
      color: soft,
      peak: isDark ? 0.19 : 0.115,
      dx: -46,
      dy: 34,
      duration: 6400,
    },
    {
      id: 'left',
      width: W * 1.15,
      height: H * 0.58,
      left: -W * 0.355,
      top: H * 0.18,
      edgeLeft: -W * 0.28,
      edgeTop: H * 0.16,
      color: deep,
      peak: isDark ? 0.13 : 0.08,
      dx: 52,
      dy: -32,
      duration: 7400,
    },
    {
      id: 'right',
      width: W * 1.15,
      height: H * 0.58,
      left: W * 0.225,
      top: H * 0.15,
      edgeLeft: W * 0.32,
      edgeTop: H * 0.14,
      color: fade,
      peak: isDark ? 0.13 : 0.08,
      dx: -48,
      dy: 42,
      duration: 6800,
    },
    {
      id: 'low',
      width: W * 1.3,
      height: H * 0.5,
      left: -W * 0.15,
      top: H * 0.35,
      edgeLeft: 0,
      edgeTop: H * 0.28,
      color: soft,
      peak: isDark ? 0.1 : 0.06,
      dx: 32,
      dy: -44,
      duration: 8000,
    },
  ];
}

function GlowLayer({
  mode,
  isDark,
  focus,
  motionEnabled,
  layerOpacity,
}: {
  mode: AmbientHueMode;
  isDark: boolean;
  focus: Animated.Value;
  motionEnabled: boolean;
  layerOpacity: Animated.AnimatedInterpolation<number> | Animated.Value;
}) {
  const blobs = useMemo(() => buildBlobs(mode, isDark), [mode, isDark]);

  // Memoized so HueBlob's memo holds — a fresh interpolation each render would
  // re-render every blob's SVG.
  const extras = useMemo(() => {
    const map: Record<string, HueBlobExtras> = {};
    for (const blob of blobs) {
      map[blob.id] = {
        offsetX: focus.interpolate({
          inputRange: [0, 1],
          outputRange: [blob.edgeLeft, 0],
        }),
        offsetY: focus.interpolate({
          inputRange: [0, 1],
          outputRange: [blob.edgeTop, 0],
        }),
      };
    }
    return map;
  }, [blobs, focus]);

  return (
    <HueField
      blobs={blobs}
      isDark={isDark}
      motionEnabled={motionEnabled}
      extras={extras}
      // Grain lives on the root so a mode crossfade does not stack two copies.
      grain={false}
      style={{ opacity: layerOpacity }}
    />
  );
}

export type AmbientHueProps = {
  /** Empty chat canvas (any mode). */
  active: boolean;
  /** Keyboard / input focused — hue slides down and out. */
  keyboardActive: boolean;
  /** Chat mode — shifts the hue family. */
  mode?: AmbientHueMode;
  /** One-shot: arrive from onboarding edge layout → gather to center. */
  handoff?: boolean;
  onHandoffConsumed?: () => void;
};

export function AmbientHue({
  active,
  keyboardActive,
  mode = 'default',
  handoff = false,
  onHandoffConsumed,
}: AmbientHueProps) {
  const { isDark } = useTheme();
  const { ambientMotion } = useAmbientMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const slideY = useRef(new Animated.Value(0)).current;
  const focus = useRef(new Animated.Value(handoff ? 0 : 1)).current;
  const bloom = useRef(new Animated.Value(handoff ? 1.18 : 1)).current;
  const cross = useRef(new Animated.Value(1)).current;
  const steady = useRef(new Animated.Value(1)).current;
  const readyRef = useRef(false);
  const handoffPlayed = useRef(false);

  const [fromMode, setFromMode] = useState<AmbientHueMode>(mode);
  const [toMode, setToMode] = useState<AmbientHueMode>(mode);
  const [crossfading, setCrossfading] = useState(false);
  const toModeRef = useRef(mode);

  // Mode change — crossfade outgoing palette into the next
  useEffect(() => {
    if (mode === toModeRef.current) return;
    const prev = toModeRef.current;
    toModeRef.current = mode;
    setFromMode(prev);
    setToMode(mode);
    setCrossfading(true);
    cross.setValue(0);
    bloom.setValue(1.06);
    const anim = Animated.parallel([
      Animated.timing(cross, {
        toValue: 1,
        duration: MODE_CROSSFADE_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bloom, {
        toValue: 1,
        duration: MODE_CROSSFADE_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (!finished) return;
      setFromMode(mode);
      setCrossfading(false);
    });
    return () => anim.stop();
  }, [mode, cross, bloom]);

  // Show / hide + keyboard exit
  useEffect(() => {
    const show = active && !keyboardActive;
    if (!readyRef.current) {
      readyRef.current = true;
      if (handoff && active) {
        opacity.setValue(0.85);
        slideY.setValue(0);
      } else if (show) {
        opacity.setValue(0);
        slideY.setValue(0);
        Animated.timing(opacity, {
          toValue: 1,
          duration: 720,
          delay: 120,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }).start();
      } else {
        opacity.setValue(0);
        slideY.setValue(keyboardActive ? 140 : 0);
      }
      return;
    }

    if (show) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: OVERLAY_MOTION.FADE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(slideY, {
          toValue: 0,
          duration: OVERLAY_MOTION.SCALE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    if (keyboardActive && active) {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 320,
          easing: EASING.EASE_IN,
          useNativeDriver: true,
        }),
        Animated.timing(slideY, {
          toValue: Math.round(H * 0.22),
          duration: 380,
          easing: EASING.EASE_IN,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: OVERLAY_MOTION.FADE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(slideY, {
        toValue: 48,
        duration: OVERLAY_MOTION.SCALE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, keyboardActive, handoff, opacity, slideY]);

  // Onboarding → chat: gather edge energy into the middle
  useEffect(() => {
    if (!handoff || handoffPlayed.current) return;
    handoffPlayed.current = true;
    focus.setValue(0);
    bloom.setValue(1.2);
    Animated.parallel([
      Animated.timing(focus, {
        toValue: 1,
        duration: 900,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(bloom, {
        toValue: 1,
        duration: 900,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 700,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onHandoffConsumed?.();
    });
  }, [handoff, focus, bloom, opacity, onHandoffConsumed]);

  const [mounted, setMounted] = useState(active || handoff);
  useEffect(() => {
    if (active || handoff) {
      setMounted(true);
      return;
    }
    const t = setTimeout(() => setMounted(false), OVERLAY_MOTION.FADE_OUT_MS + 40);
    return () => clearTimeout(t);
  }, [active, handoff]);

  const outgoingOpacity = cross.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          opacity,
          transform: [{ translateY: slideY }, { scale: bloom }],
        },
      ]}
    >
      {crossfading && fromMode !== toMode ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <GlowLayer
            mode={fromMode}
            isDark={isDark}
            focus={focus}
            motionEnabled={ambientMotion}
            layerOpacity={outgoingOpacity}
          />
          <GlowLayer
            mode={toMode}
            isDark={isDark}
            focus={focus}
            motionEnabled={ambientMotion}
            layerOpacity={cross}
          />
        </View>
      ) : (
        <GlowLayer
          mode={toMode}
          isDark={isDark}
          focus={focus}
          motionEnabled={ambientMotion}
          layerOpacity={steady}
        />
      )}
      <HueGrain isDark={isDark} />
    </Animated.View>
  );
}
