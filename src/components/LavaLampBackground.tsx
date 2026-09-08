/**
 * Soft edge glow that drifts (lava-lamp feel).
 * Gold / fade-yellow along the rim; each guide page parks the hue in a
 * distinctly different region so page changes read as a real relocate.
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
import { EASING } from '../utils/animationConfig';

const { width: W, height: H } = Dimensions.get('window');

type GlowId = 'br' | 'bl' | 're' | 'le';

type GlowBase = {
  id: GlowId;
  width: number;
  height: number;
  left: number;
  top: number;
  color: string;
  peak: number;
  dx: number;
  dy: number;
  duration: number;
};

/** Per-page resting offsets from the base left/top — deliberately far apart. */
const PAGE_HOMES: Record<number, Record<GlowId, { x: number; y: number }>> = {
  // Step 0 — bottom-right pool (toward Next)
  0: {
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
    re: { x: 0, y: 0 },
    le: { x: 0, y: 0 },
  },
  // Step 1 — left / lower-left wash
  1: {
    br: { x: -W * 0.55, y: H * 0.08 },
    bl: { x: W * 0.42, y: -H * 0.12 },
    re: { x: -W * 0.6, y: H * 0.35 },
    le: { x: W * 0.45, y: H * 0.28 },
  },
  // Step 2 — mid-right / features list
  2: {
    br: { x: W * 0.08, y: -H * 0.22 },
    bl: { x: W * 0.55, y: -H * 0.18 },
    re: { x: -W * 0.35, y: H * 0.12 },
    le: { x: W * 0.15, y: H * 0.4 },
  },
  // Step 3 — top / upper (foundation pick)
  3: {
    br: { x: W * 0.12, y: -H * 0.48 },
    bl: { x: W * 0.2, y: -H * 0.4 },
    re: { x: -W * 0.15, y: -H * 0.05 },
    le: { x: W * 0.5, y: H * 0.15 },
  },
  // Step 4 — bottom-center gather (handoff toward chat)
  4: {
    br: { x: -W * 0.2, y: -H * 0.08 },
    bl: { x: W * 0.35, y: -H * 0.05 },
    re: { x: -W * 0.25, y: H * 0.32 },
    le: { x: W * 0.3, y: H * 0.38 },
  },
};

const PAGE_COUNT = 5;

function homeFor(step: number, id: GlowId) {
  const page = ((step % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;
  return PAGE_HOMES[page][id];
}

function SoftGlow({
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
  pulseKey,
}: GlowBase & { pulseKey: number }) {
  const idleTx = useRef(new Animated.Value(0)).current;
  const idleTy = useRef(new Animated.Value(0)).current;
  const homeTx = useRef(new Animated.Value(homeFor(pulseKey, id).x)).current;
  const homeTy = useRef(new Animated.Value(homeFor(pulseKey, id).y)).current;
  const bloom = useRef(new Animated.Value(1)).current;
  const wash = useRef(new Animated.Value(peak)).current;
  const reactId = useId().replace(/:/g, '');
  const gradId = `lava-${id}-${reactId}`;
  const mounted = useRef(false);

  // Idle drift around the current page home
  useEffect(() => {
    wash.setValue(peak);
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
            toValue: -dx * 0.55,
            duration: duration * 0.9,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: -dy * 0.45,
            duration: duration * 0.9,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(idleTx, {
            toValue: 0,
            duration: duration * 0.75,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(idleTy, {
            toValue: 0,
            duration: duration * 0.75,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dx, dy, duration, idleTx, idleTy, peak, wash]);

  // Page change — relocate to a new region (not a surge that returns home)
  useEffect(() => {
    const next = homeFor(pulseKey, id);
    if (!mounted.current) {
      mounted.current = true;
      homeTx.setValue(next.x);
      homeTy.setValue(next.y);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(homeTx, {
        toValue: next.x,
        duration: 880,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(homeTy, {
        toValue: next.y,
        duration: 880,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(bloom, {
          toValue: 1.12,
          duration: 420,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(bloom, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(wash, {
          toValue: Math.min(0.85, peak * 1.4),
          duration: 360,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(wash, {
          toValue: peak,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [pulseKey, id, homeTx, homeTy, bloom, wash, peak]);

  const translateX = Animated.add(idleTx, homeTx);
  const translateY = Animated.add(idleTy, homeTy);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        opacity: wash,
        transform: [{ translateX }, { translateY }, { scale: bloom }],
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%" stopColor={color} stopOpacity={1} />
            <Stop offset="35%" stopColor={color} stopOpacity={0.45} />
            <Stop offset="70%" stopColor={color} stopOpacity={0.12} />
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

type Props = {
  /** Guide step — each value parks the hue in a different region */
  pulseKey?: number;
};

export function LavaLampBackground({ pulseKey = 0 }: Props) {
  const { theme, isDark } = useTheme();

  const goldDeep = isDark ? '#E8C547' : '#C9A227';
  const goldSoft = isDark ? '#F0D78C' : '#E2C86A';
  const fadeYellow = isDark ? '#F5E6A3' : '#F0E4B0';

  const glows: GlowBase[] = useMemo(
    () => [
      {
        id: 'br',
        width: W * 1.4,
        height: H * 0.75,
        left: W * 0.02,
        top: H * 0.45,
        color: goldSoft,
        peak: isDark ? 0.5 : 0.3,
        dx: -48,
        dy: -56,
        duration: 7800,
      },
      {
        id: 'bl',
        width: W * 1.15,
        height: H * 0.62,
        left: -W * 0.48,
        top: H * 0.52,
        color: goldDeep,
        peak: isDark ? 0.36 : 0.2,
        dx: 56,
        dy: -40,
        duration: 9200,
      },
      {
        id: 're',
        width: W * 0.9,
        height: H * 0.58,
        left: W * 0.42,
        top: H * 0.08,
        color: fadeYellow,
        peak: isDark ? 0.28 : 0.16,
        dx: -36,
        dy: 64,
        duration: 10000,
      },
      {
        id: 'le',
        width: W * 0.8,
        height: H * 0.52,
        left: -W * 0.38,
        top: H * 0.05,
        color: goldSoft,
        peak: isDark ? 0.2 : 0.1,
        dx: 44,
        dy: 52,
        duration: 11000,
      },
    ],
    [goldDeep, goldSoft, fadeYellow, isDark],
  );

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}
    >
      {glows.map((g) => (
        <SoftGlow key={g.id} {...g} pulseKey={pulseKey} />
      ))}
      <Svg
        pointerEvents="none"
        width={W}
        height={H}
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <RadialGradient id="lava-center-veil" cx="50%" cy="28%" rx="70%" ry="45%">
            <Stop
              offset="0%"
              stopColor={theme.colors.background}
              stopOpacity={isDark ? 0.72 : 0.55}
            />
            <Stop
              offset="55%"
              stopColor={theme.colors.background}
              stopOpacity={isDark ? 0.25 : 0.18}
            />
            <Stop offset="100%" stopColor={theme.colors.background} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={W / 2}
          cy={H * 0.28}
          rx={W * 0.7}
          ry={H * 0.45}
          fill="url(#lava-center-veil)"
        />
      </Svg>
    </View>
  );
}
