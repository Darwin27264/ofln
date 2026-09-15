/**
 * Center-focused ambient hue for the empty chat canvas.
 * Palette shifts with chat mode (default gold, temporary violet, perspective teal)
 * via a soft crossfade — never an abrupt swap.
 * - Handoff from onboarding: edge energy gathers to the middle
 * - Cold empty chat: subtle fade-in after load
 * - Keyboard / input focus: slides down and fades out
 * - New empty chat: fades back in (any mode)
 */
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
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
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';

const { width: W, height: H } = Dimensions.get('window');

const MODE_CROSSFADE_MS = 480;

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
const AMBIENT_VIOLET = {
  deepDark: '#8B7CF6',
  softDark: '#B4A7FB',
  fadeDark: '#D4CCFD',
  deepLight: '#6D5BD0',
  softLight: '#9B8CE8',
  fadeLight: '#C5BBF0',
} as const;

/** Soft teal — multi-speaker / perspective mode. */
const AMBIENT_TEAL = {
  deepDark: '#2DB8A8',
  softDark: '#5ED4C6',
  fadeDark: '#A8EBE3',
  deepLight: '#1F9A8C',
  softLight: '#4AB8AA',
  fadeLight: '#9AD9D1',
} as const;

export type AmbientHueMode = 'default' | 'temporary' | 'perspective';

function paletteFor(mode: AmbientHueMode, isDark: boolean) {
  const p =
    mode === 'temporary'
      ? AMBIENT_VIOLET
      : mode === 'perspective'
        ? AMBIENT_TEAL
        : AMBIENT_GOLD;
  return {
    deep: isDark ? p.deepDark : p.deepLight,
    soft: isDark ? p.softDark : p.softLight,
    fade: isDark ? p.fadeDark : p.fadeLight,
  };
}

type GlowSpec = {
  id: string;
  width: number;
  height: number;
  left: number;
  top: number;
  edgeLeft: number;
  edgeTop: number;
  color: string;
  peak: number;
  dx: number;
  dy: number;
  duration: number;
};

function buildGlows(
  mode: AmbientHueMode,
  isDark: boolean,
): GlowSpec[] {
  const { deep, soft, fade } = paletteFor(mode, isDark);
  return [
    {
      id: 'core',
      width: W * 0.85,
      height: H * 0.4,
      left: W * 0.075,
      top: H * 0.26,
      edgeLeft: W * 0.18,
      edgeTop: H * 0.22,
      color: soft,
      peak: isDark ? 0.36 : 0.22,
      dx: -52,
      dy: 40,
      duration: 6200,
    },
    {
      id: 'core2',
      width: W * 0.55,
      height: H * 0.28,
      left: W * 0.22,
      top: H * 0.3,
      edgeLeft: W * 0.1,
      edgeTop: H * 0.12,
      color: fade,
      peak: isDark ? 0.24 : 0.15,
      dx: 40,
      dy: -34,
      duration: 7000,
    },
    {
      id: 'left',
      width: W * 0.62,
      height: H * 0.34,
      left: W * -0.06,
      top: H * 0.3,
      edgeLeft: -W * 0.28,
      edgeTop: H * 0.16,
      color: deep,
      peak: isDark ? 0.26 : 0.16,
      dx: 58,
      dy: -36,
      duration: 7400,
    },
    {
      id: 'left2',
      width: W * 0.45,
      height: H * 0.26,
      left: W * 0.05,
      top: H * 0.36,
      edgeLeft: -W * 0.15,
      edgeTop: H * 0.08,
      color: soft,
      peak: isDark ? 0.17 : 0.1,
      dx: -44,
      dy: 42,
      duration: 8200,
    },
    {
      id: 'right',
      width: W * 0.62,
      height: H * 0.34,
      left: W * 0.44,
      top: H * 0.28,
      edgeLeft: W * 0.32,
      edgeTop: H * 0.14,
      color: fade,
      peak: isDark ? 0.26 : 0.16,
      dx: -54,
      dy: 48,
      duration: 6800,
    },
    {
      id: 'right2',
      width: W * 0.42,
      height: H * 0.24,
      left: W * 0.48,
      top: H * 0.34,
      edgeLeft: W * 0.18,
      edgeTop: H * 0.06,
      color: deep,
      peak: isDark ? 0.17 : 0.1,
      dx: 38,
      dy: -40,
      duration: 7600,
    },
    {
      id: 'low',
      width: W * 0.72,
      height: H * 0.3,
      left: W * 0.14,
      top: H * 0.4,
      edgeLeft: 0,
      edgeTop: H * 0.28,
      color: soft,
      peak: isDark ? 0.19 : 0.11,
      dx: 36,
      dy: -50,
      duration: 8000,
    },
    {
      id: 'low2',
      width: W * 0.5,
      height: H * 0.24,
      left: W * 0.25,
      top: H * 0.44,
      edgeLeft: W * 0.05,
      edgeTop: H * 0.15,
      color: fade,
      peak: isDark ? 0.15 : 0.09,
      dx: -42,
      dy: 36,
      duration: 7200,
    },
    {
      id: 'mid',
      width: W * 0.7,
      height: H * 0.32,
      left: W * 0.15,
      top: H * 0.33,
      edgeLeft: W * 0.08,
      edgeTop: H * 0.1,
      color: soft,
      peak: isDark ? 0.15 : 0.09,
      dx: 48,
      dy: 28,
      duration: 8500,
    },
  ];
}

