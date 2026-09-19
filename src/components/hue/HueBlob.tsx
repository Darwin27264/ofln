/**
 * One ambient hue blob: a single ellipse with a smooth alpha falloff, drifting
 * under a native-driven transform.
 *
 * `peak` is baked into the gradient stops rather than set as layer opacity, so
 * the view needs no offscreen compositing pass. Callers that animate brightness
 * pass `opacity` as a 0–1 multiplier on top.
 *
 * Grain (dither) is drawn *inside* the blob and masked by the blob's own
 * falloff, so noise only exists where there is hue to band. A full-screen grain
 * layer is visible as texture over the empty parts of the screen, which is worse
 * than the banding it fixes.
 *
 * The SVG content is static, so it rasterizes once and every frame after that is
 * pure composition.
 */
import React, { useId } from 'react';
import { Animated } from 'react-native';
import Svg, {
  Defs,
  Ellipse,
  Image as SvgImage,
  Mask,
  Pattern,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  HUE_BREATHE,
  HUE_GRAIN_OPACITY,
  HUE_GRAIN_TILE,
  hueStops,
} from './hueTokens';
import { useHueDrift } from './useHueDrift';

const GRAIN = require('../../assets/hue-grain.png');

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
  /** Overrides the shared breathe amplitude. 0 disables it for this blob. */
  breathe?: number;
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
    /** Dither the falloff. Off for small/blurred surfaces that cannot band. */
    grain?: boolean;
    /** Scales the theme grain default. */
    grainIntensity?: number;
    isDark?: boolean;
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
  breathe = HUE_BREATHE,
  offsetX,
  offsetY,
  scale,
  opacity,
  motionEnabled = true,
  grain = false,
  grainIntensity = 1,
  isDark = true,
}: HueBlobProps) {
  const {
    translateX: driftX,
    translateY: driftY,
    scale: breatheScale,
  } = useHueDrift({
    dx,
    dy,
    duration,
    breathe,
    enabled: motionEnabled,
  });
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradId = `hue-${id}-${instanceId}`;
  const maskId = `hueMask-${id}-${instanceId}`;
  const maskGradId = `hueMaskGrad-${id}-${instanceId}`;
  const patternId = `hueGrain-${id}-${instanceId}`;

  const translateX = offsetX ? Animated.add(driftX, offsetX) : driftX;
  const translateY = offsetY ? Animated.add(driftY, offsetY) : driftY;
  // Caller scale (enter bloom, page pulse) rides on top of the breathe.
  const blobScale = scale ? Animated.multiply(breatheScale, scale) : breatheScale;

  const grainOpacity =
    (isDark ? HUE_GRAIN_OPACITY.dark : HUE_GRAIN_OPACITY.light) * grainIntensity;

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
        transform: [{ translateX }, { translateY }, { scale: blobScale }],
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
          {grain ? (
            <>
              <Pattern
                id={patternId}
                patternUnits="userSpaceOnUse"
                // Otherwise the tile is scaled by the fill's bounding box,
                // stretching one tile across the whole ellipse.
                patternContentUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={HUE_GRAIN_TILE}
                height={HUE_GRAIN_TILE}
              >
                <SvgImage
                  href={GRAIN}
                  x={0}
                  y={0}
                  width={HUE_GRAIN_TILE}
                  height={HUE_GRAIN_TILE}
                  preserveAspectRatio="none"
                />
              </Pattern>
              {/* Same falloff in white, driving a luminance mask, so grain
                  tracks the hue's intensity and vanishes where the hue does. */}
              <RadialGradient id={maskGradId} cx="50%" cy="50%" rx="50%" ry="50%">
                {hueStops(1).map((stop) => (
                  <Stop
                    key={stop.offset}
                    offset={stop.offset}
                    stopColor="#FFFFFF"
                    stopOpacity={stop.opacity}
                  />
                ))}
              </RadialGradient>
              <Mask
                id={maskId}
                maskUnits="userSpaceOnUse"
                x={0}
                y={0}
                width={width}
                height={height}
              >
                <Ellipse
                  cx={width / 2}
                  cy={height / 2}
                  rx={width / 2}
                  ry={height / 2}
                  fill={`url(#${maskGradId})`}
                />
              </Mask>
            </>
          ) : null}
        </Defs>
        <Ellipse
          cx={width / 2}
          cy={height / 2}
          rx={width / 2}
          ry={height / 2}
          fill={`url(#${gradId})`}
        />
        {grain ? (
          <Rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill={`url(#${patternId})`}
            mask={`url(#${maskId})`}
            opacity={grainOpacity}
          />
        ) : null}
      </Svg>
    </Animated.View>
  );
});

HueBlob.displayName = 'HueBlob';
