/**
 * Staggered fade/slide for list rows. Exit is owned by the parent panel —
 * do not snap opacity to 0 while the panel is still closing.
 */

import React, { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

type Props = {
  children: React.ReactNode;
  index: number;
  active: boolean;
  /** Initial Y offset. History used 10; selector rows use 6. */
  offset?: number;
  /** Stagger step in ms (history: 20, selector: 16). */
  staggerMs?: number;
  /** Cap on stagger delay. */
  maxDelay?: number;
};

export const StaggerFadeIn = React.memo(function StaggerFadeIn({
  children,
  index,
  active,
  offset = 10,
  staggerMs = 20,
  maxDelay = 200,
}: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(offset)).current;

  useEffect(() => {
    if (!active) return;
    opacity.setValue(0);
    translateY.setValue(offset);
    const delay = Math.min(index * staggerMs, maxDelay);
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
    anim.start();
    return () => anim.stop();
  }, [active, index, offset, staggerMs, maxDelay, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});

StaggerFadeIn.displayName = 'StaggerFadeIn';
