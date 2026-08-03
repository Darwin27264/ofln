/**
 * Tiny circular context meter for chat chrome (S14 polish).
 * Uses the same fullness estimate as ContextFullnessBanner.
 */

import React, { useMemo } from 'react';
import { View, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';

type Props = {
  /** 0–1+ fullness ratio from estimateContextFullness. */
  ratio: number;
  /** When true, ring uses warning color. */
  isHigh: boolean;
  percent: number;
  onPress?: () => void;
  size?: number;
};

export function ContextFullnessRing({
  ratio,
  isHigh,
  percent,
  onPress,
  size = 22,
}: Props) {
  const { theme } = useTheme();
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  const dashOffset = c * (1 - clamped);
  const fillColor = isHigh ? theme.colors.warning : theme.colors.text;
  const cx = size / 2;
  const cy = size / 2;

  const svg = useMemo(
    () => (
      <Svg width={size} height={size}>
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={theme.colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={cx}
          cy={cy}
          r={r}
          stroke={fillColor}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </Svg>
    ),
    [c, cx, cy, dashOffset, fillColor, r, size, stroke, theme.colors.border],
  );

  const a11y = `Context about ${percent} percent full`;

  if (onPress) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityLabel={a11y}
        accessibilityRole="button"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        activeOpacity={0.7}
      >
        {svg}
      </TouchableOpacity>
    );
  }

  return (
    <View
      accessibilityLabel={a11y}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      {svg}
    </View>
  );
}
