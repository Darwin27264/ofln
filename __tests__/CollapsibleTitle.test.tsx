import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import {
  CollapsibleTitle,
} from '../src/components/CollapsibleTitle';
import {
  useCollapsibleTitle,
  UseCollapsibleTitleOptions,
  UseCollapsibleTitleResult,
} from '../src/hooks/useCollapsibleTitle';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
    theme: {
      mode: 'dark',
      colors: {
        background: '#0A0A0A',
        surface: '#141414',
        card: '#1A1A1A',
        overlay: 'rgba(255, 255, 255, 0.1)',
        text: '#FFFFFF',
        textSecondary: '#E5E7EB',
        textTertiary: '#9CA3AF',
        border: '#2A2A2A',
        borderLight: '#1F1F1F',
        primary: '#FFFFFF',
        primaryText: '#000000',
        secondary: '#2A2A2A',
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

// Test harness for hook testing
function HookHarness({
  options,
  onResult,
}: {
  options?: UseCollapsibleTitleOptions;
  onResult: (res: UseCollapsibleTitleResult) => void;
}) {
  const result = useCollapsibleTitle(options);
  onResult(result);
  return null;
}

describe('CollapsibleTitle Component', () => {
  let anim: Animated.Value;

  beforeEach(() => {
    anim = new Animated.Value(1);
    jest.clearAllMocks();
  });

  it('renders default title correctly with styles and testID', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Settings"
          anim={anim}
          testID="settings-title"
        />,
      );
    });

    const root = tree!.root;
    const animatedView = root.findByProps({ testID: 'settings-title' });
    expect(animatedView).toBeDefined();

    // Find Text elements
    const texts = root.findAllByType(Text);
    expect(texts.length).toBe(1);
    expect(texts[0].props.children).toBe('Settings');
    expect(texts[0].props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontSize: 36,
          fontWeight: '600',
          fontFamily: 'Poppins',
        }),
      ]),
    );

    act(() => {
      tree!.unmount();
    });
  });

  it('renders subtitle when provided and omits it when undefined', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Model Settings"
          subtitle="llama-3.2-1b.gguf"
          anim={anim}
        />,
      );
    });

    const texts = tree!.root.findAllByType(Text);
    expect(texts.length).toBe(2);
    expect(texts[0].props.children).toBe('Model Settings');
    expect(texts[1].props.children).toBe('llama-3.2-1b.gguf');
    const subtitleStyle = StyleSheet.flatten(texts[1].props.style);
    expect(subtitleStyle).toMatchObject({
      fontSize: 14,
      fontFamily: 'Poppins',
      color: '#E5E7EB',
    });

    act(() => {
      tree!.unmount();
    });
  });

  it('renders rightAction slot when provided', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Tasks"
          anim={anim}
          rightAction={<Text testID="action-btn">Action</Text>}
        />,
      );
    });

    const actionText = tree!.root.findByProps({ testID: 'action-btn' });
    expect(actionText).toBeDefined();
    expect(actionText.props.children).toBe('Action');

    act(() => {
      tree!.unmount();
    });
  });

  it('applies custom style overrides and containerStyle', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Custom Title"
          anim={anim}
          testID="custom-title"
          style={{ color: '#FF0000', marginBottom: 25 }}
          containerStyle={{ backgroundColor: 'blue' }}
        />,
      );
    });

    const animatedViews = tree!.root.findAllByType(Animated.View);
    const outerAnimatedView = animatedViews[0];
    const outerStyle = StyleSheet.flatten(outerAnimatedView.props.style);
    expect(outerStyle).toMatchObject({ backgroundColor: 'blue' });

    const titleText = tree!.root.findAllByType(Text)[0];
    const textStyle = StyleSheet.flatten(titleText.props.style);
    expect(textStyle).toMatchObject({ color: '#FF0000', marginBottom: 0 });

    act(() => {
      tree!.unmount();
    });
  });

  it('supports numberOfLines prop for multi-line titles', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Very Long Task Title That Wraps Across Multiple Lines In Detail View"
          anim={anim}
          numberOfLines={2}
        />,
      );
    });

    const titleText = tree!.root.findAllByType(Text)[0];
    expect(titleText.props.numberOfLines).toBe(2);

    act(() => {
      tree!.unmount();
    });
  });

  it('handles measuring layout event and resets when title changes', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(
        <CollapsibleTitle
          title="Initial Title"
          anim={anim}
        />,
      );
    });

    const measureWrapper = tree!.root.findAllByType(View).find(
      (v) => typeof v.props.onLayout === 'function',
    );
    expect(measureWrapper).toBeDefined();

    act(() => {
      measureWrapper!.props.onLayout({
        nativeEvent: { layout: { height: 75, width: 300, x: 0, y: 0 } },
      });
    });

    // Update title to trigger re-measurement effect
    act(() => {
      tree!.update(
        <CollapsibleTitle
          title="Updated Title"
          anim={anim}
        />,
      );
    });

    const updatedTitleText = tree!.root.findAllByType(Text)[0];
    expect(updatedTitleText.props.children).toBe('Updated Title');

    act(() => {
      tree!.unmount();
    });
  });
});

