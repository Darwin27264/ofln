/**
 * Frosted-glass chrome: native blur with a light tint.
 * Shared constants keep pills, input, menus, and panels visually unified.
 */
import React from "react";
import {
  Platform,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { BlurView } from "@react-native-community/blur";
import { useTheme } from "../context/ThemeContext";

/** Shared frost settings — use everywhere chrome is frosted. */
export const FROSTED_GLASS = {
  /** Compact controls: top/bottom pills, input bar, menus */
  chromeBlurAmount: 14,
  chromeTintOpacity: 0.45,
  /** Larger surfaces: history panel, sheets */
  panelBlurAmount: 18,
  panelTintOpacity: 0.55,
  /**
   * Opaque system-bar / shell colors approximating panel frost over the canvas.
   * Status bar stays transparent (shell paints under); window/nav fill uses this
   * so the physical bottom never shows a 1px gap. Light must be clearly
   * distinct from #FFFFFF or the chrome open fade reads as "no change".
   */
  panelSystemBarLight: "#E8E8E8",
  panelSystemBarDark: "#181818",
} as const;

/** System status/nav bar color that matches the frosted history panel. */
export function frostedPanelSystemBarColor(mode: "light" | "dark"): string {
  return mode === "dark"
    ? FROSTED_GLASS.panelSystemBarDark
    : FROSTED_GLASS.panelSystemBarLight;
}

type FrostedGlassProps = {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Blur intensity (roughly 1–25). */
  blurAmount?: number;
  /** Extra tint opacity over the blur (0–1). */
  tintOpacity?: number;
  /** Invert tint (e.g. temporary-mode active). */
  inverted?: boolean;
  /** Preset: chrome (pills/input) or panel (side drawer). */
  variant?: "chrome" | "panel";
};

export function FrostedGlass({
  style,
  children,
  blurAmount,
  tintOpacity,
  inverted = false,
  variant = "chrome",
}: FrostedGlassProps) {
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";

  const resolvedBlur =
    blurAmount ??
    (variant === "panel"
      ? FROSTED_GLASS.panelBlurAmount
      : FROSTED_GLASS.chromeBlurAmount);
  const resolvedTint =
    tintOpacity ??
    (variant === "panel"
      ? FROSTED_GLASS.panelTintOpacity
      : FROSTED_GLASS.chromeTintOpacity);

  const blurType = inverted
    ? isDark
      ? "light"
      : "dark"
    : isDark
      ? "dark"
      : "light";

  const tint = inverted
    ? isDark
      ? `rgba(255, 255, 255, ${resolvedTint})`
      : `rgba(0, 0, 0, ${resolvedTint})`
    : isDark
      ? `rgba(36, 36, 36, ${resolvedTint})`
      : `rgba(255, 255, 255, ${resolvedTint})`;

  return (
    <View style={[styles.base, style]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        blurType={blurType}
        blurAmount={resolvedBlur}
        reducedTransparencyFallbackColor={theme.colors.glass}
        {...(Platform.OS === "android"
          ? {
              overlayColor: tint,
              blurRadius: Math.min(25, resolvedBlur + 4),
            }
          : {})}
      />
      {Platform.OS === "ios" && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: tint }]}
        />
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: "hidden",
    backgroundColor: "transparent",
  },
});
