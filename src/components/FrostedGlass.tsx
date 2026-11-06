/**
 * Frosted-glass chrome: native blur with a light tint.
 * Shared constants keep pills, input, menus, and panels visually unified.
 */
import React from "react";
import {
  Platform,
  StyleSheet,
  View,
  Animated,
  ViewProps,
  type StyleProp,
  type ViewStyle,
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
   * Status and nav share this fill so top/bottom chrome match and physical
   * edges never show a 1px gap. Light must be clearly distinct from #FFFFFF
   * or the chrome open fade reads as "no change".
   */
  panelSystemBarLight: "#E8E8E8",
  panelSystemBarDark: "#181818",
} as const;

/**
 * Settings-style content blocks (tiles, section cards, guide panels).
 * Keep Performance / Diagnostics / Storage / Info in sync with Settings.
 */
export const SETTINGS_BLOCK = {
  radius: 30,
  padding: 15,
  /** Vertical space between block rows. */
  gap: 3,
  /** Horizontal half-gap (left uses marginRight, right uses marginLeft). */
  gutter: 2,
  blurAmount: 16,
  tintDark: 0.62,
  tintLight: 0.52,
  /** Soft underlay — blur + tint create the frosted look over the canvas. */
  glassBgDark: "rgba(255, 255, 255, 0.05)",
  glassBgLight: "rgba(234, 236, 240, 0.92)",
  borderDark: "rgba(255, 255, 255, 0.12)",
  borderLight: "rgba(0, 0, 0, 0.08)",
} as const;

/** System status/nav bar color that matches the frosted history panel. */
export function frostedPanelSystemBarColor(mode: "light" | "dark"): string {
  return mode === "dark"
    ? FROSTED_GLASS.panelSystemBarDark
    : FROSTED_GLASS.panelSystemBarLight;
}

/**
 * Chrome tint composited over `panelSystemBar*` — what a frosted pill resolves
 * to once it sits on an opaque panel rather than on live content.
 */
export function opaqueChromeColor(mode: "light" | "dark"): string {
  return mode === "dark" ? "#1D1D1D" : "#F2F2F2";
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

/**
 * Drop-in for `FrostedGlass` on chrome that stacks over an opaque surface.
 * Blurring there resamples the backdrop every frame and resolves to nothing
 * but the tint, so the tint is precomputed instead.
 */
export function SolidChrome({ style }: { style?: StyleProp<ViewStyle> }) {
  const { theme } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        styles.base,
        style,
        { backgroundColor: opaqueChromeColor(theme.mode) },
      ]}
    />
  );
}

type FrostedPanelProps = ViewProps & {
  /** Optional wash over frost (e.g. perf level / On-state tint). */
  overlayColor?: string | Animated.AnimatedInterpolation<string | number>;
};

/**
 * Settings-matching frosted shell — radius 30, border, Settings tile frost.
 * Use for Performance / Diagnostics / Storage / Info content blocks.
 *
 * Blur mounts with the panel (no deferred mount) so first paint already reads
 * as frost over the translucent glassBg underlay.
 */
export function FrostedPanel({
  style,
  children,
  overlayColor,
  borderRadius = SETTINGS_BLOCK.radius,
  ...rest
}: FrostedPanelProps & { borderRadius?: number }) {
  const { isDark } = useTheme();

  return (
    <View
      {...rest}
      style={[
        {
          borderRadius,
          overflow: "hidden",
          backgroundColor: isDark
            ? SETTINGS_BLOCK.glassBgDark
            : SETTINGS_BLOCK.glassBgLight,
          borderWidth: 1,
          borderColor: isDark
            ? SETTINGS_BLOCK.borderDark
            : SETTINGS_BLOCK.borderLight,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.16 : 0,
          shadowRadius: 10,
          elevation: isDark ? 3 : 0,
        },
        style,
      ]}
    >
      <FrostedGlass
        style={StyleSheet.absoluteFillObject}
        blurAmount={SETTINGS_BLOCK.blurAmount}
        tintOpacity={isDark ? SETTINGS_BLOCK.tintDark : SETTINGS_BLOCK.tintLight}
      />
      {overlayColor != null ? (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            { backgroundColor: overlayColor as any },
          ]}
        />
      ) : null}
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