describe('useCollapsibleTitle Hook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('initializes with default expanded state (anim = 1, isCollapsed = false)', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness onResult={(res) => { hookResult = res; }} />,
      );
    });

    expect(hookResult.isCollapsed).toBe(false);
    expect((hookResult.anim as any)._value).toBe(1);

    act(() => {
      tree!.unmount();
    });
  });

  it('initializes with initialCollapsed: true (anim = 0, isCollapsed = true)', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness
          options={{ initialCollapsed: true }}
          onResult={(res) => { hookResult = res; }}
        />,
      );
    });

    expect(hookResult.isCollapsed).toBe(true);
    expect((hookResult.anim as any)._value).toBe(0);

    act(() => {
      tree!.unmount();
    });
  });

  it('enforces continuous scroll-proportional collapse with halfway states between expand and collapse thresholds', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness
          options={{ collapseThreshold: 24, expandThreshold: 8, duration: 200 }}
          onResult={(res) => { hookResult = res; }}
        />,
      );
    });

    expect(hookResult.isCollapsed).toBe(false);

    // 1. Hovering below expand threshold (8px) -> remains fully expanded
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 6, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);
    expect((hookResult.anim as any)._value).toBe(1);

    // 2. Midway through range (16px, exactly half of [8, 24]) -> halfway collapsed (0.5)
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 16, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);
    expect((hookResult.anim as any)._value).toBeCloseTo(0.5);

    // 3. Scroll past collapse threshold (25 > 24) -> triggers full collapse
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 25, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(true);
    expect((hookResult.anim as any)._value).toBe(0);

    // 4. Return to halfway (16px) -> smoothly re-opens halfway without snapping
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 16, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);
    expect((hookResult.anim as any)._value).toBeCloseTo(0.5);

    // 5. Return to top near expand threshold (5 <= 8) -> fully expanded
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 5, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);
    expect((hookResult.anim as any)._value).toBe(1);

    act(() => {
      tree!.unmount();
    });
  });

  it('handles negative bounce on iOS rubber-banding without collapsing', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness
          options={{ collapseThreshold: 24, expandThreshold: 8 }}
          onResult={(res) => { hookResult = res; }}
        />,
      );
    });

    expect(hookResult.isCollapsed).toBe(false);

    // Negative bounce (y = -30)
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: -30, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);

    // Collapse first, then negative bounce pulls it back to expanded
    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: 40, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(true);

    act(() => {
      hookResult.handleScroll({
        nativeEvent: { contentOffset: { y: -10, x: 0 } },
      } as any);
    });
    expect(hookResult.isCollapsed).toBe(false);

    act(() => {
      tree!.unmount();
    });
  });

  it('handles malformed scroll events without crashing or changing state', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness onResult={(res) => { hookResult = res; }} />,
      );
    });

    // Null or undefined event
    act(() => {
      hookResult.handleScroll(undefined as any);
      hookResult.handleScroll({} as any);
      hookResult.handleScroll({ nativeEvent: {} } as any);
      hookResult.handleScroll({ nativeEvent: { contentOffset: { y: NaN } } } as any);
    });

    expect(hookResult.isCollapsed).toBe(false);

    act(() => {
      tree!.unmount();
    });
  });

  it('supports programmatic collapse and expand triggers', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness onResult={(res) => { hookResult = res; }} />,
      );
    });

    expect(hookResult.isCollapsed).toBe(false);

    // Programmatic collapse
    act(() => {
      hookResult.collapse();
    });
    expect(hookResult.isCollapsed).toBe(true);

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect((hookResult.anim as any)._value).toBe(0);

    // Redundant collapse does nothing
    act(() => {
      hookResult.collapse();
    });
    expect(hookResult.isCollapsed).toBe(true);

    // Programmatic expand
    act(() => {
      hookResult.expand();
    });
    expect(hookResult.isCollapsed).toBe(false);

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect((hookResult.anim as any)._value).toBe(1);

    // Redundant expand does nothing
    act(() => {
      hookResult.expand();
    });
    expect(hookResult.isCollapsed).toBe(false);

    act(() => {
      tree!.unmount();
    });
  });

  it('cleans up running animation smoothly on unmount', () => {
    let hookResult!: UseCollapsibleTitleResult;
    let tree: renderer.ReactTestRenderer | null = null;

    act(() => {
      tree = renderer.create(
        <HookHarness onResult={(res) => { hookResult = res; }} />,
      );
    });

    act(() => {
      hookResult.collapse();
    });

    // Unmount mid-animation
    expect(() => {
      act(() => {
        tree!.unmount();
      });
    }).not.toThrow();
  });
});
