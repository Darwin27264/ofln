/**
 * Per-page enter transition: soft fade + slight scale from center.
 * Own Animated values per mount so every page (including Diagnostics) fades
 * in the same way — no shared global transition race.
 *
 * Supports an optional `active` prop for resident pages (e.g. ConversationScreen):
 * when `active` transitions from false to true, the native-driven fade + scale
 * plays without needing to remount the entire view tree.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';

export function PageFadeIn({
  children,
  /**
   * Default true: remounting screens (Settings, Models, …) finish first paint
   * before the fade starts so blur/layout hitch doesn't eat the enter motion.
   * Pass false for already-warm resident trees (e.g. Conversation return).
   */
  deferEnter = true,
  active,
}: {
  children: React.ReactNode;
  /**
   * Wait until after the first paint before starting. Heavy first mounts
   * otherwise burn the fade during layout, then pop in.
   */
  deferEnter?: boolean;
  /**
   * When provided, coordinates transition on visibility changes without remounting.
   * Plays native-driven fade + scale transition when active transitions to true.
   */
  active?: boolean;
}) {
  const opacity = useRef(new Animated.Value(active === false ? 0 : 0)).current;
  const scale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const [settled, setSettled] = useState(false);
  const deferRef = useRef(deferEnter);
  deferRef.current = deferEnter;

  const isMountedRef = useRef(false);
  const prevActiveRef = useRef<boolean | undefined>(active);
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const rafOuterRef = useRef(0);
  const rafInnerRef = useRef(0);
  const settleRafRef = useRef(0);

  const stopActiveAnimation = () => {
    if (rafOuterRef.current) {
      cancelAnimationFrame(rafOuterRef.current);
      rafOuterRef.current = 0;
    }
    if (rafInnerRef.current) {
      cancelAnimationFrame(rafInnerRef.current);
      rafInnerRef.current = 0;
    }
    if (settleRafRef.current) {
      cancelAnimationFrame(settleRafRef.current);
      settleRafRef.current = 0;
    }
    if (animRef.current) {
      animRef.current.stop();
      animRef.current = null;
    }
  };

  useLayoutEffect(() => {
    const isFirstMount = !isMountedRef.current;
    isMountedRef.current = true;
    const prevActive = prevActiveRef.current;
    prevActiveRef.current = active;

    // Case 1: Dormant on first mount
    if (isFirstMount && active === false) {
      stopActiveAnimation();
      opacity.setValue(0);
      scale.setValue(OVERLAY_MOTION.FROM_SCALE);
      setSettled(false);
      return;
    }

    // Case 2: Became dormant (active changed to false)
    if (!isFirstMount && active === false) {
      stopActiveAnimation();
      opacity.setValue(0);
      scale.setValue(OVERLAY_MOTION.FROM_SCALE);
      setSettled(false);
      return;
    }

    // Case 3: Re-render without active state change (stayed true, or stayed undefined)
    if (!isFirstMount && active === prevActive) {
      return;
    }

    // Case 4: Enter animation:
    // Either first mount with active !== false (including active === undefined),
    // or active flipped from false -> true.
    stopActiveAnimation();
    opacity.setValue(0);
    scale.setValue(OVERLAY_MOTION.FROM_SCALE);
    setSettled(false);

    const start = () => {
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
      animRef.current = animation;

      animation.start(({ finished }) => {
        if (!finished) return;
        // Pin resting values, then unbind on the next frame so nested native
        // transforms (e.g. chat greeting translateY) don't hitch mid-commit.
        opacity.setValue(1);
        scale.setValue(1);
        settleRafRef.current = requestAnimationFrame(() => {
          setSettled(true);
          settleRafRef.current = 0;
        });
      });
    };

    if (deferRef.current) {
      // Two frames: first commits opacity 0, second starts the fade after
      // the mount hitch so the motion is actually on screen.
      rafOuterRef.current = requestAnimationFrame(() => {
        rafInnerRef.current = requestAnimationFrame(start);
      });
    } else {
      start();
    }

    return () => {
      stopActiveAnimation();
    };
  }, [active]);

  // Clean up timers and animations on unmount
  useEffect(() => {
    return () => {
      stopActiveAnimation();
    };
  }, []);

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
