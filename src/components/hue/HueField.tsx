/**
 * A group of ambient hue blobs plus the grain overlay, composited as one layer.
 *
 * `extras` is a map keyed by blob id rather than a callback so callers can
 * memoize the animated values they derive. Rebuilding an interpolation every
 * render would defeat `HueBlob`'s memo and re-render its SVG on every parent
 * pass.
 *
 * Callers needing per-blob state of their own (LavaLampBackground parks each
 * blob in a per-page home) should compose `HueBlob` and `HueGrain` directly.
 */
import React from 'react';
import { Animated, StyleProp, StyleSheet, ViewStyle } from 'react-native';

import { HueBlob, type HueBlobExtras, type HueBlobSpec } from './HueBlob';
import { HueGrain } from './HueGrain';

export type HueFieldProps = {
  blobs: readonly HueBlobSpec[];
  isDark: boolean;
  /** False parks every blob (Ambient motion off). */
  motionEnabled?: boolean;
  /** Memoized per-blob overlay motion, keyed by blob id. */
  extras?: Record<string, HueBlobExtras | undefined>;
  /** Grain must span the whole fading group — see HueGrain. */
  grain?: boolean;
  grainIntensity?: number;
  /** Group opacity / transform. Defaults to filling the parent. */
  style?: StyleProp<ViewStyle>;
};

export const HueField = React.memo(function HueField({
  blobs,
  isDark,
  motionEnabled = true,
  extras,
  grain = true,
  grainIntensity,
  style,
}: HueFieldProps) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}
    >
      {blobs.map((blob) => (
        <HueBlob
          key={blob.id}
          {...blob}
          {...extras?.[blob.id]}
          motionEnabled={motionEnabled}
        />
      ))}
      {grain ? <HueGrain isDark={isDark} intensity={grainIntensity} /> : null}
    </Animated.View>
  );
});

HueField.displayName = 'HueField';
