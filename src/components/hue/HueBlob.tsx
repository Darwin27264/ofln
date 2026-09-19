/**
 * One ambient hue blob: a single ellipse with a Gaussian alpha falloff, drifting
 * under a native-driven transform.
 *
 * `peak` is baked into the gradient stops rather than set as layer opacity, so
 * the view needs no offscreen compositing pass. Callers that animate brightness
 * pass `opacity` as a 0–1 multiplier on top.
 *
 * The SVG content is static, so it rasterizes once and every frame after that is
 * pure composition.
 */
import React, { useId } from 'react';
import { Animated } from 'react-native';
import Svg, { Defs, Ellipse, RadialGradient, Stop } from 'react-native-svg';

import { hueStops } from './hueTokens';
import { useHueDrift } from './useHueDrift';

export type HueAnimated = Animated.Value | Animated.AnimatedInterpolation<number>;

export type HueBlobSpec = {
  /** Stable key within its field; also used to namespace the gradient id. */
  id: string;
  /** Drawn ellipse size in dp. Keep generous — see HUE_BLOB_OVERSIZE. */
  width: number;
  height: number;
  /** Top-left of the drawn ellipse's bounding box, relative to the field. */
  left: number;
  top: number;
  color: string;
  /** Alpha at the blob's center. */
  peak: number;
  /** Idle drift travel and period. */
  dx: number;
  dy: number;
  duration: number;
};

export type HueBlobExtras = {
  /** Added to the idle drift — gather-to-center, enter creep, page homes. */
  offsetX?: HueAnimated;
  offsetY?: HueAnimated;
  /** Multiplied onto the blob. */
  scale?: HueAnimated;
  /** 0–1 multiplier on `peak`. Omit to skip layer opacity entirely. */
  opacity?: HueAnimated;
};

export type HueBlobProps = HueBlobSpec &
  HueBlobExtras & {
    /** False parks the blob at its home position (Ambient motion off). */
    motionEnabled?: boolean;
  };

export const HueBlob = React.memo(function HueBlob({
  id,
  width,
  height,
  left,
  top,
  color,
  peak,
  dx,
  dy,
  duration,
  offsetX,
  offsetY,
  scale,
  opacity,
  motionEnabled = true,
}: HueBlobProps) {
  const { translateX: driftX, translateY: driftY } = useHueDrift({
    dx,
    dy,
    duration,
    enabled: motionEnabled,
  });
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `hue-${id}-${instanceId}`;

  const translateX = offsetX ? Animated.add(driftX, offsetX) : driftX;
  const translateY = offsetY ? Animated.add(driftY, offsetY) : driftY;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height,
        ...(opacity ? { opacity } : null),
        transform: scale
          ? [{ translateX }, { translateY }, { scale }]
          : [{ translateX }, { translateY }],
      }}
    >
      <Svg width={width} height={height}>
        <Defs>
          <RadialGradient id={gradId} cx="50%" cy="50%" rx="50%" ry="50%">
            {hueStops(peak).map((stop) => (
              <Stop
                key={stop.offset}
                offset={stop.offset}
                stopColor={color}
                stopOpacity={stop.opacity}
              />
            ))}
          </RadialGradient>
        </Defs>
        <Ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={`url(#${gradId})`}
        />
      </Svg>
    </Animated.View>
  );
});

HueBlob.displayName = 'HueBlob';
