/**
 * Soft edge glow that drifts (lava-lamp feel).
 * Dense overlapping radials so individual discs don't read; gold / fade-yellow.
 * Each guide page parks the wash in a different region.
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

type Region = 'br' | 'bl' | 're' | 'le';

type GlowBase = {
  id: string;
  region: Region;
  /** Extra offset on top of the page-region home */
  jitterX?: number;
  jitterY?: number;
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

/** Per-page resting offsets — deliberately far apart. */
const PAGE_HOMES: Record<number, Record<Region, { x: number; y: number }>> = {
  0: {
    br: { x: 0, y: 0 },
    bl: { x: 0, y: 0 },
    re: { x: 0, y: 0 },
    le: { x: 0, y: 0 },
  },
  1: {
    br: { x: -W * 0.55, y: H * 0.08 },
    bl: { x: W * 0.42, y: -H * 0.12 },
    re: { x: -W * 0.6, y: H * 0.35 },
    le: { x: W * 0.45, y: H * 0.28 },
  },
  2: {
    br: { x: W * 0.08, y: -H * 0.22 },
    bl: { x: W * 0.55, y: -H * 0.18 },
    re: { x: -W * 0.35, y: H * 0.12 },
    le: { x: W * 0.15, y: H * 0.4 },
  },
  3: {
    br: { x: W * 0.12, y: -H * 0.48 },
    bl: { x: W * 0.2, y: -H * 0.4 },
    re: { x: -W * 0.15, y: -H * 0.05 },
    le: { x: W * 0.5, y: H * 0.15 },
  },
  4: {
    br: { x: -W * 0.2, y: -H * 0.08 },
    bl: { x: W * 0.35, y: -H * 0.05 },
    re: { x: -W * 0.25, y: H * 0.32 },
    le: { x: W * 0.3, y: H * 0.38 },
  },
};

const PAGE_COUNT = 5;

function homeFor(step: number, region: Region, jitterX = 0, jitterY = 0) {
  const page = ((step % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;
  const h = PAGE_HOMES[page][region];
  return { x: h.x + jitterX, y: h.y + jitterY };
}

function SoftGlow({
  id,
  region,
  jitterX = 0,
  jitterY = 0,
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
  const initial = homeFor(pulseKey, region, jitterX, jitterY);
  const homeTx = useRef(new Animated.Value(initial.x)).current;
  const homeTy = useRef(new Animated.Value(initial.y)).current;
  const bloom = useRef(new Animated.Value(1)).current;
  const wash = useRef(new Animated.Value(peak)).current;
  const reactId = useId().replace(/:/g, '');
  const gradId = `lava-${id}-${reactId}`;
  const mounted = useRef(false);

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
  }, [dx, dy, duration, idleTx, idleTy, peak, wash]);

  useEffect(() => {
    const next = homeFor(pulseKey, region, jitterX, jitterY);
    if (!mounted.current) {
      mounted.current = true;
      homeTx.setValue(next.x);
      homeTy.setValue(next.y);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(homeTx, {
        toValue: next.x,
        duration: 720,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(homeTy, {
        toValue: next.y,
        duration: 720,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(bloom, {
          toValue: 1.16,
          duration: 360,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(bloom, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(wash, {
          toValue: Math.min(0.75, peak * 1.55),
          duration: 300,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(wash, {
          toValue: peak,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [pulseKey, region, jitterX, jitterY, homeTx, homeTy, bloom, wash, peak]);

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
      // Bottom-right cluster
      {
        id: 'br',
        region: 'br',
        width: W * 1.35,
        height: H * 0.7,
        left: W * 0.05,
        top: H * 0.46,
        color: goldSoft,
        peak: isDark ? 0.34 : 0.2,
        dx: -92,
        dy: -108,
        duration: 5200,
      },
      {
        id: 'br2',
        region: 'br',
        jitterX: -W * 0.12,
        jitterY: -H * 0.06,
        width: W * 0.85,
        height: H * 0.48,
        left: W * 0.22,
        top: H * 0.52,
        color: fadeYellow,
        peak: isDark ? 0.22 : 0.13,
        dx: 70,
        dy: -80,
        duration: 6100,
      },
      {
        id: 'br3',
        region: 'br',
        jitterX: W * 0.08,
        jitterY: H * 0.05,
        width: W * 0.7,
        height: H * 0.4,
        left: W * 0.28,
        top: H * 0.58,
        color: goldDeep,
        peak: isDark ? 0.18 : 0.1,
        dx: -60,
        dy: 72,
        duration: 6800,
      },
      // Bottom-left cluster
      {
        id: 'bl',
        region: 'bl',
        width: W * 1.1,
        height: H * 0.58,
        left: -W * 0.42,
        top: H * 0.5,
        color: goldDeep,
        peak: isDark ? 0.26 : 0.14,
        dx: 100,
        dy: -72,
        duration: 5600,
      },
      {
        id: 'bl2',
        region: 'bl',
        jitterX: W * 0.1,
        jitterY: -H * 0.08,
        width: W * 0.75,
        height: H * 0.42,
        left: -W * 0.2,
        top: H * 0.58,
        color: goldSoft,
        peak: isDark ? 0.16 : 0.09,
        dx: -68,
        dy: 64,
        duration: 7200,
      },
      // Right edge cluster
      {
        id: 're',
        region: 're',
        width: W * 0.95,
        height: H * 0.55,
        left: W * 0.4,
        top: H * 0.1,
        color: fadeYellow,
        peak: isDark ? 0.22 : 0.12,
        dx: -78,
        dy: 110,
        duration: 6000,
      },
      {
        id: 're2',
        region: 're',
        jitterX: -W * 0.08,
        jitterY: H * 0.1,
        width: W * 0.65,
        height: H * 0.4,
        left: W * 0.52,
        top: H * 0.22,
        color: goldSoft,
        peak: isDark ? 0.14 : 0.08,
        dx: 55,
        dy: -90,
        duration: 7000,
      },
      // Left edge cluster
      {
        id: 'le',
        region: 'le',
        width: W * 0.85,
        height: H * 0.5,
        left: -W * 0.35,
        top: H * 0.06,
        color: goldSoft,
        peak: isDark ? 0.16 : 0.09,
        dx: 88,
        dy: 96,
        duration: 6400,
      },
      {
        id: 'le2',
        region: 'le',
        jitterX: W * 0.1,
        jitterY: H * 0.08,
        width: W * 0.6,
        height: H * 0.38,
        left: -W * 0.18,
        top: H * 0.16,
        color: goldDeep,
        peak: isDark ? 0.12 : 0.07,
        dx: -50,
        dy: -70,
        duration: 7600,
      },
      // Soft mid fillers — stitch clusters together
      {
        id: 'mid',
        region: 'br',
        jitterX: -W * 0.25,
        jitterY: -H * 0.2,
        width: W * 0.9,
        height: H * 0.5,
        left: W * 0.05,
        top: H * 0.32,
        color: fadeYellow,
        peak: isDark ? 0.12 : 0.07,
        dx: 64,
        dy: 58,
        duration: 8000,
      },
      {
        id: 'mid2',
        region: 'bl',
        jitterX: W * 0.2,
        jitterY: -H * 0.15,
        width: W * 0.8,
        height: H * 0.45,
        left: W * 0.1,
        top: H * 0.38,
        color: goldSoft,
        peak: isDark ? 0.1 : 0.06,
        dx: -72,
        dy: -48,
        duration: 7400,
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
