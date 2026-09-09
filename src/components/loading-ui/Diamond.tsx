/**
 * React Native port of loading-ui Diamond
 * https://loading-ui.com/docs/components/diamond
 *
 * Eight square pixels around a diamond path, each fading in sequence.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

const VIEWBOX = 20;
const PIXEL = 4;
const CYCLE_MS = 800;
const STAGGER_MS = 100;

/** Pixel positions in the original 20×20 viewBox. */
const PIXELS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 8, y: 0 }, // Top
  { x: 12, y: 4 }, // Top Right
  { x: 16, y: 8 }, // Right
  { x: 12, y: 12 }, // Bottom Right
  { x: 8, y: 16 }, // Bottom
  { x: 4, y: 12 }, // Bottom Left
  { x: 0, y: 8 }, // Left
  { x: 4, y: 4 }, // Top Left
];

export type DiamondProps = {
  /** Outer footprint in dp (maps to the SVG size). Default 20. */
  size?: number;
  /** Pixel fill color (inherits from parent text via currentColor on web). */
  color: string;
  style?: ViewStyle;
  accessibilityLabel?: string;
};

function DiamondPixel({
  x,
  y,
  scale,
  color,
  delayMs,
}: {
  x: number;
  y: number;
  scale: number;
  color: string;
  delayMs: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeInMs = Math.max(1, Math.round(CYCLE_MS * 0.01));
    const fadeOutMs = CYCLE_MS - fadeInMs;
    const cycle = Animated.sequence([
      // Match CSS: 0% → 0, 1% → 1, 100% → 0 over 0.8s ease-in-out
      Animated.timing(opacity, {
        toValue: 1,
        duration: fadeInMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: fadeOutMs,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ]);

    // animation-delay only before the first iteration; then loop at CYCLE_MS.
    const anim = Animated.sequence([
      Animated.delay(delayMs),
      Animated.loop(cycle),
    ]);
    anim.start();
    return () => {
      anim.stop();
      opacity.setValue(0);
    };
  }, [delayMs, opacity]);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x * scale,
        top: y * scale,
        width: PIXEL * scale,
        height: PIXEL * scale,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

export function Diamond({
  size = 20,
  color,
  style,
  accessibilityLabel = 'Loading',
}: DiamondProps) {
  const scale = size / VIEWBOX;

  return (
    <View
      style={[styles.root, { width: size, height: size }, style]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      {PIXELS.map((p, i) => (
        <DiamondPixel
          key={i}
          x={p.x}
          y={p.y}
          scale={scale}
          color={color}
          delayMs={i * STAGGER_MS}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
});
