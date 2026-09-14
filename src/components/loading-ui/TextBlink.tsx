/**
 * React Native port of loading-ui TextBlink
 * https://loading-ui.com/docs/components/text-blink
 *
 * Fades a short line of copy in place (save / thinking / live status)
 * with a continuous harmonic cycle that never jumps or pauses at loop boundaries.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, type StyleProp, type TextStyle } from 'react-native';

export type TextBlinkProps = {
  children: React.ReactNode;
  /** Midpoint opacity (web default 0.45). */
  minOpacity?: number;
  /** Full blink cycle in ms (web default 2s via --duration). */
  durationMs?: number;
  style?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function TextBlink({
  children,
  minOpacity = 0.45,
  durationMs = 2000,
  style,
  accessibilityLabel,
}: TextBlinkProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, progress]);

  // Continuous cosine fade: f(0) === f(1) === 1.0, with zero derivative at boundaries
  const opacity = useMemo(() => {
    const SAMPLES = 16;
    const inputRange: number[] = [];
    const outputRange: number[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const p = i / SAMPLES;
      inputRange.push(p);
      // Cosine factor from 0 to 1 and back to 0
      const factor = (1 - Math.cos(2 * Math.PI * p)) / 2;
      // Fade from 1.0 down to minOpacity and back to 1.0
      outputRange.push(Math.round((1 - (1 - minOpacity) * factor) * 1000) / 1000);
    }
    return progress.interpolate({ inputRange, outputRange });
  }, [minOpacity, progress]);

  return (
    <Animated.Text
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          fontFamily: 'Poppins',
          fontWeight: '500',
          opacity,
        },
        style,
      ]}
    >
      {children}
    </Animated.Text>
  );
}

TextBlink.displayName = 'TextBlink';
