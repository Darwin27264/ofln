/**
 * Comprehensive Unit Test Suite for System Bar Transparency (Milestone 2 / R2)
 *
 * Verifies:
 * 1. src/utils/systemBars.ts:
 *    - isColorLight correctly handles 'transparent', malformed strings, dark & light hex colors
 *    - applySystemBarTheme forwards transparent statusBarColor without NaN luminance
 *    - applySystemBarTheme respects explicit darkIcons override and defaults nav bar color
 * 2. src/components/BottomSheet.tsx:
 *    - Dimmed backdrop overlay extends to physical top (-insets.top) behind transparent status bar
 *    - Handles zero insets gracefully without negative clipping
 * 3. src/components/HistoryDrawer.tsx:
 *    - Filter pill offsets by TOP_CHROME_TOP + topInset (8 + topInset)
 *    - Filter dropdown menu offsets by TOP_CHROME_TOP + topInset + FILTER_PILL_SIZE + 6
 *    - Multiselect header bar height and paddingTop clear topInset
 *    - ScrollView chat cards list applies paddingTop: TOP_CHROME_TOP + topInset
 * 4. Dynamic System Bar Theme Transitions & Inset Boundaries:
 *    - applySystemBarTheme forwards transparent status bar and correctly derives darkIcons for dark and light nav shells
 *    - HistoryDrawer renders multiselect header with zero clipping when topInset is 0
 */

import React from 'react';
import {
  Animated,
  NativeModules,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { isColorLight, applySystemBarTheme } from '../src/utils/systemBars';
import { BottomSheet } from '../src/components/BottomSheet';
import { HistoryDrawer } from '../src/components/HistoryDrawer';

// Mocks
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockInsets = { top: 40, bottom: 24, left: 0, right: 0 };
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => mockInsets),
  SafeAreaProvider: ({ children }: any) => children,
}));

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
    theme: {
      mode: 'dark',
      colors: {
        background: '#0D0D0E',
        surface: '#1A1A1E',
        card: '#18181A',
        overlay: 'rgba(0, 0, 0, 0.4)',
        text: '#FFFFFF',
        textSecondary: '#A0A0A5',
        textTertiary: '#707075',
        border: '#2A2A2E',
        borderLight: '#222226',
        primary: '#FFFFFF',
        primaryText: '#000000',
        secondary: '#2E2E34',
        accent: '#FFC845',
        accentText: '#1A1608',
        success: '#34C759',
        warning: '#FF9F0A',
        error: '#FF453A',
        transparent: 'transparent',
        glass: 'rgba(36, 36, 36, 0.75)',
      },
    },
    isDark: true,
  })),
}));

