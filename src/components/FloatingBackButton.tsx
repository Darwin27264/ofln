import React from "react";
import { Platform, StyleProp, TouchableOpacity, View, ViewStyle } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { useTheme } from "../context/ThemeContext";

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
  const { theme } = useTheme();
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
          backgroundColor: theme.colors.primary,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={ICON_SLOT}>
        <Ionicons
          name={icon}
          size={ICON_SIZE}
          color={theme.colors.primaryText}
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
