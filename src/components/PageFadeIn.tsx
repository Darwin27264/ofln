/**
 * Per-page enter transition: soft fade + slight scale from center.
 * Own Animated values per mount so every page (including Diagnostics) fades
 * in the same way — no shared global transition race.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';

export function PageFadeIn({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const [settled, setSettled] = useState(false);

  // useLayoutEffect: start from invisible before paint so we never flash opaque.
  useLayoutEffect(() => {
    opacity.setValue(0);
    scale.setValue(OVERLAY_MOTION.FROM_SCALE);
    setSettled(false);

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: OVERLAY_MOTION.FADE_IN_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: OVERLAY_MOTION.SCALE_IN_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (!finished) return;
      // Pin resting values, then unbind on the next frame so nested native
      // transforms (e.g. chat greeting translateY) don't hitch mid-commit.
      opacity.setValue(1);
      scale.setValue(1);
      requestAnimationFrame(() => {
        setSettled(true);
      });
    });

    return () => {
      animation.stop();
    };
  }, [opacity, scale]);

  // After settle, drop animated opacity/scale so Android overlays under the
  // page are not left on a perpetual native opacity layer.
  return (
    <Animated.View
      style={
        settled
          ? { flex: 1 }
          : { flex: 1, opacity, transform: [{ scale }] }
      }
      collapsable={false}
    >
      {children}
    </Animated.View>
  );
}
