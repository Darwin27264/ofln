/**
 * FrostedCard & ExpandableCardDropdown
 * Reusable frosted-glass card container and optimized native-driver expansion animation.
 * Shared across Personas, Perspectives, Tasks, and Model cards.
 */

import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Animated,
  StyleSheet,
  ViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { FrostedGlass, SETTINGS_BLOCK } from "./FrostedGlass";
import { EASING } from "../utils/animationConfig";

export interface FrostedCardProps extends ViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  borderRadius?: number;
  overlayColor?: string;
}

/**
 * Reusable frosted-glass card shell.
 * Features a translucent glass tint, frosted border, soft depth shadow,
 * and native blur via FrostedGlass.
 */
export const FrostedCard: React.FC<FrostedCardProps> = ({
  children,
  style,
  borderRadius = 16,
  overlayColor,
  ...rest
}) => {
  const { isDark } = useTheme();

  return (
    <View
      {...rest}
      style={[
        {
          borderRadius,
          overflow: "hidden",
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.05)"
            : "rgba(234, 236, 240, 0.92)",
          borderWidth: 1,
          borderColor: isDark
            ? "rgba(255, 255, 255, 0.12)"
            : "rgba(0, 0, 0, 0.08)",
          marginBottom: 12,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 3 },
          shadowOpacity: isDark ? 0.18 : 0,
          shadowRadius: 8,
          elevation: isDark ? 2 : 0,
        },
        style,
      ]}
    >
      <FrostedGlass
        style={StyleSheet.absoluteFillObject}
        blurAmount={SETTINGS_BLOCK.blurAmount}
        tintOpacity={isDark ? SETTINGS_BLOCK.tintDark : SETTINGS_BLOCK.tintLight}
      />
      {overlayColor != null && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor }]}
        />
      )}
      {children}
    </View>
  );
};

export interface ExpandableCardDropdownProps {
  isExpanded: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * Reusable animated dropdown section for expandable cards.
 * Smoothly animates opacity and translateY using the native driver,
 * and unmounts content cleanly when fully collapsed to optimize memory & render tree.
 */
export const ExpandableCardDropdown: React.FC<ExpandableCardDropdownProps> = ({
  isExpanded,
  children,
  style,
}) => {
  const { isDark } = useTheme();
  const dropdownTranslateY = useRef(new Animated.Value(isExpanded ? 0 : -16)).current;
  const dropdownOpacity = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const [shouldRender, setShouldRender] = useState(isExpanded);

  useEffect(() => {
    if (animationRef.current) {
      animationRef.current.stop();
      animationRef.current = null;
    }

    if (isExpanded) {
      setShouldRender(true);
      dropdownTranslateY.setValue(-16);
      dropdownOpacity.setValue(0);

      const anim = Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 180,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
      ]);
      animationRef.current = anim;
      anim.start((finished) => {
        if (finished) {
          dropdownTranslateY.setValue(0);
          dropdownOpacity.setValue(1);
        }
        animationRef.current = null;
      });
    } else {
      const anim = Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: -16,
          duration: 150,
          easing: EASING.ACCELERATE,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 130,
          easing: EASING.ACCELERATE,
          useNativeDriver: true,
        }),
      ]);
      animationRef.current = anim;
      anim.start((finished) => {
        if (finished) {
          dropdownTranslateY.setValue(-16);
          dropdownOpacity.setValue(0);
          setShouldRender(false);
        }
        animationRef.current = null;
      });
    }
  }, [isExpanded, dropdownTranslateY, dropdownOpacity]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View
      style={[
        {
          borderTopWidth: 1,
          borderTopColor: isDark
            ? "rgba(255, 255, 255, 0.08)"
            : "rgba(0, 0, 0, 0.06)",
          padding: 12,
          backgroundColor: isDark
            ? "rgba(255, 255, 255, 0.03)"
            : "rgba(255, 255, 255, 0.40)",
          opacity: dropdownOpacity,
          transform: [{ translateY: dropdownTranslateY }],
        },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );
};
