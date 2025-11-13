/**
 * BottomSheet Component
 * 
 * A unified, reusable bottom sheet component with standardized:
 * - Subtle, smooth, minimal animation
 * - Consistent header style and font sizes
 * - Uniform dimensions and layout
 * - Drag-to-dismiss gesture support
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  Pressable,
  TouchableWithoutFeedback,
  Dimensions,
  Easing,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  height?: number; // Percentage of screen height (0-1), default 0.7
  disableDrag?: boolean; // Disable drag-to-dismiss
  onOpenStart?: () => void;
  onCloseComplete?: () => void;
  headerRight?: React.ReactNode; // Optional content to display on the right side of header
  subtitle?: string; // Optional subtitle text below the title
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  height = 0.7,
  disableDrag = false,
  onOpenStart,
  onCloseComplete,
  headerRight,
  subtitle,
}) => {
  const { theme } = useTheme();
  const panelHeight = SCREEN_HEIGHT * height;
  const animatedValue = useRef(new Animated.Value(0)).current;

  // Standardized animation config - subtle, smooth, minimal
  const ANIMATION_CONFIG = {
    open: {
      duration: 250,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
      useNativeDriver: true,
    },
    close: {
      duration: 200,
      easing: Easing.bezier(0.4, 0.0, 1, 1), // Material Design easing
      useNativeDriver: true,
    },
  };

  // Memoize interpolations
  const overlayOpacity = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.5],
      }),
    []
  );

  const panelTranslateY = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [panelHeight, 0],
      }),
    [panelHeight]
  );

  // PanResponder for drag-to-dismiss
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disableDrag,
      onPanResponderMove: (_, gestureState) => {
        if (!disableDrag && gestureState.dy > 0) {
          animatedValue.setValue(1 - gestureState.dy / panelHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (!disableDrag && gestureState.dy > panelHeight * 0.3) {
          closeSheet();
        } else if (!disableDrag) {
          // Snap back to open position
          Animated.timing(animatedValue, {
            toValue: 1,
            ...ANIMATION_CONFIG.open,
          }).start();
        }
      },
    })
  ).current;

  const openSheet = () => {
    if (onOpenStart) {
      onOpenStart();
    }
    Animated.timing(animatedValue, {
      toValue: 1,
      ...ANIMATION_CONFIG.open,
    }).start();
  };

  const closeSheet = () => {
    Animated.timing(animatedValue, {
      toValue: 0,
      ...ANIMATION_CONFIG.close,
    }).start(() => {
      if (onCloseComplete) {
        onCloseComplete();
      }
      onClose();
    });
  };

  useEffect(() => {
    if (visible) {
      openSheet();
    } else {
      // Reset animation value when hidden
      animatedValue.setValue(0);
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  const styles = createStyles(theme.colors);

  return (
    <>
      {/* Overlay */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.overlay,
          {
            opacity: overlayOpacity,
          },
        ]}
      >
        <TouchableWithoutFeedback onPress={closeSheet}>
          <View style={{ flex: 1 }} />
        </TouchableWithoutFeedback>
      </Animated.View>

      {/* Bottom Sheet */}
      <Animated.View
        {...(!disableDrag ? panResponder.panHandlers : {})}
        style={[
          styles.container,
          {
            height: panelHeight,
            transform: [{ translateY: panelTranslateY }],
          },
        ]}
      >
        <Pressable
          style={styles.inner}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>{title}</Text>
              {subtitle && (
                <Text style={styles.subtitle}>{subtitle}</Text>
              )}
            </View>
            {headerRight && (
              <View style={styles.headerRight}>
                {headerRight}
              </View>
            )}
          </View>

          {/* Content */}
          <View style={styles.content}>
            {children}
          </View>
        </Pressable>
      </Animated.View>
    </>
  );
};

const createStyles = (colors: any) => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay,
    zIndex: 999,
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    zIndex: 1000,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
  },
  inner: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  header: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Poppins',
    fontWeight: '600',
    color: colors.text,
    textAlign: 'left',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins',
    color: colors.textSecondary,
    marginTop: 4,
  },
  headerRight: {
    marginLeft: 16,
  },
  content: {
    flex: 1,
  },
});

