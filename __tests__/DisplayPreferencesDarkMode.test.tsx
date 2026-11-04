import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';

jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
  DocumentDirectoryPath: '/mock/docs',
  ExternalDirectoryPath: '/mock/external',
}));

import SettingsScreen from '../src/screens/SettingsScreen';

const mockToggleTheme = jest.fn();
let mockIsDark = true;

const darkTheme = {
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
};

const lightTheme = {
  mode: 'light',
  colors: {
    background: '#FFFFFF',
    surface: '#ECEEF2',
    card: '#EAECEF',
    overlay: 'rgba(0, 0, 0, 0.1)',
    text: '#000000',
    textSecondary: '#334155',
    textTertiary: '#64748B',
    border: '#D8DCE2',
    borderLight: '#E8ECF0',
    primary: '#000000',
    primaryText: '#FFFFFF',
    secondary: '#E2E5E9',
    accent: '#D97706',
    accentText: '#FFFFFF',
    success: '#34C759',
    warning: '#FF9F0A',
    error: '#FF453A',
    transparent: 'transparent',
    glass: '#F2F2F2',
  },
};

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: mockIsDark ? darkTheme : lightTheme,
    toggleTheme: mockToggleTheme,
    isDark: mockIsDark,
    isTransitioning: false,
  }),
}));

