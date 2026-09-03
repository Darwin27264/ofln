/**
 * Frosted segmented control with a sliding active pill.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

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
  labelStyle: TextStyle;
  activeLabelColor: string;
  inactiveLabelColor: string;
  activePillColor: string;
  style?: StyleProp<ViewStyle>;
};

type TabLayout = { x: number; width: number };

export const SegmentedTabBar: React.FC<SegmentedTabBarProps> = ({
  tabs,
  activeId,
  onChange,
  chromeOuter,
  chromeInner,
  labelStyle,
  activeLabelColor,
  inactiveLabelColor,
  activePillColor,
  style,
}) => {
  const layouts = useRef<Record<string, TabLayout>>({});
  const pillReady = useRef(false);
  const pillX = useRef(new Animated.Value(0)).current;
  const pillWidth = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(0)).current;

  const animateToTab = useCallback(
    (id: string, animated: boolean) => {
      const layout = layouts.current[id];
      if (!layout) return;

      const config = {
        duration: ANIMATION_DURATIONS.STANDARD,
        easing: EASING.STANDARD,
        useNativeDriver: false,
      };

      if (!animated) {
        pillX.setValue(layout.x);
        pillWidth.setValue(layout.width);
        pillOpacity.setValue(1);
        pillReady.current = true;
        return;
      }

      Animated.parallel([
        Animated.timing(pillX, { ...config, toValue: layout.x }),
        Animated.timing(pillWidth, { ...config, toValue: layout.width }),
        Animated.timing(pillOpacity, { ...config, toValue: 1 }),
      ]).start(() => {
        pillReady.current = true;
      });
    },
    [pillOpacity, pillWidth, pillX],
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
    <View style={[chromeOuter, styles.row, style]}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pill,
          {
            opacity: pillOpacity,
            backgroundColor: activePillColor,
            width: pillWidth,
            transform: [{ translateX: pillX }],
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
          >
            <Text
              style={[
                labelStyle,
                { color: active ? activeLabelColor : inactiveLabelColor },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
