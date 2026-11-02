import React, { useState, useCallback, useEffect } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
  StyleProp,
  TextStyle,
  ViewStyle,
  LayoutChangeEvent,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

export interface CollapsibleTitleProps {
  /** Primary title text. */
  title: string;
  /** Animated value from useCollapsibleTitle (1 = expanded, 0 = collapsed). */
  anim: Animated.Value;
  /** Optional secondary subtitle text. */
  subtitle?: string;
  /** Style override for title text. */
  style?: StyleProp<TextStyle>;
  /** Style override for outer animated container. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Optional right-aligned accessory action node. */
  rightAction?: React.ReactNode;
  /** Optional line limit for title text (e.g. 2 lines for TaskRunDetail). */
  numberOfLines?: number;
  /** Optional testID for component testing. */
  testID?: string;
}

export const CollapsibleTitle: React.FC<CollapsibleTitleProps> = React.memo(
  ({
    title,
    anim,
    subtitle,
    style,
    containerStyle,
    rightAction,
    numberOfLines,
    testID,
  }) => {
    const { theme } = useTheme();
    const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);

    // Reset height measurement if text changes dynamically
    useEffect(() => {
      setMeasuredHeight(null);
    }, [title, subtitle]);

    const handleLayout = useCallback((e: LayoutChangeEvent) => {
      const h = e.nativeEvent?.layout?.height;
      if (typeof h === 'number' && h > 0) {
        // Retain max measured height so collapsing layout never truncates measured target
        setMeasuredHeight((prev) => (prev === null ? h : Math.max(prev, h)));
      }
    }, []);

    // Extract custom marginBottom from style prop if supplied; default to 40
    const flatStyle = StyleSheet.flatten(style);
    const targetMarginBottom =
      typeof flatStyle?.marginBottom === 'number' ? flatStyle.marginBottom : 40;

    // Remove static marginBottom from inner text style so outer animated view owns it
    const titleStyleWithoutMargin: TextStyle = flatStyle
      ? { ...flatStyle, marginBottom: 0 }
      : {};

    // Fallback height for tests and initial frame before onLayout
    const fallbackHeight =
      numberOfLines && numberOfLines > 1
        ? (subtitle ? 136 : 96)
        : (subtitle ? 96 : 56);
    const expandedHeight = Math.ceil(measuredHeight ?? fallbackHeight) + 4;

    const opacity = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });

    const scale = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [0.92, 1],
      extrapolate: 'clamp',
    });

    const translateY = anim.interpolate({
      inputRange: [0, 1],
      outputRange: [-10, 0],
      extrapolate: 'clamp',
    });

    const textColor = theme?.colors?.text ?? '#000000';
    const subtitleColor = theme?.colors?.textSecondary ?? '#334155';

    return (
      <Animated.View
        testID={testID}
        style={[
          styles.container,
          containerStyle,
          {
            marginBottom: targetMarginBottom,
            opacity,
            transform: [{ scale }, { translateY }],
          },
        ]}
      >
        <View onLayout={handleLayout} style={styles.measureWrapper}>
          <View style={styles.innerRow}>
            <View style={styles.textContainer}>
              <Text
                style={[
                  styles.title,
                  { color: textColor },
                  titleStyleWithoutMargin,
                ]}
                numberOfLines={numberOfLines}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  style={[
                    styles.subtitle,
                    { color: subtitleColor },
                  ]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {rightAction ? (
              <View style={styles.rightActionContainer}>{rightAction}</View>
            ) : null}
          </View>
        </View>
      </Animated.View>
    );
  },
);

CollapsibleTitle.displayName = 'CollapsibleTitle';

const styles = StyleSheet.create({
  container: {
    width: '100%',
    overflow: 'hidden',
  },
  measureWrapper: {
    width: '100%',
  },
  innerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 36,
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
  subtitle: {
    fontSize: 14,
    fontFamily: 'Poppins',
    marginTop: 4,
  },
  rightActionContainer: {
    marginLeft: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default CollapsibleTitle;
