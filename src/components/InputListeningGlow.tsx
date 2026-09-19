/**
 * Dynamic radiant glow rendered strictly inside the chat input bar while
 * listening for voice input.
 *
 * Design:
 * - Contained 100% inside the input bar capsule (borderRadius: 28, overflow: 'hidden')
 * - Fades in and blooms outward from the right side (where the voice button sits)
 * - On finish/turn off, smoothly animates going back to the right side (reversed entrance)
 * - Continuous, seamless harmonic loop with zero jumps (sinusoidal in-out ping-pong)
 * - Gradient density calibrated so left side (text area) remains crystal-clear and high-contrast
 * - Blooms use the shared Gaussian falloff (hue/hueTokens.ts) plus grain, so they
 *   dissolve into the capsule instead of showing a visible disc rim
 * - Dual-bloom radiant harmonic sweep + breathing ambient wash (ambient gold)
 * - Inner glowing rim along the capsule contour that pulses in tandem with breathing
 * - 100% GPU-accelerated motion (useNativeDriver: true)
 * - pointerEvents="none" so text input and action buttons remain completely unobstructed
 */

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  LinearGradient,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { useTheme } from '../context/ThemeContext';
import { HueGrain, huePalette, hueRampStops } from './hue';

export type InputListeningGlowProps = {
  /** Whether the input bar is currently listening for voice input. */
  active: boolean;
  style?: StyleProp<ViewStyle>;
};

