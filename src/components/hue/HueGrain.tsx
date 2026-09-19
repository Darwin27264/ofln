/**
 * Tiled dither overlay for the ambient hue.
 *
 * The hue's outer falloff spans only a handful of 8-bit levels, so without this
 * the gradient quantizes into concentric contour rings. Uniform noise randomizes
 * which side of a quantization boundary each pixel lands on, which trades the
 * rings for texture two levels deep — below what the eye resolves.
 *
 * Must span the full extent of whatever container fades it in and out. A grain
 * layer smaller than its parent shows its own rectangular edge, which is the
 * artifact this is here to remove.
 */
import React from 'react';
import { Image, StyleSheet } from 'react-native';

import { HUE_GRAIN_OPACITY } from './hueTokens';

const GRAIN = require('../../assets/hue-grain.png');

export type HueGrainProps = {
  isDark: boolean;
  /** Scales the theme default — for surfaces that need less (already blurred). */
  intensity?: number;
};

export const HueGrain = React.memo(function HueGrain({
  isDark,
  intensity = 1,
}: HueGrainProps) {
  const opacity =
    (isDark ? HUE_GRAIN_OPACITY.dark : HUE_GRAIN_OPACITY.light) * intensity;

  return (
    <Image
      source={GRAIN}
      resizeMode="repeat"
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[StyleSheet.absoluteFill, { opacity }]}
    />
  );
});

HueGrain.displayName = 'HueGrain';