function CenterGlow({
  id,
  width,
  height,
  left,
  top,
  edgeLeft,
  edgeTop,
  color,
  peak,
  dx,
  dy,
  duration,
  focus,
}: GlowSpec & { focus: Animated.Value }) {
  const idleTx = useRef(new Animated.Value(0)).current;
  const idleTy = useRef(new Animated.Value(0)).current;
  const reactId = useId().replace(/:/g, '');
  const gradId = `ambient-${id}-${reactId}`;

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
            toValue: -dx * 0.75,
            duration: duration * 0.85,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: -dy * 0.7,
            duration: duration * 0.85,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(idleTx, {
            toValue: dx * 0.35,
            duration: duration * 0.7,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: -dy * 0.3,
            duration: duration * 0.7,
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

  const gatherX = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [edgeLeft, 0],
  });
  const gatherY = focus.interpolate({
    inputRange: [0, 1],
    outputRange: [edgeTop, 0],
  });

  const translateX = Animated.add(idleTx, gatherX);
  const translateY = Animated.add(idleTy, gatherY);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        opacity: peak,
        transform: [{ translateX }, { translateY }],
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={0.7} />
            <Stop offset="28%" stopColor={color} stopOpacity={0.32} />
            <Stop offset="58%" stopColor={color} stopOpacity={0.1} />
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

function GlowLayer({
  mode,
  isDark,
  focus,
  layerOpacity,
}: {
  mode: AmbientHueMode;
  isDark: boolean;
  focus: Animated.Value;
  layerOpacity: Animated.AnimatedInterpolation<number> | Animated.Value;
}) {
  const glows = useMemo(() => buildGlows(mode, isDark), [mode, isDark]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { opacity: layerOpacity }]}
    >
      {glows.map((g) => (
        <CenterGlow key={`${mode}-${g.id}`} {...g} focus={focus} />
      ))}
    </Animated.View>
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
            layerOpacity={outgoingOpacity}
          />
          <GlowLayer
            mode={toMode}
            isDark={isDark}
            focus={focus}
            layerOpacity={cross}
          />
        </View>
      ) : (
        <GlowLayer
          mode={toMode}
          isDark={isDark}
          focus={focus}
          layerOpacity={steady}
        />
      )}
    </Animated.View>
  );
}
