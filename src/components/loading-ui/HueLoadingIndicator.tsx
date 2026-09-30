/**
 * Customized ambient hue moving & breathing animation behind frosted glass
 * for LLM response loading.
 *
 * Design matches the app's ambient styling (like EdgeGlow behind FrostedGlass
 * on the Settings screen):
 * - Continuous, left-to-right harmonic breathing motion in an endless seamless loop
 * - Dual phased hue blooms that sweep gracefully from left to right
 * - Zero animation jumps: seamless boundary wrap with zero-opacity handoff
 * - Shared Gaussian falloff radial gradients (hue/hueTokens.ts) behind native
 *   frosted glass
 * - 100% GPU-accelerated (useNativeDriver: true)
 *
 * Not gated by the Ambient motion preference: this is response progress, not
 * idle ambience, and it is the only signal that generation is still running.
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
import { useTheme } from '../../context/ThemeContext';
import { FrostedGlass, FROSTED_GLASS } from '../FrostedGlass';
import { huePalette, type HueMode } from '../hue';
import { HueBloomLayer } from './HueBloomLayer';
import {
  buildCenterPulseKeyframes,
  buildLeftToRightWave,
} from './waveInterpolation';

export type { HueMode };

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

export const HueLoadingIndicator: React.FC<HueLoadingIndicatorProps> = React.memo(({
  width = 56,
  height = 26,
  mode = 'default',
  color,
  style,
  accessibilityLabel = 'Generating response',
}) => {
  const { isDark } = useTheme();
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

  const palette = huePalette(mode, isDark);
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
    const minCenterOp = isDark ? 0.32 : 0.22;
    const maxCenterOp = isDark ? 0.52 : 0.40;
    const { cInput, cOpacity, cScale } = buildCenterPulseKeyframes(minCenterOp, maxCenterOp);

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
          <HueBloomLayer
            svgW={svgW}
            svgH={svgH}
            gradId={gradIdC}
            color={fadeColor}
            stopStrength={0.65}
            rxRatio={0.36}
            ryRatio={0.42}
          />
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
          <HueBloomLayer
            svgW={svgW}
            svgH={svgH}
            gradId={gradIdA}
            color={softColor}
            stopStrength={0.92}
            rxRatio={0.46}
            ryRatio={0.48}
          />
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
          <HueBloomLayer
            svgW={svgW}
            svgH={svgH}
            gradId={gradIdB}
            color={deepColor}
            stopStrength={0.84}
            rxRatio={0.48}
            ryRatio={0.48}
          />
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
