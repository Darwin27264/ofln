/**
 * React Native port of loading-ui TextBlink
 * https://loading-ui.com/docs/components/text-blink
 *
 * Fades a short line of copy in place (save / thinking / live status).
 */

import React, { useEffect, useRef } from 'react';
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
    const half = Math.max(1, Math.round(durationMs / 2));
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: half,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [durationMs, progress]);

  return (
    <Animated.Text
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          fontFamily: 'Poppins',
          fontWeight: '500',
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, minOpacity],
          }),
        },
        style,
      ]}
    >
      {children}
    </Animated.Text>
  );
}

TextBlink.displayName = 'TextBlink';