export const InputListeningGlow = React.memo(function InputListeningGlow({
  active,
  style,
}: InputListeningGlowProps) {
  const { isDark } = useTheme();
  const rawId = useId();
  const safeId = useMemo(() => rawId.replace(/[^a-zA-Z0-9_-]/g, '_'), [rawId]);
  const baseGradId = `listenGradBase_${safeId}`;
  const micBloomGradId = `listenGradMic_${safeId}`;
  const driftBloomGradId = `listenGradDrift_${safeId}`;

  const colors = useMemo(() => huePalette('default', isDark), [isDark]);

  // Shared falloff (see hue/hueTokens.ts) so the blooms inside the capsule
  // dissolve instead of showing a rim, blending pale core → burnt rim.
  const micBloomStops = useMemo(
    () =>
      hueRampStops(isDark ? 0.62 : 0.44, [colors.fade, colors.soft, colors.deep]),
    [isDark, colors],
  );
  const driftBloomStops = useMemo(
    () => hueRampStops(isDark ? 0.42 : 0.28, [colors.soft, colors.deep]),
    [isDark, colors],
  );

  // Keep rendered while active or fading/retracting out
  const [visible, setVisible] = useState(active);

  const [layout, setLayout] = useState({ width: 300, height: 54 });
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (width > 10 && height > 10) {
      setLayout(prev => {
        if (Math.abs(prev.width - width) < 1 && Math.abs(prev.height - height) < 1) {
          return prev;
        }
        return { width, height };
      });
    }
  }, []);

  // Animation values
  const fadeAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  // Directional sweep between right button (0) and full expansion (1)
  const enterFromRightAnim = useRef(new Animated.Value(active ? 1 : 0)).current;
  // Continuous idle motion (zero jump sinusoidal loops)
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const sweepAnim = useRef(new Animated.Value(0)).current;

  // Active animation controllers
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (active) {
      setVisible(true);

      // Start continuous harmonic loops with smooth zero-velocity endpoints
      if (!loopRef.current) {
        const pulseLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(pulseAnim, {
              toValue: 1,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(pulseAnim, {
              toValue: 0,
              duration: 1200,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );

        const sweepLoop = Animated.loop(
          Animated.sequence([
            Animated.timing(sweepAnim, {
              toValue: 1,
              duration: 1600,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(sweepAnim, {
              toValue: 0,
              duration: 1600,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ])
        );

        const parallelLoops = Animated.parallel([pulseLoop, sweepLoop]);
        loopRef.current = parallelLoops;
        parallelLoops.start();
      }

      // Entrance animation: blooms out from the right voice button to the left
      Animated.parallel([
        Animated.timing(enterFromRightAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Exit animation: smoothly animates going back to the right side (reversed entrance)
      Animated.parallel([
        Animated.timing(enterFromRightAnim, {
          toValue: 0,
          duration: 340,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 340,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          if (loopRef.current) {
            loopRef.current.stop();
            loopRef.current = null;
          }
          pulseAnim.setValue(0);
          sweepAnim.setValue(0);
          setVisible(false);
        }
      });
    }

    return () => {
      if (loopRef.current) {
        loopRef.current.stop();
        loopRef.current = null;
      }
    };
  }, [active, enterFromRightAnim, fadeAnim, pulseAnim, sweepAnim]);

  if (!visible) {
    return null;
  }

  const { width, height } = layout;
  // Primary bloom centered around right side voice button
  const micBloomW = Math.max(160, width * 0.75);
  const micBloomH = Math.max(54, height * 1.8);

  // Secondary soft drifting wave bloom
  const driftBloomW = Math.max(110, width * 0.45);
  const driftBloomH = Math.max(54, height * 1.4);

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={onLayout}
      style={[
        styles.container,
        style,
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {/* Master Directional Wrapper: animates blooms in from right, and back into right on exit */}
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          {
            opacity: fadeAnim,
            transform: [
              {
                translateX: enterFromRightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width * 0.48, 0],
                }),
              },
              {
                scaleX: enterFromRightAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.35, 1],
                }),
              },
            ],
          },
        ]}
      >
        {/* Layer 1: Base linear radiant wash - directional from right button across */}
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              opacity: pulseAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.75, 1, 0.75],
              }),
            },
          ]}
        >
          <Svg width={width} height={height} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={baseGradId} x1="0%" y1="50%" x2="100%" y2="50%">
                {/* Left side (under text): minimal opacity so text is crystal-clear */}
                <Stop
                  offset="0%"
                  stopColor={colors.soft}
                  stopOpacity={isDark ? 0.08 : 0.05}
                />
                <Stop
                  offset="42%"
                  stopColor={colors.fade}
                  stopOpacity={isDark ? 0.16 : 0.10}
                />
                {/* Right side (near voice button): warm, radiant concentration */}
                <Stop
                  offset="75%"
                  stopColor={colors.deep}
                  stopOpacity={isDark ? 0.32 : 0.22}
                />
                <Stop
                  offset="100%"
                  stopColor={colors.soft}
                  stopOpacity={isDark ? 0.46 : 0.32}
                />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width={width} height={height} fill={`url(#${baseGradId})`} />
          </Svg>
        </Animated.View>

        {/* Layer 2: Right-anchored Voice Button Bloom - expands & breathes from right */}
        <Animated.View
          style={[
            styles.bloomSlot,
            {
              width: micBloomW,
              height: micBloomH,
              right: -micBloomW * 0.12,
              top: (height - micBloomH) / 2,
              opacity: pulseAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.78, 1, 0.78],
              }),
              transform: [
                {
                  translateX: sweepAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width * 0.04, -width * 0.04],
                  }),
                },
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.95, 1.07, 0.95],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width={micBloomW} height={micBloomH}>
            <Defs>
              <RadialGradient
                id={micBloomGradId}
                cx="75%"
                cy="50%"
                rx="60%"
                ry="50%"
              >
                {micBloomStops.map((stop) => (
                  <Stop
                    key={stop.offset}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity}
                  />
                ))}
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={micBloomW * 0.75}
              cy={micBloomH * 0.5}
              rx={micBloomW * 0.6}
              ry={micBloomH * 0.5}
              fill={`url(#${micBloomGradId})`}
            />
          </Svg>
        </Animated.View>

        {/* Layer 3: Secondary Harmonic Counter-Drift Bloom */}
        <Animated.View
          style={[
            styles.bloomSlot,
            {
              width: driftBloomW,
              height: driftBloomH,
              right: width * 0.25,
              top: (height - driftBloomH) / 2,
              opacity: pulseAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.82, 0.52, 0.82],
              }),
              transform: [
                {
                  translateX: sweepAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [width * 0.10, -width * 0.10],
                  }),
                },
                {
                  scale: pulseAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [1.06, 0.92, 1.06],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width={driftBloomW} height={driftBloomH}>
            <Defs>
              <RadialGradient id={driftBloomGradId} cx="50%" cy="50%" rx="50%" ry="50%">
                {driftBloomStops.map((stop) => (
                  <Stop
                    key={stop.offset}
                    offset={stop.offset}
                    stopColor={stop.color}
                    stopOpacity={stop.opacity}
                  />
                ))}
              </RadialGradient>
            </Defs>
            <Ellipse
              cx={driftBloomW * 0.5}
              cy={driftBloomH * 0.5}
              rx={driftBloomW * 0.5}
              ry={driftBloomH * 0.5}
              fill={`url(#${driftBloomGradId})`}
            />
          </Svg>
        </Animated.View>
        {/* Dither: clipped to the capsule, so it shows no edge of its own. */}
        <HueGrain isDark={isDark} intensity={0.8} />
      </Animated.View>

      {/* Layer 4: Inner Glowing Rim along the capsule contour */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFillObject,
          styles.innerRim,
          isDark ? styles.innerRimDark : styles.innerRimLight,
          {
            opacity: Animated.multiply(
              Animated.multiply(fadeAnim, enterFromRightAnim),
              pulseAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0.35, 0.88, 0.35],
              })
            ),
          },
        ]}
      />
    </Animated.View>
  );
});

InputListeningGlow.displayName = 'InputListeningGlow';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 28,
    overflow: 'hidden',
  },
  bloomSlot: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerRim: {
    borderRadius: 28,
    borderWidth: 1.5,
  },
  innerRimDark: {
    borderColor: 'rgba(240, 215, 140, 0.45)',
  },
  innerRimLight: {
    borderColor: 'rgba(201, 162, 39, 0.40)',
  },
});
