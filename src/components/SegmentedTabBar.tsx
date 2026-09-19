/**
 * Frosted segmented control with a snappy sliding active pill.
 * Frost shell is built-in so every screen gets the same chrome.
 */

import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { FrostedGlass } from './FrostedGlass';
import { useTheme } from '../context/ThemeContext';
import {
  chromeFontForRole,
  DEFAULT_CHROME_SCALE,
  type ChromeScale,
} from '../utils/chromeScale';

export type SegmentedTab = {
  id: string;
  label: string;
};

type SegmentedTabBarProps = {
  tabs: SegmentedTab[];
  activeId: string;
  onChange: (id: string) => void;
  chromeOuter: StyleProp<ViewStyle>;
  chromeInner?: StyleProp<ViewStyle>;
  chromeScale?: ChromeScale;
  activeLabelColor: string;
  inactiveLabelColor: string;
  activePillColor: string;
  style?: StyleProp<ViewStyle>;
};

type TabLayout = { x: number; width: number };

/** Snappy slide with a short, satisfying settle — not a linear ease. */
const PILL_SPRING = {
  stiffness: 420,
  damping: 28,
  mass: 0.72,
  overshootClamping: false,
  restDisplacementThreshold: 0.2,
  restSpeedThreshold: 0.2,
  useNativeDriver: false as const,
};

export const SegmentedTabBar: React.FC<SegmentedTabBarProps> = ({
  tabs,
  activeId,
  onChange,
  chromeOuter,
  chromeInner,
  chromeScale = DEFAULT_CHROME_SCALE,
  activeLabelColor,
  inactiveLabelColor,
  activePillColor,
  style,
}) => {
  const { theme } = useTheme();
  const layouts = useRef<Record<string, TabLayout>>({});
  const pillReady = useRef(false);
  const pillX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;
  const pillScale = useRef(new Animated.Value(1)).current;

  const shellBorder = useMemo(() => {
    const dark = theme.mode === 'dark';
    return dark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.1)';
  }, [theme.mode]);

  const animateToTab = useCallback(
    (id: string, animated: boolean) => {
      const layout = layouts.current[id];
      if (!layout) return;

      if (!animated) {
        pillX.setValue(layout.x);
        pillWidth.setValue(layout.width);
        pillOpacity.setValue(1);
        pillScale.setValue(1);
        pillReady.current = true;
        return;
      }

      pillX.stopAnimation();
      pillWidth.stopAnimation();
      pillScale.stopAnimation();

      // Quick squash as the pill starts moving, then spring back — reads as tactile.
      pillScale.setValue(0.94);

      Animated.parallel([
        Animated.spring(pillX, { ...PILL_SPRING, toValue: layout.x }),
        Animated.spring(pillWidth, { ...PILL_SPRING, toValue: layout.width }),
        Animated.spring(pillScale, {
          ...PILL_SPRING,
          toValue: 1,
          stiffness: 520,
        }),
        Animated.timing(pillOpacity, {
          toValue: 1,
          duration: 90,
          useNativeDriver: false,
        }),
      ]).start(() => {
        pillReady.current = true;
      });
    },
    [pillOpacity, pillScale, pillWidth, pillX],
  );

  useEffect(() => {
    animateToTab(activeId, pillReady.current);
  }, [activeId, animateToTab]);

  const onTabLayout = useCallback(
    (id: string, x: number, width: number) => {
      layouts.current[id] = { x, width };
      if (id === activeId) {
        animateToTab(id, pillReady.current);
      }
    },
    [activeId, animateToTab],
  );

  return (
    <View
      style={[
        styles.shell,
        { borderColor: shellBorder },
        chromeOuter,
        // Frost must show through — callers often pass a translucent fill.
        styles.shellFrostOverride,
        style,
      ]}
    >
      <FrostedGlass style={StyleSheet.absoluteFillObject} />
      <View style={styles.row}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            {
              opacity: pillOpacity,
              backgroundColor: activePillColor,
              width: pillWidth,
              transform: [
                { translateX: pillX },
                { scaleY: pillScale },
                { scaleX: pillScale },
              ],
            },
          ]}
        />
        {tabs.map((tab) => {
          const active = tab.id === activeId;
          return (
            <TouchableOpacity
              key={tab.id}
              onPress={() => onChange(tab.id)}
              onLayout={(e) => {
                const { x, width } = e.nativeEvent.layout;
                onTabLayout(tab.id, x, width);
              }}
              style={[styles.tab, chromeInner]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.label,
                  {
                    fontSize: chromeFontForRole('tab', chromeScale),
                    lineHeight: Math.round(
                      chromeFontForRole('tab', chromeScale) * 1.375,
                    ),
                  },
                  { color: active ? activeLabelColor : inactiveLabelColor },
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  shell: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
  shellFrostOverride: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: '600',
    fontFamily: 'Poppins',
  },
});
