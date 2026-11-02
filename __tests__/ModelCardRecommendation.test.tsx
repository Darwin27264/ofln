import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ModelCard, ModelInfo } from '../src/components/ModelCard';
import { BottomSheet } from '../src/components/BottomSheet';
import { Text, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 8 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 2 * 1024 ** 3),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 24, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));

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
        success: '#4CAF50',
        warning: '#FF9F0A',
        error: '#FF453A',
        transparent: 'transparent',
        glass: 'rgba(36, 36, 36, 0.75)',
      },
    },
    isDark: true,
  })),
}));

jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

jest.mock('../src/components/BottomSheet', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const MockBottomSheet = ({ visible, title, subtitle, children, onClose }: any) =>
    visible
      ? React.createElement(
          View,
          { testID: 'mock-bottom-sheet' },
          React.createElement(Text, null, title),
          subtitle ? React.createElement(Text, null, subtitle) : null,
          children,
          React.createElement(TouchableOpacity, { testID: 'backdrop', onPress: onClose })
        )
      : null;
  return {
    BottomSheet: MockBottomSheet,
  };
});

jest.mock('@react-native-community/blur', () => ({
  BlurView: 'BlurView',
}));

describe('ModelCard - Recommended Badge & BottomSheet Popup', () => {
  const sampleModel: ModelInfo = {
    id: 'test-model',
    name: 'SmolLM2 1.7B',
    repoId: 'HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF',
    fileName: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    size: '1.06 GB',
  };

  const defaultProps = {
    model: sampleModel,
    isDownloaded: false,
    index: 0,
    isDownloading: false,
    isPaused: false,
    progress: 0,
    isLoading: false,
    onDownload: jest.fn(),
    onDelete: jest.fn(),
    onCancel: jest.fn(),
    onSettings: jest.fn(),
    isExpanded: false,
    onToggleExpand: jest.fn(),
    isInitialAnimationPhase: false,
    animatedModelIds: { current: new Set<string>() },
    ramFit: {
      tier: 'fits' as const,
      label: 'Fits',
      totalMemoryBytes: 8 * 1024 ** 3,
      fileBytes: 1.06 * 1024 ** 3,
    },
  };

  it('renders a unified "Recommended" badge with the green dot when isDeviceRecommended is true', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ModelCard {...defaultProps} isDeviceRecommended={true} />
      );
    });

    const root = tree!.root;

    // Checks that the old separate "Recommended for your phone" badge is NOT rendered
    const textNodes = root.findAllByType(Text);
    const textContents = textNodes.map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.join('')
        : n.props.children
    );

    expect(textContents).not.toContain('Recommended for your phone');
    expect(textContents).toContain('Recommended');

    // Checks that "Recommended" is inside a TouchableOpacity that includes the indicator dot
    const touchables = root.findAllByType(TouchableOpacity);
    const recButton = touchables.find((t) =>
      t.props.accessibilityLabel?.includes('Recommended model')
    );
    expect(recButton).toBeDefined();

    // The button has a child dot View and a Text node with "Recommended"
    const dotView = recButton!.findAllByType(View).find((v) =>
      v.props.style?.borderRadius === 4 &&
      v.props.style?.backgroundColor === '#4CAF50'
    );
    expect(dotView).toBeDefined();
  });

  it('delegates to onShowRamFit callback when provided by parent screen', () => {
    const onShowRamFit = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ModelCard
          {...defaultProps}
          isDeviceRecommended={true}
          onShowRamFit={onShowRamFit}
        />
      );
    });

    const root = tree!.root;
    const touchables = root.findAllByType(TouchableOpacity);
    const recButton = touchables.find((t) =>
      t.props.accessibilityLabel?.includes('Recommended model')
    );
    expect(recButton).toBeDefined();

    act(() => {
      recButton!.props.onPress({ stopPropagation: jest.fn() });
    });

    expect(onShowRamFit).toHaveBeenCalledTimes(1);
    const callArg = onShowRamFit.mock.calls[0][0];
    expect(callArg.title).toBe('Recommended for your phone');
    expect(callArg.message).toContain('recommended for your phone');
    expect(callArg.message).toContain('balance of reasoning capability');
  });

  it('opens a clean BottomSheet popup without X button or dedicated dismiss button', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ModelCard {...defaultProps} isDeviceRecommended={true} />
      );
    });

    const root = tree!.root;

    // Initially, bottom sheet is closed
    let sheet = root.findByType(BottomSheet);
    expect(sheet.props.visible).toBe(false);

    // Tap the Recommended box
    const touchables = root.findAllByType(TouchableOpacity);
    const recButton = touchables.find((t) =>
      t.props.accessibilityLabel?.includes('Recommended model')
    );
    expect(recButton).toBeDefined();

    act(() => {
      recButton!.props.onPress({ stopPropagation: jest.fn() });
    });

    // Bottom sheet is now open
    sheet = root.findByType(BottomSheet);
    expect(sheet.props.visible).toBe(true);
    expect(sheet.props.title).toBe('Recommended for your phone');

    // Verify there is NO "Tap anywhere to dismiss" button or text
    const allTexts = root.findAllByType(Text).map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.join('')
        : String(n.props.children ?? '')
    );
    expect(allTexts).not.toContain('Tap anywhere to dismiss');

    // Verify there is NO X close button inside the sheet
    const iconButtons = sheet.findAllByType(TouchableOpacity).filter((t) =>
      t.props.accessibilityLabel === 'Close'
    );
    expect(iconButtons.length).toBe(0);

    // Tapping the TouchableWithoutFeedback calls onClose (tap anywhere to dismiss)
    const touchablesWithoutFeedback = sheet.findAllByType(TouchableWithoutFeedback);
    expect(touchablesWithoutFeedback.length).toBeGreaterThan(0);

    act(() => {
      sheet.props.onClose();
    });

    sheet = root.findByType(BottomSheet);
    expect(sheet.props.visible).toBe(false);
  });

  it('renders only the standalone dot when isDeviceRecommended is false', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ModelCard {...defaultProps} isDeviceRecommended={false} />
      );
    });

    const root = tree!.root;
    const textNodes = root.findAllByType(Text);
    const textContents = textNodes.map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.join('')
        : n.props.children
    );

    expect(textContents).not.toContain('Recommended');
    expect(textContents).not.toContain('Recommended for your phone');

    // Standalone dot exists
    const touchables = root.findAllByType(TouchableOpacity);
    const dotButton = touchables.find((t) =>
      t.props.accessibilityLabel?.includes('RAM fit: Fits. Tap for details.')
    );
    expect(dotButton).toBeDefined();
  });
});
