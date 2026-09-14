/**
 * Customized ambient hue moving & breathing animation behind frosted glass
 * for LLM response loading.
 *
 * Design matches the app's ambient styling (like EdgeGlow behind FrostedGlass
 * on the Settings screen):
 * - Continuous, left-to-right harmonic breathing motion in an endless seamless loop
 * - Dual phased hue blooms that sweep gracefully from left to right
 * - Zero animation jumps: seamless boundary wrap with zero-opacity handoff
 * - Soft polynomial falloff radial gradients behind native frosted glass
 * - 100% GPU-accelerated (useNativeDriver: true)
 */

import React, { useEffect, useId, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  RadialGradient,
  Stop,
} from 'react-native-svg';
import { useTheme } from '../../context/ThemeContext';
import { FrostedGlass, FROSTED_GLASS } from '../FrostedGlass';
import { AMBIENT_GOLD } from '../AmbientHue';

export type HueMode = 'default' | 'temporary' | 'perspective';

export type HueLoadingIndicatorProps = {
  /** Capsule width in dp (default 56). */
  width?: number;
  /** Capsule height in dp (default 26). */
  height?: number;
  /** Palette mode matching chat mode. Defaults to 'default' (ambient gold). */
  mode?: HueMode;
  /** Optional custom base color override. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

// Palettes matching AmbientHue and EdgeGlow
const PALETTES = {
  default: {
    dark: {
      deep: AMBIENT_GOLD.deepDark,
      soft: AMBIENT_GOLD.softDark,
      fade: AMBIENT_GOLD.fadeDark,
    },
    light: {
      deep: AMBIENT_GOLD.deepLight,
      soft: AMBIENT_GOLD.softLight,
      fade: AMBIENT_GOLD.fadeLight,
    },
  },
  temporary: {
    dark: { deep: '#8B7CF6', soft: '#B4A7FB', fade: '#D4CCFD' },
    light: { deep: '#6D5BD0', soft: '#9B8CE8', fade: '#C5BBF0' },
  },
  perspective: {
    dark: { deep: '#2DB8A8', soft: '#5ED4C6', fade: '#A8EBE3' },
    light: { deep: '#1F9A8C', soft: '#4AB8AA', fade: '#9AD9D1' },
  },
} as const;

/**
 * Computes seamless left-to-right wave keyframes with zero boundary jumps.
 * Wrap occurs at zero opacity, making the reset completely invisible to the eye.
 */
function buildLeftToRightWave(
  phaseOffset: number,
  travelDist: number,
  maxTy: number,
  minScale: number,
  maxScale: number,
  maxOpacity: number,
) {
  const SAMPLES = 32;
  const steps: number[] = [];
  for (let i = 0; i <= SAMPLES; i++) {
    steps.push(i / SAMPLES);
  }

  // Wrap occurs when (p + phaseOffset) reaches 1.0.
  // Add fine guard points immediately before and after wrap point so opacity is 0 during reset.
  const wrapP = (1.0 - phaseOffset + 1.0) % 1.0;
  if (wrapP > 0.001 && wrapP < 0.999) {
    steps.push(wrapP - 0.0001);
    steps.push(wrapP + 0.0001);
  }
  if (phaseOffset === 0) {
    steps.push(0.9999);
  }

  steps.sort((a, b) => a - b);
  const uniqueSteps = steps.filter((v, idx) => idx === 0 || v - steps[idx - 1] > 0.00005);

  const inputRange: number[] = [];
  const rangeX: number[] = [];
  const rangeY: number[] = [];
  const rangeScale: number[] = [];
  const rangeOpacity: number[] = [];

  for (const p of uniqueSteps) {
    inputRange.push(p);

    let localP = p + phaseOffset;
    if (localP >= 1.0 && p < wrapP) localP -= 1.0;
    else if (localP > 1.0) localP -= 1.0;
    if (p === 1.0 && phaseOffset === 0) localP = 1.0;
    if (Math.abs(p - (wrapP - 0.0001)) < 0.00001) localP = 1.0;
    if (Math.abs(p - (wrapP + 0.0001)) < 0.00001) localP = 0.0;

    // Travel exclusively from -travelDist (left) to +travelDist (right)
    const x = -travelDist + 2 * travelDist * localP;
    rangeX.push(Math.round(x * 100) / 100);

    // Subtle harmonic vertical float
    const y = maxTy * Math.sin(2 * Math.PI * localP);
    rangeY.push(Math.round(y * 100) / 100);

    // Smooth bell-shaped opacity window: 0 at left edge, peak in center, 0 at right edge
    const window = Math.pow(Math.sin(Math.PI * localP), 2);
    rangeOpacity.push(Math.round(maxOpacity * window * 1000) / 1000);

    // Harmonic breathing scale: expands in the center, contracts at edges
    const sc = minScale + (maxScale - minScale) * window;
    rangeScale.push(Math.round(sc * 1000) / 1000);
  }

  return { inputRange, rangeX, rangeY, rangeScale, rangeOpacity };
}

export const HueLoadingIndicator: React.FC<HueLoadingIndicatorProps> = React.memo(({
  width = 56,
  height = 26,
  mode = 'default',
  color,
  style,
  accessibilityLabel = 'Generating response',
}) => {
  const { theme, isDark } = useTheme();
  const reactId = useId().replace(/:/g, '');
  const gradIdA = `hue-loader-a-${reactId}`;
  const gradIdB = `hue-loader-b-${reactId}`;
  const gradIdC = `hue-loader-c-${reactId}`;

  // Single continuous, linear progress clock driving the left-to-right sweep
  const loopProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopAnim = Animated.loop(
      Animated.timing(loopProgress, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loopAnim.start();
    return () => loopAnim.stop();
  }, [loopProgress]);

  const scheme = isDark ? 'dark' : 'light';
  const palette = PALETTES[mode] ? PALETTES[mode][scheme] : PALETTES.default[scheme];
  const deepColor = color || palette.deep;
  const softColor = color || palette.soft;
  const fadeColor = color || palette.fade;

  // Generous bleed margins so the radial gradients never clip at the SVG edge
  const padX = Math.round(width * 0.4);
  const padY = Math.round(height * 0.35);
  const svgW = width + padX * 2;
  const svgH = height + padY * 2;

  // Left-to-right sweep distance (well beyond capsule edges for seamless fading)
  const travelDist = Math.round(width * 0.72);
  const maxTy = Math.max(1, Math.round(height * 0.08));
  const maxOpacity = isDark ? 0.94 : 0.86;

  // Interpolations for Wave A and Wave B (interleaved by 50% phase offset)
  const { waveA, waveB, centerPulse } = useMemo(() => {
    const dataA = buildLeftToRightWave(0, travelDist, maxTy, 0.94, 1.12, maxOpacity);
    const dataB = buildLeftToRightWave(0.5, travelDist, -maxTy, 0.94, 1.10, maxOpacity * 0.9);

    // Center resting bloom subtle breathing
    const SAMPLES = 16;
    const cInput: number[] = [];
    const cOpacity: number[] = [];
    const cScale: number[] = [];
    const minCenterOp = isDark ? 0.32 : 0.22;
    const maxCenterOp = isDark ? 0.52 : 0.40;

    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      cInput.push(p);
      const b = (1 - Math.cos(2 * Math.PI * p)) / 2;
      cOpacity.push(Math.round((minCenterOp + (maxCenterOp - minCenterOp) * b) * 1000) / 1000);
      cScale.push(Math.round((0.96 + 0.08 * b) * 1000) / 1000);
    }

    return {
      waveA: {
        x: loopProgress.interpolate({ inputRange: dataA.inputRange, outputRange: dataA.rangeX }),
        y: loopProgress.interpolate({ inputRange: dataA.inputRange, outputRange: dataA.rangeY }),
        scale: loopProgress.interpolate({ inputRange: dataA.inputRange, outputRange: dataA.rangeScale }),
        opacity: loopProgress.interpolate({ inputRange: dataA.inputRange, outputRange: dataA.rangeOpacity }),
      },
      waveB: {
        x: loopProgress.interpolate({ inputRange: dataB.inputRange, outputRange: dataB.rangeX }),
        y: loopProgress.interpolate({ inputRange: dataB.inputRange, outputRange: dataB.rangeY }),
        scale: loopProgress.interpolate({ inputRange: dataB.inputRange, outputRange: dataB.rangeScale }),
        opacity: loopProgress.interpolate({ inputRange: dataB.inputRange, outputRange: dataB.rangeOpacity }),
      },
      centerPulse: {
        scale: loopProgress.interpolate({ inputRange: cInput, outputRange: cScale }),
        opacity: loopProgress.interpolate({ inputRange: cInput, outputRange: cOpacity }),
      },
    };
  }, [travelDist, maxTy, maxOpacity, isDark, loopProgress]);

  const borderRadius = Math.round(height / 2);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.capsule,
        {
          width,
          height,
          borderRadius,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        },
        style,
      ]}
    >
      {/* Layer 1: Ambient Hue moving and breathing BEHIND the frosted glass */}
      <View
        pointerEvents="none"
        style={[
          styles.bleedContainer,
          {
            top: -padY,
            left: -padX,
            width: svgW,
            height: svgH,
          },
        ]}
      >
        {/* Layer 1A: Soft resting center ambient bloom (always provides rich core light) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: centerPulse.opacity,
              transform: [{ scale: centerPulse.scale }],
            },
          ]}
        >
          <Svg width={svgW} height={svgH}>
            <Defs>
              <RadialGradient id={gradIdC} cx="50%" cy="50%" rx="36%" ry="42%">
                <Stop offset="0%" stopColor={fadeColor} stopOpacity={0.65} />
                <Stop offset="45%" stopColor={fadeColor} stopOpacity={0.25} />
                <Stop offset="85%" stopColor={fadeColor} stopOpacity={0.04} />
                <Stop offset="100%" stopColor={fadeColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={svgW * 0.5}
              cy={svgH * 0.5}
              rx={svgW * 0.36}
              ry={svgH * 0.42}
              fill={`url(#${gradIdC})`}
            />
          </Svg>
        </Animated.View>

        {/* Layer 1B: Wave A — Primary harmonic bloom sweeping left to right */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: waveA.opacity,
              transform: [
                { translateX: waveA.x },
                { translateY: waveA.y },
                { scale: waveA.scale },
              ],
            },
          ]}
        >
          <Svg width={svgW} height={svgH}>
            <Defs>
              <RadialGradient id={gradIdA} cx="50%" cy="50%" rx="46%" ry="48%">
                <Stop offset="0%" stopColor={softColor} stopOpacity={0.92} />
                <Stop offset="26%" stopColor={softColor} stopOpacity={0.58} />
                <Stop offset="58%" stopColor={softColor} stopOpacity={0.20} />
                <Stop offset="84%" stopColor={softColor} stopOpacity={0.04} />
                <Stop offset="100%" stopColor={softColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={svgW * 0.5}
              cy={svgH * 0.5}
              rx={svgW * 0.46}
              ry={svgH * 0.48}
              fill={`url(#${gradIdA})`}
            />
          </Svg>
        </Animated.View>

        {/* Layer 1C: Wave B — Deep harmonic bloom sweeping left to right (interleaved) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: waveB.opacity,
              transform: [
                { translateX: waveB.x },
                { translateY: waveB.y },
                { scale: waveB.scale },
              ],
            },
          ]}
        >
          <Svg width={svgW} height={svgH}>
            <Defs>
              <RadialGradient id={gradIdB} cx="50%" cy="50%" rx="48%" ry="48%">
                <Stop offset="0%" stopColor={deepColor} stopOpacity={0.84} />
                <Stop offset="30%" stopColor={deepColor} stopOpacity={0.48} />
                <Stop offset="62%" stopColor={deepColor} stopOpacity={0.16} />
                <Stop offset="100%" stopColor={deepColor} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={svgW * 0.5}
              cy={svgH * 0.5}
              rx={svgW * 0.48}
              ry={svgH * 0.48}
              fill={`url(#${gradIdB})`}
            />
          </Svg>
        </Animated.View>
      </View>

      {/* Layer 2: Native FrostedGlass blur layer diffusing the hue rays */}
      <FrostedGlass
        style={StyleSheet.absoluteFillObject}
        blurAmount={FROSTED_GLASS.chromeBlurAmount}
        tintOpacity={isDark ? 0.32 : 0.22}
      />
    </View>
  );
});

HueLoadingIndicator.displayName = 'HueLoadingIndicator';

const styles = StyleSheet.create({
  capsule: {
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bleedContainer: {
    position: 'absolute',
  },
});