jest.mock('../src/context/AmbientMotionContext', () => ({
  useAmbientMotion: () => ({
    ambientMotion: 'subtle',
    setAmbientMotion: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useCollapsibleTitle', () => ({
  useCollapsibleTitle: () => ({
    anim: { interpolate: jest.fn(() => 0) },
    handleScroll: jest.fn(),
  }),
}));

jest.mock('../src/components/CollapsibleTitle', () => ({
  CollapsibleTitle: () => null,
}));

jest.mock('../src/utils/layoutInsets', () => ({
  useFloatingBackBottom: () => 20,
  useScrollPadForFloatingBack: () => 80,
}));

jest.mock('../src/services/personaService', () => ({
  getPersonas: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/perspectiveService', () => ({
  getPerspectivePresets: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/services/taskService', () => ({
  countEnabledTasks: jest.fn().mockResolvedValue(0),
}));

jest.mock('../src/services/performanceTracking', () => ({
  loadUsageRecords: jest.fn().mockResolvedValue([]),
  computeUsageAverages: jest.fn().mockReturnValue(null),
}));

jest.mock('../src/services/modelStorageService', () => ({
  listStoredGgufModels: jest.fn().mockResolvedValue([]),
}));

jest.mock('../src/utils/modelStorageHelpers', () => ({
  sumStoredModelBytes: jest.fn().mockReturnValue(0),
}));

jest.mock('../src/services/chatHistoryService', () => ({
  chatHistoryService: {
    getAllChats: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@react-native-community/blur', () => ({
  BlurView: 'BlurView',
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

// Render BottomSheet content inline so display preferences tiles are always accessible
jest.mock('../src/components/BottomSheet', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    BottomSheet: ({ visible, children }: any) =>
      visible ? React.createElement(View, { testID: 'mock-bottom-sheet' }, children) : null,
  };
});

describe('SettingsScreen - Dark Mode and Chat Mode text visibility', () => {
  const defaultProps = {
    assistantDisplayMode: 'bubble' as const, // Chat Mode ON
    setAssistantDisplayMode: jest.fn(),
    chatFontSize: 16,
    setChatFontSize: jest.fn(),
    chromeScale: 1 as const,
    setChromeScale: jest.fn(),
    downloadedModels: [],
    onBackToConversation: jest.fn(),
    onGoToModelSelection: jest.fn(),
    onOpenStats: jest.fn(),
    onGoToPersonas: jest.fn(),
    onGoToPerspectives: jest.fn(),
    onGoToTasks: jest.fn(),
    onGoToInfo: jest.fn(),
    onGoToDiagnostics: jest.fn(),
    onGoToStorage: jest.fn(),
  };

  beforeEach(() => {
    mockIsDark = true;
    jest.clearAllMocks();
  });

  it('renders white text for Chat Mode and Dark Mode tiles when enabled in dark mode', async () => {
    mockIsDark = true;
    let tree!: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<SettingsScreen {...defaultProps} assistantDisplayMode="bubble" />);
      await Promise.resolve();
    });

    // Open quick settings / display preferences
    const root = tree.root;
    const touchables = root.findAll((node) => node.props.accessibilityLabel === 'Display preferences');
    expect(touchables.length).toBeGreaterThan(0);

    await act(async () => {
      touchables[0].props.onPress();
      await Promise.resolve();
    });

    // Find all Text nodes in tree
    const textNodes = root.findAllByType(Text);

    // Find Chat Mode label
    const chatModeLabelNode = textNodes.find((t) => {
      const child = Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '');
      return child === 'Chat\nMode';
    });
    expect(chatModeLabelNode).toBeDefined();
    // Verify it is WHITE (#FFFFFF), not black (#000000)
    const chatModeStyle = Array.isArray(chatModeLabelNode!.props.style)
      ? Object.assign({}, ...chatModeLabelNode!.props.style)
      : chatModeLabelNode!.props.style;
    expect(chatModeStyle.color).toBe('#FFFFFF');

    // Find Dark Mode label
    const darkModeLabelNode = textNodes.find((t) => {
      const child = Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '');
      return child === 'Dark\nMode';
    });
    expect(darkModeLabelNode).toBeDefined();
    const darkModeStyle = Array.isArray(darkModeLabelNode!.props.style)
      ? Object.assign({}, ...darkModeLabelNode!.props.style)
      : darkModeLabelNode!.props.style;
    expect(darkModeStyle.color).toBe('#FFFFFF');

    // Find "On" stat badges in SettingsTile
    const onTileStatBadges = root.findAll((node) => {
      if (node.type !== Text) return false;
      const child = Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children ?? '');
      if (child !== 'On') return false;
      // Filter to tile stat badges by checking style
      const style = Array.isArray(node.props.style) ? Object.assign({}, ...node.props.style) : node.props.style;
      return style && style.fontSize === 12; // blockStatText fontSize is 12
    });
    expect(onTileStatBadges.length).toBe(2);
    for (const badge of onTileStatBadges) {
      const style = Array.isArray(badge.props.style)
        ? Object.assign({}, ...badge.props.style)
        : badge.props.style;
      expect(style.color).toBe('#FFFFFF');
    }

    // Find Ionicons in the tiles
    const icons = root.findAll((node) => node.type === 'Ionicons');
    const chatIcon = icons.find((i) => i.props.name === 'chatbubble-outline');
    expect(chatIcon).toBeDefined();
    expect(chatIcon!.props.color).toBe('#FFFFFF');

    const darkIcon = icons.find((i) => i.props.name === 'moon');
    expect(darkIcon).toBeDefined();
    expect(darkIcon!.props.color).toBe('#FFFFFF');
  });

  it('renders black text for Chat Mode and Dark Mode tiles when in light mode', async () => {
    mockIsDark = false;
    let tree!: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<SettingsScreen {...defaultProps} assistantDisplayMode="bubble" />);
      await Promise.resolve();
    });

    const root = tree.root;
    const touchables = root.findAll((node) => node.props.accessibilityLabel === 'Display preferences');
    await act(async () => {
      touchables[0].props.onPress();
      await Promise.resolve();
    });

    const textNodes = root.findAllByType(Text);
    const chatModeLabelNode = textNodes.find((t) => {
      const child = Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '');
      return child === 'Chat\nMode';
    });
    const chatModeStyle = Array.isArray(chatModeLabelNode!.props.style)
      ? Object.assign({}, ...chatModeLabelNode!.props.style)
      : chatModeLabelNode!.props.style;
    expect(chatModeStyle.color).toBe('#000000');

    const darkModeLabelNode = textNodes.find((t) => {
      const child = Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '');
      return child === 'Dark\nMode';
    });
    const darkModeStyle = Array.isArray(darkModeLabelNode!.props.style)
      ? Object.assign({}, ...darkModeLabelNode!.props.style)
      : darkModeLabelNode!.props.style;
    expect(darkModeStyle.color).toBe('#000000');
  });
});
