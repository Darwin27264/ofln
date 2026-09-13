/**
 * Staggered fade/slide for library list cards (same enter as Models / Personas).
 * Plays once per item id while the page is open; later remounts of that id snap to rest.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, InteractionManager } from 'react-native';
import { ANIMATION_CONFIG, getStaggeredDelay } from '../utils/animationConfig';

export function useLibraryCardEnter() {
  const animatedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    animatedIds.current.clear();
    return () => {
      animatedIds.current.clear();
    };
  }, []);

  return { animatedIds };
}

type LibraryCardEnterProps = {
  itemId: string;
  index: number;
  animatedIds: React.MutableRefObject<Set<string>>;
  children: React.ReactNode;
};

export const LibraryCardEnter = React.memo(function LibraryCardEnter({
  itemId,
  index,
  animatedIds,
  children,
}: LibraryCardEnterProps) {
  // If this id already entered while the page was open, start at rest so
  // remounts (list refresh / reorder) do not flash opacity 0 → 1.
  const startAtRest = animatedIds.current.has(itemId);
  const opacity = useRef(new Animated.Value(startAtRest ? 1 : 0)).current;
  const translateY = useRef(new Animated.Value(startAtRest ? 0 : 20)).current;
  const hasInitializedRef = useRef(startAtRest);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    if (animatedIds.current.has(itemId)) {
      opacity.setValue(1);
      translateY.setValue(0);
      hasInitializedRef.current = true;
      return;
    }

    if (hasInitializedRef.current) {
      return;
    }

    hasInitializedRef.current = true;
    animatedIds.current.add(itemId);

    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }

    opacity.setValue(0);
    translateY.setValue(20);

    const interaction = InteractionManager.runAfterInteractions(() => {
      requestAnimationFrame(() => {
        const delay = getStaggeredDelay(index);
        const animation = Animated.parallel([
          Animated.timing(opacity, {
            toValue: 1,
            delay,
            ...ANIMATION_CONFIG.card,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            delay,
            ...ANIMATION_CONFIG.card,
          }),
        ]);
        animationRef.current = animation;
        animation.start((finished) => {
          if (finished) {
            opacity.setValue(1);
            translateY.setValue(0);
          }
          animationRef.current = null;
        });
      });
    });

    return () => {
      interaction.cancel();
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
    };
  }, [itemId, index, animatedIds, opacity, translateY]);

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
});
