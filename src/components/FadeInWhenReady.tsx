/**
 * Soft enter when content becomes ready (null → value).
 * Ready on first paint shows at rest so PageFadeIn isn't double-faded.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

type Props = {
  ready: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Enter Y offset in px. Keep small for badges. */
  offset?: number;
  delay?: number;
};

export function FadeInWhenReady({
  ready,
  children,
  style,
  offset = 6,
  delay = 0,
}: Props) {
  const initiallyReady = useRef(ready).current;
  const opacity = useRef(new Animated.Value(initiallyReady ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(initiallyReady ? 0 : offset)).current;
  const [mounted, setMounted] = useState(ready);
  const prevReadyRef = useRef(ready);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const wasReady = prevReadyRef.current;
    prevReadyRef.current = ready;

    if (ready === wasReady) return;

    if (ready) {
      setMounted(true);
      opacity.setValue(0);
      translateY.setValue(offset);
      animRef.current?.stop();
      const anim = Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: ANIMATION_DURATIONS.STANDARD,
          delay,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]);
      animRef.current = anim;
      anim.start(({ finished }) => {
        if (finished) {
          opacity.setValue(1);
          translateY.setValue(0);
        }
        animRef.current = null;
      });
      return () => {
        anim.stop();
        animRef.current = null;
      };
    }

    animRef.current?.stop();
    animRef.current = null;
    setMounted(false);
    opacity.setValue(0);
    translateY.setValue(offset);
  }, [ready, offset, delay, opacity, translateY]);

  if (!mounted) return null;

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
