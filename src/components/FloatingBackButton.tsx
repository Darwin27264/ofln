import React from "react";
import { Platform, StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";
import { FrostedGlass } from "./FrostedGlass";

const ICON_SIZE = 24;

/**
 * Shared chrome for floating icon controls (Back, Settings About).
 * Size from a fixed 24×24 icon slot + padding — not the glyph’s advance
 * width. `arrow-back` is slimmer than the filled `information` circle, so
 * padding-only layout made Back look smaller.
 */
const FLOATING_ICON_BUTTON_CHROME = {
  borderRadius: 30,
  paddingHorizontal: 12,
  paddingVertical: 8,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const ICON_SLOT = {
  width: ICON_SIZE,
  height: ICON_SIZE,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const ICON_FONT_STYLE =
  Platform.OS === "android" ? { includeFontPadding: false as const } : undefined;

type IconButtonProps = {
  icon: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FloatingIconButton({
  icon,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  disabled,
  style,
}: IconButtonProps) {
  const { theme, isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      style={[
        FLOATING_ICON_BUTTON_CHROME,
        {
          backgroundColor: isDark ? "transparent" : "rgba(0, 0, 0, 0.08)",
          borderWidth: 1,
          borderColor: isDark ? theme.colors.border : "rgba(0, 0, 0, 0.16)",
          overflow: "hidden",
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <FrostedGlass
        style={StyleSheet.absoluteFillObject}
        blurAmount={14}
        tintOpacity={isDark ? 0.58 : 0.5}
      />
      <View style={ICON_SLOT}>
        <Ionicons
          name={icon}
          size={ICON_SIZE}
          color={theme.colors.text}
          style={ICON_FONT_STYLE}
        />
      </View>
    </TouchableOpacity>
  );
}

type BackProps = {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function FloatingBackButton({ onPress, disabled, style }: BackProps) {
  return (
    <FloatingIconButton
      icon="arrow-back"
      onPress={onPress}
      disabled={disabled}
      style={style}
      accessibilityLabel="Back"
    />
  );
}
