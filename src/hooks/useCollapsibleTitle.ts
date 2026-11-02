import { useRef, useState, useCallback, useEffect } from 'react';
import {
  Animated,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

export interface UseCollapsibleTitleOptions {
  /** Maximum scroll offset (px) past which the title is fully collapsed. Default: 30. */
  collapseDistance?: number;
  /** Legacy alias for collapseDistance. Default: 30. */
  collapseThreshold?: number;
  /** Scroll offset (px) at or below which the title is fully expanded. Default: 0. */
  expandThreshold?: number;
  /** Transition duration in ms for programmatic triggers. Default: 200. */
  duration?: number;
  /** Initial collapsed state. Default: false. */
  initialCollapsed?: boolean;
}

export interface UseCollapsibleTitleResult {
  /** Animated value: 1 = fully expanded, 0 = fully collapsed, 0.5 = halfway. */
  anim: Animated.Value;
  /** Scroll event handler to pass to `<ScrollView onScroll={handleScroll}>`. */
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  /** Current collapsed boolean state (true when fully collapsed). */
  isCollapsed: boolean;
  /** Programmatic collapse trigger (animates to 0). */
  collapse: () => void;
  /** Programmatic expand trigger (animates to 1). */
  expand: () => void;
}

export function useCollapsibleTitle(
  options: UseCollapsibleTitleOptions = {},
): UseCollapsibleTitleResult {
  const {
    collapseDistance,
    collapseThreshold,
    expandThreshold = 0,
    duration = ANIMATION_DURATIONS.STANDARD,
    initialCollapsed = false,
  } = options;

  const maxDistance = collapseDistance ?? collapseThreshold ?? 30;
  const minDistance = expandThreshold;

  // anim: 1 = fully expanded, 0 = fully collapsed, 0.5 = halfway
  const anim = useRef(new Animated.Value(initialCollapsed ? 0 : 1)).current;
  const isCollapsedRef = useRef(initialCollapsed);
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const activeAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  const animateTo = useCallback(
    (toValue: number, animDuration: number = duration) => {
      const clamped = Math.max(0, Math.min(1, toValue));

      const newCollapsedState = clamped <= 0.05;
      if (isCollapsedRef.current !== newCollapsedState) {
        isCollapsedRef.current = newCollapsedState;
        setIsCollapsed(newCollapsedState);
      }

      if (activeAnimRef.current) {
        activeAnimRef.current.stop();
      }

      const animation = Animated.timing(anim, {
        toValue: clamped,
        duration: animDuration,
        easing: EASING.STANDARD,
        useNativeDriver: false,
      });

      activeAnimRef.current = animation;
      animation.start(({ finished }) => {
        if (finished) {
          activeAnimRef.current = null;
        }
      });
    },
    [anim, duration],
  );

  const collapse = useCallback(() => {
    animateTo(0, duration);
  }, [animateTo, duration]);

  const expand = useCallback(() => {
    animateTo(1, duration);
  }, [animateTo, duration]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = event?.nativeEvent?.contentOffset?.y;
      if (typeof offsetY !== 'number' || isNaN(offsetY)) return;

      // Proportional progress based on user scroll position:
      // offsetY <= minDistance: progress = 1.0 (fully open)
      // offsetY >= maxDistance: progress = 0.0 (fully collapsed)
      // minDistance < offsetY < maxDistance: linear proportional progress (can be halfway, etc.)
      let progress: number;
      if (offsetY <= minDistance) {
        progress = 1;
      } else if (offsetY >= maxDistance) {
        progress = 0;
      } else {
        const range = maxDistance - minDistance;
        progress = range > 0 ? 1 - (offsetY - minDistance) / range : 0;
      }

      progress = Math.max(0, Math.min(1, progress));

      // Cancel any ongoing programmatic animation
      if (activeAnimRef.current) {
        activeAnimRef.current.stop();
        activeAnimRef.current = null;
      }

      // Directly update the animated value to follow the scroll position synchronously
      anim.setValue(progress);

      const newCollapsedState = progress <= 0.05;
      if (isCollapsedRef.current !== newCollapsedState) {
        isCollapsedRef.current = newCollapsedState;
        setIsCollapsed(newCollapsedState);
      }
    },
    [anim, maxDistance, minDistance],
  );

  useEffect(() => {
    return () => {
      if (activeAnimRef.current) {
        activeAnimRef.current.stop();
      }
    };
  }, []);

  return {
    anim,
    handleScroll,
    isCollapsed,
    collapse,
    expand,
  };
}

export default useCollapsibleTitle;
