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
 *
 * Robustness (aligned with history panel behavior):
 * - Stays mounted when closed so reopen is instant (no remount).
 * - When visible becomes false (overlay tap or programmatic e.g. BackHandler),
 *   we snap animated value to 0 so the sheet never appears stuck or half-visible.
 * - RAF open is guarded with visibleRef so we never open after a quick close.
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

const DRAG_HANDLE_HEIGHT = 50; // Height of the drag handle area
const VELOCITY_THRESHOLD = 0.5; // Minimum velocity to trigger dismiss
const DRAG_THRESHOLD = 0.25; // Percentage of panel height to drag before dismissing
const MIN_DRAG_DISTANCE = 10; // Minimum distance before recognizing drag

// Bottom sheet specific animation configs
// Uses centralized configs with slight variations for this component
const BOTTOM_SHEET_ANIMATIONS = {
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
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

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
    // Reset drag state
    isDragging.current = false;
    dragStartY.current = 0;
    
    if (onOpenStart) {
      onOpenStart();
    }
    
    // Ensure we start from 0 and sync the ref
    animatedValue.setValue(0);
    currentAnimatedValue.current = 0;
    
    // Use spring animation for more native, smooth feel (like history panel)
    const animation = Animated.spring(animatedValue, {
      toValue: 1,
      useNativeDriver: true,
      tension: 100,
      friction: 14,
      overshootClamping: true,
    });
    
    currentAnimation.current = animation;
    animation.start((finished) => {
      currentAnimation.current = null;
      if (finished) {
        // Ensure ref is synced when animation completes
        currentAnimatedValue.current = 1;
      }
    });
  }, [animatedValue, onOpenStart, cancelAnimation]);

  const closeSheet = useCallback(() => {
    cancelAnimation();
    // Reset drag state
    isDragging.current = false;
    dragStartY.current = 0;
    
    const animation = Animated.timing(animatedValue, {
      toValue: 0,
      ...BOTTOM_SHEET_ANIMATIONS.close,
    });
    
    currentAnimation.current = animation;
    animation.start((finished) => {
      currentAnimation.current = null;
      if (finished) {
        // Ensure ref is synced when animation completes
        currentAnimatedValue.current = 0;
      }
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
        onStartShouldSetPanResponder: () => {
          return !disableDrag;
        },
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only respond to downward drags that are clearly intentional
          if (disableDrag) return false;
          // Check if dragging down and not scrolling horizontally
          // Be more lenient with the threshold to catch drags earlier
          const isDownwardDrag = gestureState.dy > 3;
          const isVerticalDrag = Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 0.5;
          return isDownwardDrag && isVerticalDrag;
        },
        onPanResponderGrant: () => {
          if (disableDrag) return;
          cancelAnimation();
          isDragging.current = true;
          // Use tracked value, but ensure it's synced (should be 1 when fully open)
          // If there's a discrepancy, use the actual animated value
          const currentValue = currentAnimatedValue.current;
          dragStartY.current = Math.max(0, Math.min(1, currentValue));
        },
        onPanResponderMove: (_, gestureState) => {
          if (!disableDrag && isDragging.current && gestureState.dy > 0) {
            // Calculate new value based on drag distance
            // When dragging down, we decrease the animated value (from 1 to 0)
            const dragProgress = gestureState.dy / panelHeight;
            const newValue = Math.max(0, Math.min(1, dragStartY.current - dragProgress));
            animatedValue.setValue(newValue);
          } else if (!disableDrag && isDragging.current && gestureState.dy < 0) {
            // Allow slight upward drag to snap back (but not beyond 1)
            const dragProgress = Math.abs(gestureState.dy) / panelHeight;
            const newValue = Math.min(1, dragStartY.current + dragProgress * 0.5);
            animatedValue.setValue(newValue);
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (!isDragging.current) return;
          isDragging.current = false;
          
          if (disableDrag) {
            return;
          }

          const dragDistance = gestureState.dy;
          const dragProgress = dragDistance / panelHeight;
          const velocity = gestureState.vy || 0;
          
          // Determine if we should dismiss based on drag distance or velocity
          const shouldDismiss = 
            dragProgress > DRAG_THRESHOLD || 
            (dragProgress > 0.1 && velocity > VELOCITY_THRESHOLD);

          if (shouldDismiss) {
            // Animate close smoothly
            isDragging.current = false; // Reset drag state before closing
            const animation = Animated.timing(animatedValue, {
              toValue: 0,
              ...BOTTOM_SHEET_ANIMATIONS.close,
            });
            
            currentAnimation.current = animation;
            animation.start((finished) => {
              currentAnimation.current = null;
              if (finished) {
                currentAnimatedValue.current = 0;
              }
              if (onCloseComplete) {
                onCloseComplete();
              }
              onClose();
            });
          } else {
            // Snap back to open position
            isDragging.current = false; // Reset drag state
            const animation = Animated.timing(animatedValue, {
              toValue: 1,
              ...BOTTOM_SHEET_ANIMATIONS.snapBack,
            });
            
            currentAnimation.current = animation;
            animation.start((finished) => {
              currentAnimation.current = null;
              if (finished) {
                currentAnimatedValue.current = 1;
              }
            });
          }
        },
        onPanResponderTerminate: () => {
          if (!isDragging.current) return;
          isDragging.current = false;
          // Snap back if gesture is interrupted
          if (!disableDrag) {
            const animation = Animated.timing(animatedValue, {
              toValue: 1,
              ...BOTTOM_SHEET_ANIMATIONS.snapBack,
            });
            
            currentAnimation.current = animation;
            animation.start((finished) => {
              currentAnimation.current = null;
              if (finished) {
                currentAnimatedValue.current = 1;
              }
            });
          }
        },
      }),
    [disableDrag, panelHeight, animatedValue, cancelAnimation, closeSheet, onCloseComplete, onClose]
  );

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      isDragging.current = false;
      dragStartY.current = 0;
      // Start animation on next frame so layout is ready. Guard so we don't open if visible flipped to false before RAF fired.
      const raf = requestAnimationFrame(() => {
        if (!visibleRef.current) return;
        openSheet();
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // When closed (user tapped overlay or programmatic e.g. BackHandler): snap to closed so we never show a stuck half-visible sheet.
      cancelAnimation();
      isDragging.current = false;
      dragStartY.current = 0;
      animatedValue.setValue(0);
      currentAnimatedValue.current = 0;
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

  // Never rendered until first open; then stay mounted for instant reopen (like history panel)
  if (!isMounted) {
    return null;
  }

  return (
    <>
      {/* Overlay - non-interactive when closed so content behind is tappable */}
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

      {/* Bottom Sheet - non-interactive when closed */}
      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
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
          collapsable={false}
        >
          <View style={styles.dragHandle} />
        </View>
        
        <Pressable
          style={styles.inner}
          onPress={(e) => e.stopPropagation()}
          collapsable={false}
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
    paddingBottom: 8,
    zIndex: 10,
    position: 'relative',
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
    marginTop: -8,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 18,
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

