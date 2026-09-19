/**
 * Shared idle drift for ambient hue blobs: a slow wander plus a slower breathe.
 *
 * The wander is four sine-eased legs returning to the origin, so the loop closes
 * with zero velocity and never ticks. Previously copy-pasted in AmbientHue,
 * EdgeGlow and LavaLampBackground with slightly different leg counts.
 *
 * The breathe exists because translation alone is nearly invisible on these
 * blobs. Perceived movement comes from how much the brightness at a given pixel
 * changes, which is travel distance times the field's spatial gradient — and an
 * oversized blob with a smooth falloff is almost locally flat, so sliding it
 * sideways barely changes anything. Scaling moves the entire falloff inward and
 * outward at once, which the eye picks up at a fraction of the amplitude.
 *
 * Always native-driven: the caller applies the result as a transform, so the
 * SVG underneath rasterizes once and is only recomposited.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';

export type HueDriftConfig = {
  /** Horizontal travel of the first leg, in dp. */
  dx: number;
  /** Vertical travel of the first leg, in dp. */
  dy: number;
  /** Duration of the first leg; later legs are shorter fractions of it. */
  duration: number;
  /** Peak scale gain of the breathe cycle. 0 holds the blob at its own size. */
  breathe?: number;
  /** When false the blob parks at its home position (Ambient motion off). */
  enabled?: boolean;
};

/** Leg shape as `[dxFactor, dyFactor, durationFactor]`. */
const LEGS: readonly (readonly [number, number, number])[] = [
  [1, 1, 1],
  [-0.75, -0.7, 0.85],
  [0.35, -0.3, 0.7],
  [0, 0, 0.65],
];

/**
 * Half-cycle of the breathe, as a multiple of the wander's first leg. Not a
 * clean fraction of the wander loop (which runs 3.2 legs), so the two stay out
 * of phase — a blob that reaches full expansion at the same point in every
 * lap reads as a mechanical orbit rather than as drift.
 */
const BREATHE_PERIOD = 1.1;

export function useHueDrift({
  dx,
  dy,
  duration,
  breathe = 0,
  enabled = true,
}: HueDriftConfig) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!enabled) {
      translateX.setValue(0);
      translateY.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence(
        LEGS.map(([fx, fy, fd]) =>
          Animated.parallel([
            Animated.timing(translateX, {
              toValue: dx * fx,
              duration: duration * fd,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
            Animated.timing(translateY, {
              toValue: dy * fy,
              duration: duration * fd,
              easing: Easing.inOut(Easing.sin),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    loop.start();
    return () => loop.stop();
  }, [dx, dy, duration, enabled, translateX, translateY]);

  useEffect(() => {
    if (!enabled || breathe <= 0) {
      scale.setValue(1);
      return;
    }

    const half = duration * BREATHE_PERIOD;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1 + breathe,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: half,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [breathe, duration, enabled, scale]);

  return { translateX, translateY, scale };
}
