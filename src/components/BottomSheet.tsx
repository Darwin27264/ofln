/**
 * BottomSheet Component
 * 
 * A unified, reusable bottom sheet component with standardized:
 * - Smooth, performant animations with proper state management
 * - Velocity-based drag-to-dismiss gesture support
 * - Drag handle area to prevent conflicts with ScrollView content
 * - Robust animation cancellation and cleanup
 * - Consistent header style and font sizes
 * - Uniform dimensions and layout
 */

import React, { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  Animated,
  PanResponder,
  Pressable,
  TouchableWithoutFeedback,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../context/ThemeContext';
import { ANIMATION_CONFIG, EASING } from '../utils/animationConfig';

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

const DRAG_HANDLE_HEIGHT = 40; // Height of the drag handle area
const VELOCITY_THRESHOLD = 0.5; // Minimum velocity to trigger dismiss
const DRAG_THRESHOLD = 0.3; // Percentage of panel height to drag before dismissing

// Bottom sheet specific animation configs
// Uses centralized configs with slight variations for this component
const BOTTOM_SHEET_ANIMATIONS = {
  open: {
    ...ANIMATION_CONFIG.panel,
    duration: 300, // Slightly longer for bottom sheet opening
    easing: EASING.EASE_OUT,
  },
  close: {
    ...ANIMATION_CONFIG.panel,
    duration: 250,
    easing: EASING.EASE_IN,
  },
  snapBack: {
    ...ANIMATION_CONFIG.panel,
    easing: EASING.EASE_OUT,
  },
} as const;

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
  const animatedValue = useRef(new Animated.Value(0)).current;
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const currentAnimatedValue = useRef(0); // Track current animated value to avoid _value access
  const [isMounted, setIsMounted] = useState(false);
  const [screenHeight, setScreenHeight] = useState(() => Dimensions.get('window').height);

  // Handle orientation changes and window resizing
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenHeight(window.height);
    });

    return () => {
      subscription?.remove();
    };
  }, []);

  // Memoize panel height calculation
  const panelHeight = useMemo(() => screenHeight * height, [screenHeight, height]);

  // Cancel any ongoing animation
  const cancelAnimation = useCallback(() => {
    if (currentAnimation.current) {
      currentAnimation.current.stop();
      currentAnimation.current = null;
    }
  }, []);

  // Update current value ref when animated value changes
  useEffect(() => {
    const listenerId = animatedValue.addListener(({ value }) => {
      currentAnimatedValue.current = value;
    });

    return () => {
      animatedValue.removeListener(listenerId);
    };
  }, [animatedValue]);

  // Memoize interpolations
  const overlayOpacity = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.5],
        extrapolate: 'clamp',
      }),
    [animatedValue]
  );

  const panelTranslateY = useMemo(
    () =>
      animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: [panelHeight, 0],
        extrapolate: 'clamp',
      }),
    [animatedValue, panelHeight]
  );

  const openSheet = useCallback(() => {
    cancelAnimation();
    if (onOpenStart) {
      onOpenStart();
    }
    
    // Ensure we start from 0
    animatedValue.setValue(0);
    
    const animation = Animated.timing(animatedValue, {
      toValue: 1,
      ...BOTTOM_SHEET_ANIMATIONS.open,
    });
    
    currentAnimation.current = animation;
    animation.start(() => {
      currentAnimation.current = null;
    });
  }, [animatedValue, onOpenStart, cancelAnimation]);

  const closeSheet = useCallback(() => {
    cancelAnimation();
    
    const animation = Animated.timing(animatedValue, {
      toValue: 0,
      ...BOTTOM_SHEET_ANIMATIONS.close,
    });
    
    currentAnimation.current = animation;
    animation.start(() => {
      currentAnimation.current = null;
      if (onCloseComplete) {
        onCloseComplete();
      }
      onClose();
    });
  }, [animatedValue, onClose, onCloseComplete, cancelAnimation]);

  // PanResponder for drag-to-dismiss with velocity support
  // Attached to drag handle area to prevent conflicts with ScrollView
  // Recreated when disableDrag or panelHeight changes
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disableDrag,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Respond if dragging down
          return !disableDrag && gestureState.dy > 5;
        },
        onPanResponderGrant: () => {
          cancelAnimation();
          isDragging.current = true;
          // Use tracked value instead of private _value property
          dragStartY.current = currentAnimatedValue.current;
        },
        onPanResponderMove: (_, gestureState) => {
          if (!disableDrag && isDragging.current && gestureState.dy > 0) {
            // Calculate new value based on drag distance
            const dragProgress = gestureState.dy / panelHeight;
            const newValue = Math.max(0, Math.min(1, dragStartY.current - dragProgress));
            animatedValue.setValue(newValue);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          isDragging.current = false;
          
          if (disableDrag) {
            return;
          }

          const dragDistance = gestureState.dy;
          const dragProgress = dragDistance / panelHeight;
          const velocity = gestureState.vy;
          
          // Determine if we should dismiss based on drag distance or velocity
          const shouldDismiss = 
            dragProgress > DRAG_THRESHOLD || 
            (dragProgress > 0.15 && velocity > VELOCITY_THRESHOLD);

          if (shouldDismiss) {
            closeSheet();
          } else {
            // Snap back to open position
            const animation = Animated.timing(animatedValue, {
              toValue: 1,
              ...BOTTOM_SHEET_ANIMATIONS.snapBack,
            });
            
            currentAnimation.current = animation;
            animation.start(() => {
              currentAnimation.current = null;
            });
          }
        },
        onPanResponderTerminate: () => {
          isDragging.current = false;
          // Snap back if gesture is interrupted
          if (!disableDrag) {
            const animation = Animated.timing(animatedValue, {
              toValue: 1,
              ...BOTTOM_SHEET_ANIMATIONS.snapBack,
            });
            
            currentAnimation.current = animation;
            animation.start(() => {
              currentAnimation.current = null;
            });
          }
        },
      }),
    [disableDrag, panelHeight, animatedValue, cancelAnimation, closeSheet]
  );

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      // Small delay to ensure mount before animation
      const timer = setTimeout(() => {
        openSheet();
      }, 10);
      return () => clearTimeout(timer);
    } else {
      // Reset animation value when hidden
      cancelAnimation();
      animatedValue.setValue(0);
      setIsMounted(false);
      return undefined;
    }
  }, [visible, openSheet, cancelAnimation, animatedValue]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimation();
    };
  }, [cancelAnimation]);

  // Memoize styles to avoid recreating on every render
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  if (!visible && !isMounted) {
    return null;
  }

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
        style={[
          styles.container,
          {
            height: panelHeight,
            transform: [{ translateY: panelTranslateY }],
          },
        ]}
      >
        {/* Drag Handle Area - Always visible for UI consistency */}
        <View
          {...(disableDrag ? {} : panResponder.panHandlers)}
          style={styles.dragHandleArea}
        >
          <View style={styles.dragHandle} />
        </View>
        
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

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.overlay || 'rgba(0, 0, 0, 0.5)',
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
    shadowColor: colors.text || '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  dragHandleArea: {
    height: DRAG_HANDLE_HEIGHT,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 0,
    zIndex: 1,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border || '#E0E0E0',
    opacity: 0.6,
  },
  inner: {
    flex: 1,
    padding: 16,
  },
  header: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 0,
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

