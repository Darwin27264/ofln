/**
 * Mount + fade/scale presence for overlays (alerts, floating panels).
 * Enter resets from rest values; exit fades from the current frame.
 * Cleanup only stops in-flight motion — completed exits are left alone.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';

export function useFadeScalePresence(
  visible: boolean,
  opacity: Animated.Value,
  scale: Animated.Value,
  onExited?: () => void,
): boolean {
  const [mounted, setMounted] = useState(visible);
  const onExitedRef = useRef(onExited);
  onExitedRef.current = onExited;

  useLayoutEffect(() => {
    if (visible) setMounted(true);
  }, [visible]);

  useEffect(() => {
    if (!mounted) return;

    if (visible) {
      opacity.setValue(0);
      scale.setValue(OVERLAY_MOTION.FROM_SCALE);
      const anim = Animated.parallel([
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
      anim.start();
      return () => anim.stop();
    }

    const anim = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: OVERLAY_MOTION.FADE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: OVERLAY_MOTION.FROM_SCALE,
        duration: OVERLAY_MOTION.SCALE_OUT_MS,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]);
    let exited = false;
    anim.start(({ finished }) => {
      if (!finished || exited) return;
      exited = true;
      setMounted(false);
      onExitedRef.current?.();
    });
    return () => {
      if (!exited) anim.stop();
    };
  }, [visible, mounted, opacity, scale]);

  return mounted;
}
