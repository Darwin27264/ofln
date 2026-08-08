/**
 * Floating frosted panel — fade/scale presence, no slide or drag.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Animated,
  Pressable,
  TouchableWithoutFeedback,
  Dimensions,
  StyleSheet,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import type { ThemeColors } from '../context/ThemeContext';
import { FrostedGlass } from './FrostedGlass';
import { useFadeScalePresence } from '../hooks/useFadeScalePresence';
import { OVERLAY_MOTION } from '../utils/animationConfig';
import { useFloatingBackBottom } from '../utils/layoutInsets';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Fraction of screen height (0–1). Default 0.55. */
  height?: number;
  headerRight?: React.ReactNode;
  subtitle?: string;
  /** After exit fade finishes and the panel unmounts. */
  onCloseComplete?: () => void;
}

const SIDE_INSET = 14;

export const BottomSheet: React.FC<BottomSheetProps> = ({
  visible,
  onClose,
  title,
  children,
  height = 0.55,
  headerRight,
  subtitle,
  onCloseComplete,
}) => {
  const { theme } = useTheme();
  // Same bottom clearance as floating Back — avoids hugging the system nav.
  const bottomInset = useFloatingBackBottom();
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const mounted = useFadeScalePresence(visible, opacity, scale, onCloseComplete);
  const [screenHeight, setScreenHeight] = useState(
    () => Dimensions.get('window').height,
  );

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      setScreenHeight(window.height);
    });
    return () => sub?.remove();
  }, []);

  const panelHeight = useMemo(
    () => Math.round(screenHeight * height),
    [screenHeight, height],
  );
  const styles = useMemo(() => createStyles(theme.colors), [theme.colors]);

  if (!mounted) return null;

  return (
    <View style={styles.root} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose}>
        <Animated.View
          style={[styles.overlay, { opacity }]}
          pointerEvents={visible ? 'auto' : 'none'}
        />
      </TouchableWithoutFeedback>

      <Animated.View
        pointerEvents={visible ? 'auto' : 'none'}
        style={[
          styles.panel,
          {
            height: panelHeight,
            bottom: Math.max(SIDE_INSET, bottomInset),
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <FrostedGlass variant="panel" style={StyleSheet.absoluteFillObject} />
        <Pressable style={styles.inner} onPress={(e) => e.stopPropagation()}>
          {(title || subtitle || headerRight) && (
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                {!!title && <Text style={styles.title}>{title}</Text>}
                {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
              </View>
              {headerRight ? (
                <View style={styles.headerRight}>{headerRight}</View>
              ) : null}
            </View>
          )}
          <View style={styles.content}>{children}</View>
        </Pressable>
      </Animated.View>
    </View>
  );
};

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 1000,
      elevation: 1000,
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.28)',
    },
    panel: {
      position: 'absolute',
      left: SIDE_INSET,
      right: SIDE_INSET,
      backgroundColor: 'transparent',
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 18,
      elevation: 12,
    },
    inner: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
    },
    header: {
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerLeft: {
      flex: 1,
      minWidth: 0,
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
      marginLeft: 12,
    },
    content: {
      flex: 1,
    },
  });
