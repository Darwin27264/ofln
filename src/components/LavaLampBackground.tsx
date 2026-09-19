/**
 * Soft edge glow that drifts (lava-lamp feel) behind the onboarding guide.
 * Each guide page parks the wash in a different region.
 *
 * Composes `HueBlob` directly rather than `HueField` because every blob owns
 * animated state of its own (its per-page home, plus the bloom/brighten pulse
 * when the page changes).
 *
 * Four oversized blobs replace the eleven this used to stack — one per region.
 * With a Gaussian falloff each blob covers a whole quadrant, so the extra
 * "stitching" fillers that used to hide the seams have nothing left to hide.
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
import { EASING } from '../utils/animationConfig';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';
import { HueBlob, HueGrain, huePalette, type HueBlobSpec } from './hue';

const { width: W, height: H } = Dimensions.get('window');

type Region = 'br' | 'bl' | 're' | 'le';

type LavaBlob = HueBlobSpec & { region: Region };

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

/**
 * Brightness gain at the peak of the page-change pulse. `HueBlob` opacity is a
 * 0–1 multiplier (values above 1 would just clamp), so headroom comes from
 * baking `peak * PULSE_GAIN` into the gradient and resting the layer below 1.
 */
const PULSE_GAIN = 1.5;
const REST_WASH = 1 / PULSE_GAIN;

function homeFor(step: number, region: Region) {
  const page = ((step % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;
  return PAGE_HOMES[page][region];
}

/**
 * One region blob that slides to a new home, blooms and brightens when the
 * guide page changes.
 */
function LavaBlobView({
  blob,
  pulseKey,
  motionEnabled,
}: {
  blob: LavaBlob;
  pulseKey: number;
  motionEnabled: boolean;
}) {
  const { region } = blob;
  const initial = homeFor(pulseKey, region);
  const homeX = useRef(new Animated.Value(initial.x)).current;
  const homeY = useRef(new Animated.Value(initial.y)).current;
  const bloom = useRef(new Animated.Value(1)).current;
  const wash = useRef(new Animated.Value(REST_WASH)).current;
  const mounted = useRef(false);

  useEffect(() => {
    const next = homeFor(pulseKey, region);
    if (!mounted.current) {
      mounted.current = true;
      homeX.setValue(next.x);
      homeY.setValue(next.y);
      return;
    }
    const anim = Animated.parallel([
      Animated.timing(homeX, {
        toValue: next.x,
        duration: 720,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(homeY, {
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
          toValue: 1,
          duration: 300,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(wash, {
          toValue: REST_WASH,
          duration: 800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [pulseKey, region, homeX, homeY, bloom, wash]);

  return (
    <HueBlob
      {...blob}
      peak={blob.peak * PULSE_GAIN}
      offsetX={homeX}
      offsetY={homeY}
      scale={bloom}
      opacity={wash}
      motionEnabled={motionEnabled}
    />
  );
}

type Props = {
  /** Guide step — each value parks the hue in a different region */
  pulseKey?: number;
};

export function LavaLampBackground({ pulseKey = 0 }: Props) {
  const { theme, isDark } = useTheme();
  const { ambientMotion } = useAmbientMotion();

  const blobs: LavaBlob[] = useMemo(() => {
    const { deep, soft, fade } = huePalette('default', isDark);
    return [
      {
        id: 'br',
        region: 'br',
        width: W * 2.1,
        height: H * 1.1,
        left: -W * 0.3,
        top: H * 0.25,
        color: soft,
        peak: isDark ? 0.17 : 0.1,
        dx: -92,
        dy: -108,
        duration: 5200,
      },
      {
        id: 'bl',
        region: 'bl',
        width: W * 1.7,
        height: H * 0.9,
        left: -W * 0.72,
        top: H * 0.34,
        color: deep,
        peak: isDark ? 0.13 : 0.075,
        dx: 100,
        dy: -72,
        duration: 5600,
      },
      {
        id: 're',
        region: 're',
        width: W * 1.5,
        height: H * 0.86,
        left: W * 0.12,
        top: -H * 0.05,
        color: fade,
        peak: isDark ? 0.12 : 0.065,
        dx: -78,
        dy: 110,
        duration: 6000,
      },
      {
        id: 'le',
        region: 'le',
        width: W * 1.35,
        height: H * 0.8,
        left: -W * 0.6,
        top: -H * 0.08,
        color: soft,
        peak: isDark ? 0.09 : 0.05,
        dx: 88,
        dy: 96,
        duration: 6400,
      },
    ];
  }, [isDark]);

  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}
    >
      {blobs.map((blob) => (
        <LavaBlobView
          key={blob.id}
          blob={blob}
          pulseKey={pulseKey}
          motionEnabled={ambientMotion}
        />
      ))}
      <HueGrain isDark={isDark} />
      {/* Keeps the guide copy in the upper-middle legible over the wash. */}
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
