/**
 * Shared idle drift for ambient hue blobs.
 *
 * Four sine-eased legs returning to the origin, so the loop closes with zero
 * velocity and never ticks. Previously copy-pasted in AmbientHue, EdgeGlow and
 * LavaLampBackground with slightly different leg counts.
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

export function useHueDrift({ dx, dy, duration, enabled = true }: HueDriftConfig) {
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;

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

  return { translateX, translateY };
}
