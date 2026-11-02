import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { ModelCard, ModelInfo } from '../src/components/ModelCard';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

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
      },
    },
    isDark: true,
  })),
}));

jest.mock('react-native-vector-icons/MaterialIcons', () => 'Icon');

describe('ModelCard - Recommended Badge & Dismissible Popup', () => {
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

  it('opens a non-sticky dismissible popup explaining device recommendation, and closes when clicking anywhere', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ModelCard {...defaultProps} isDeviceRecommended={true} />
      );
    });

    const root = tree!.root;

    // Initially, modal is hidden
    let modal = root.findByType(Modal);
    expect(modal.props.visible).toBe(false);

    // Tap the Recommended box
    const touchables = root.findAllByType(TouchableOpacity);
    const recButton = touchables.find((t) =>
      t.props.accessibilityLabel?.includes('Recommended model')
    );
    expect(recButton).toBeDefined();

    act(() => {
      recButton!.props.onPress({ stopPropagation: jest.fn() });
    });

    // Now modal is visible
    modal = root.findByType(Modal);
    expect(modal.props.visible).toBe(true);

    // Verify modal explains that it is recommended for the device
    const modalTexts = modal.findAllByType(Text).map((n) =>
      Array.isArray(n.props.children)
        ? n.props.children.join('')
        : String(n.props.children ?? '')
    );

    const hasRecTitle = modalTexts.some((t) => t.includes('Recommended for your phone'));
    expect(hasRecTitle).toBe(true);

    const hasRecExplanation = modalTexts.some((t) =>
      t.includes('recommended for your phone') &&
      t.includes('balance of reasoning capability')
    );
    expect(hasRecExplanation).toBe(true);

    // Verify "Tap anywhere to dismiss" prompt exists
    const hasDismissHint = modalTexts.some((t) => t.includes('Tap anywhere to dismiss'));
    expect(hasDismissHint).toBe(true);

    // Test dismiss: tapping the outer backdrop closes it
    const modalTouchables = modal.findAllByType(TouchableOpacity);
    const backdrop = modalTouchables[0]; // Outer full-screen TouchableOpacity
    expect(backdrop).toBeDefined();

    act(() => {
      backdrop.props.onPress();
    });

    expect(modal.props.visible).toBe(false);

    // Reopen and test dismiss by clicking on the card itself
    act(() => {
      recButton!.props.onPress({ stopPropagation: jest.fn() });
    });
    modal = root.findByType(Modal);
    expect(modal.props.visible).toBe(true);

    const freshModalTouchables = modal.findAllByType(TouchableOpacity);
    const cardTouchable = freshModalTouchables[1]; // Inner card TouchableOpacity
    expect(cardTouchable).toBeDefined();

    act(() => {
      cardTouchable.props.onPress();
    });

    modal = root.findByType(Modal);
    expect(modal.props.visible).toBe(false);
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