jest.mock('../src/utils/layoutInsets', () => ({
  useFloatingBackBottom: jest.fn(() => 32),
  floatingBackBottom: jest.fn((inset: number) => inset + 12),
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

// Helper to flatten and merge styles from React Test Renderer nodes
function getFlattenedStyle(node: renderer.ReactTestInstance): Record<string, any> {
  const styleProp = node.props.style;
  if (!styleProp) return {};
  if (Array.isArray(styleProp)) {
    return StyleSheet.flatten(styleProp) || {};
  }
  return StyleSheet.flatten([styleProp]) || {};
}

describe('Milestone 2 (R2): System Bar Transparency & Safe Area Clearance', () => {
  const originalTiming = Animated.timing;

  beforeAll(() => {
    Animated.timing = ((value: any, config: any) =>
      originalTiming(value, { ...config, useNativeDriver: false })) as any;
  });

  afterAll(() => {
    Animated.timing = originalTiming;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    NativeModules.SystemBars = {
      setSystemBarColors: jest.fn(),
    };
  });

  afterEach(() => {
    act(() => {
      jest.runAllTimers();
    });
    jest.useRealTimers();
  });

  const defaultProps = {
    isPanelOpen: true,
    isPanelAnimating: false,
    panelWidth: 360,
    panelAnim: new Animated.Value(0),
    backdropOpacity: new Animated.Value(1),
    panelStyle: { position: 'absolute' as const },
    topInset: 36,
    bottomInset: 24,
    chatHistory: [],
    groupedChatHistory: null,
    historySearchQuery: '',
    onHistorySearchQueryChange: jest.fn(),
    isLoadingHistory: false,
    currentChatId: null,
    isMultiselectMode: false,
    selectedChatIds: new Set<string>(),
    multiselectHeaderHeight: new Animated.Value(0),
    multiselectHeaderOpacity: new Animated.Value(0),
    onSelectAll: jest.fn(),
    onDeselectAll: jest.fn(),
    onDeleteSelected: jest.fn(),
    onExitMultiselect: jest.fn(),
    onToggleSelect: jest.fn(),
    editingChatId: null,
    editingTitle: '',
    onEditingTitleChange: jest.fn(),
    onRenameSave: jest.fn(),
    onRenameCancel: jest.fn(),
    onClose: jest.fn(),
    onChatPress: jest.fn(),
    onChatLongPress: jest.fn(),
    onNewChat: jest.fn(),
    menuVisible: false,
    menuPosition: null,
    selectedMenuChatId: null,
    menuOpacity: new Animated.Value(0),
    menuScale: new Animated.Value(1),
    menuItem0Opacity: new Animated.Value(1),
    menuItem0Translate: new Animated.Value(0),
    menuItem1Opacity: new Animated.Value(1),
    menuItem1Translate: new Animated.Value(0),
    menuItem2Opacity: new Animated.Value(1),
    menuItem2Translate: new Animated.Value(0),
    menuItem3Opacity: new Animated.Value(1),
    menuItem3Translate: new Animated.Value(0),
    menuItem4Opacity: new Animated.Value(1),
    menuItem4Translate: new Animated.Value(0),
    onDismissMenu: jest.fn(),
    onRename: jest.fn(),
    onPinToggle: jest.fn(),
    onExportChat: jest.fn(),
    onEnterMultiselect: jest.fn(),
    onDeleteChat: jest.fn(),
  };

  describe('1. TypeScript systemBars Utility (src/utils/systemBars.ts)', () => {
    test('isColorLight returns false for transparent inputs without producing NaN luminance', () => {
      expect(isColorLight('transparent')).toBe(false);
      expect(isColorLight('TRANSPARENT')).toBe(false);
      expect(isColorLight('Transparent')).toBe(false);
      expect(isColorLight('')).toBe(false);
      expect(isColorLight('#xyz')).toBe(false);
      expect(isColorLight('#12')).toBe(false);
    });

    test('isColorLight correctly identifies dark vs light hex colors', () => {
      // Dark palette
      expect(isColorLight('#0D0D0E')).toBe(false);
      expect(isColorLight('#181818')).toBe(false);
      expect(isColorLight('#000000')).toBe(false);
      expect(isColorLight('#1A1A1E')).toBe(false);

      // Light palette
      expect(isColorLight('#FFFFFF')).toBe(true);
      expect(isColorLight('#E8E8E8')).toBe(true);
      expect(isColorLight('#FAFAFA')).toBe(true);
      expect(isColorLight('#F0F0F0')).toBe(true);
    });

    test('applySystemBarTheme forwards transparent status bar and computes darkIcons based on nav bar or theme override', () => {
      // 1. Transparent status bar with dark nav bar shell
      applySystemBarTheme({
        statusBarColor: 'transparent',
        navBarColor: '#181818',
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        '#181818',
        false, // darkIcons = false (light icons for dark nav/theme)
      );

      // 2. Transparent status bar with light nav bar shell
      applySystemBarTheme({
        statusBarColor: 'transparent',
        navBarColor: '#E8E8E8',
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        '#E8E8E8',
        true, // darkIcons = true (dark icons for light nav/theme)
      );

      // 3. Explicit darkIcons override
      applySystemBarTheme({
        statusBarColor: 'transparent',
        navBarColor: '#181818',
        darkIcons: true,
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        '#181818',
        true, // override accepted
      );

      // 4. Fully transparent both bars
      applySystemBarTheme({
        statusBarColor: 'transparent',
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        'transparent',
        false,
      );
    });
  });

  describe('2. BottomSheet Overlay Seamless Scrim (src/components/BottomSheet.tsx)', () => {
    test('extends backdrop overlay by -insets.top so scrim covers status bar continuously', () => {
      const { useSafeAreaInsets } = require('react-native-safe-area-context');
      (useSafeAreaInsets as jest.Mock).mockReturnValue({
        top: 42,
        bottom: 24,
        left: 0,
        right: 0,
      });

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <BottomSheet visible={true} onClose={() => {}}>
            <Text>Quick Panel Content</Text>
          </BottomSheet>
        );
      });

      expect(tree).not.toBeNull();
      const root = tree!.root;

      // Find all Animated.Views
      const animatedViews = root.findAllByType(Animated.View);
      // The overlay is the first Animated.View child
      const overlayView = animatedViews[0];
      const flattened = getFlattenedStyle(overlayView);

      // Verify the negative top inset is applied to pull scrim behind the status bar
      expect(flattened.top).toBe(-42);
      expect(flattened.backgroundColor).toBe('rgba(0, 0, 0, 0.28)');
    });

    test('does not apply negative top offset when insets.top is 0', () => {
      const { useSafeAreaInsets } = require('react-native-safe-area-context');
      (useSafeAreaInsets as jest.Mock).mockReturnValue({
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
      });

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <BottomSheet visible={true} onClose={() => {}}>
            <Text>Quick Panel Content</Text>
          </BottomSheet>
        );
      });

      expect(tree).not.toBeNull();
      const root = tree!.root;
      const animatedViews = root.findAllByType(Animated.View);
      const overlayView = animatedViews[0];
      const flattened = getFlattenedStyle(overlayView);

      // top is either 0 from absoluteFillObject or undefined, not negative
      expect(flattened.top).toBe(0);
    });
  });

  describe('3. HistoryDrawer Top Chrome & Safe Clearance (src/components/HistoryDrawer.tsx)', () => {
    test('positions filter pill with top: 8 + topInset', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={44} />);
      });

      const root = tree!.root;
      // Filter pill button has accessibilityLabel matching "Filter by date"
      const filterPillButton = root.findByProps({
        accessibilityLabel: 'Filter by date, All time',
      });
      // Parent View wraps the filter pill
      const pillContainer = filterPillButton.parent;
      expect(pillContainer).not.toBeNull();
      const style = getFlattenedStyle(pillContainer!);

      // TOP_CHROME_TOP (8) + topInset (44) = 52
      expect(style.top).toBe(52);
      expect(style.right).toBe(16);
      expect(style.position).toBe('absolute');
    });

    test('positions filter menu dropdown below filter pill at TOP_CHROME_TOP + topInset + FILTER_PILL_SIZE + 6', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={44} />);
      });

      const root = tree!.root;
      const filterPillButton = root.findByProps({
        accessibilityLabel: 'Filter by date, All time',
      });

      // Tap filter pill to open the menu
      act(() => {
        filterPillButton.props.onPress();
      });

      // Find the dropdown Animated.View with minWidth: 168
      const dropdownView = root.findAllByType(Animated.View).find((node: any) => {
        const s = getFlattenedStyle(node);
        return s.minWidth === 168;
      });

      expect(dropdownView).toBeDefined();
      const style = getFlattenedStyle(dropdownView!);

      // TOP_CHROME_TOP (8) + topInset (44) + FILTER_PILL_SIZE (42) + 6 = 100
      expect(style.top).toBe(100);
      expect(style.right).toBe(16);
    });

    test('offsets cards list ScrollView paddingTop by TOP_CHROME_TOP + topInset in standard mode', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={40} isMultiselectMode={false} />);
      });

      const root = tree!.root;
      const scrollView = root.findByType(ScrollView);
      const contentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

      // TOP_CHROME_TOP (8) + topInset (40) = 48
      expect(contentStyle.paddingTop).toBe(48);
    });

    test('uses compact paddingTop (4) when multiselect mode is active', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={40} isMultiselectMode={true} />);
      });

      const root = tree!.root;
      const scrollView = root.findByType(ScrollView);
      const contentStyle = StyleSheet.flatten(scrollView.props.contentContainerStyle);

      expect(contentStyle.paddingTop).toBe(4);
    });

    test('multiselect header expands height outputRange to clear inner row and adds topInset padding', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={34} isMultiselectMode={true} />);
      });

      const root = tree!.root;
      // Find the multiselect header row
      const selectedText = root.findAllByType(Text).find((t: any) => {
        const c = t.props.children;
        return typeof c === 'string' ? c.includes('selected') : Array.isArray(c) ? c.includes('selected') || c.some((item: any) => typeof item === 'string' && item.includes('selected')) : false;
      });
      expect(selectedText).toBeDefined();

      let headerRow = selectedText!.parent;
      while (headerRow && (getFlattenedStyle(headerRow).paddingTop === undefined)) {
        headerRow = headerRow.parent;
      }
      expect(headerRow).not.toBeNull();
      const rowStyle = getFlattenedStyle(headerRow!);

      // paddingTop is Math.max(12, topInset + 4) = Math.max(12, 38) = 38
      expect(rowStyle.paddingTop).toBe(38);
    });
  });

  describe('4. Dynamic System Bar Theme Transitions & Inset Boundaries', () => {
    test('applySystemBarTheme forwards transparent status bar and correctly derives darkIcons for dark and light nav shells', () => {
      // Chat screen: transparent status bar with dark nav bar shell
      applySystemBarTheme({
        statusBarColor: 'transparent',
        navBarColor: '#0D0D0E',
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        '#0D0D0E',
        false
      );

      // Frosted panel / Quick Panel in light theme: transparent status bar with light nav bar
      applySystemBarTheme({
        statusBarColor: 'transparent',
        navBarColor: '#E8E8E8',
      });
      expect(NativeModules.SystemBars.setSystemBarColors).toHaveBeenCalledWith(
        'transparent',
        '#E8E8E8',
        true
      );
    });

    test('HistoryDrawer renders multiselect header with zero clipping when topInset is 0', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<HistoryDrawer {...defaultProps} topInset={0} isMultiselectMode={true} />);
      });
      expect(tree).not.toBeNull();
      const root = tree!.root;
      const selectedText = root.findAllByType(Text).find((t: any) => {
        const c = t.props.children;
        return typeof c === 'string'
          ? c.includes('selected')
          : Array.isArray(c)
          ? c.some((item: any) => typeof item === 'string' && item.includes('selected'))
          : false;
      });
      expect(selectedText).toBeDefined();

      let headerRow = selectedText!.parent;
      while (headerRow && (getFlattenedStyle(headerRow).paddingTop === undefined)) {
        headerRow = headerRow.parent;
      }
      expect(headerRow).not.toBeNull();
      const rowStyle = getFlattenedStyle(headerRow!);
      expect(rowStyle.paddingTop).toBe(12);
      expect(rowStyle.paddingBottom).toBe(12);
    });
  });
});
