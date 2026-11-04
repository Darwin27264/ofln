import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Animated, StyleSheet } from 'react-native';

import { HistoryDrawer } from '../src/components/HistoryDrawer';
import type { ChatConversation } from '../services/chatHistoryService';

let mockThemeMode: 'light' | 'dark' = 'light';

const lightTheme = {
  mode: 'light' as const,
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

const darkTheme = {
  mode: 'dark' as const,
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

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: mockThemeMode === 'dark' ? darkTheme : lightTheme,
    toggleTheme: jest.fn(),
    isDark: mockThemeMode === 'dark',
    isTransitioning: false,
  }),
}));

jest.mock('../src/utils/layoutInsets', () => ({
  useFloatingBackBottom: jest.fn(() => 32),
  floatingBackBottom: jest.fn((inset: number) => inset + 12),
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

const sampleChat: ChatConversation = {
  id: 'chat-1',
  title: 'Sample Chat Title',
  preview: 'This is a test preview',
  createdAt: Date.now() - 10000,
  updatedAt: Date.now() - 5000,
  messages: [],
};

const groupedHistory = {
  pinnedChats: [],
  sortedKeys: ['Today'],
  groupedUnpinned: new Map([['Today', [sampleChat]]]),
};

describe('HistoryDrawer Theme Switch Responsiveness', () => {
  beforeEach(() => {
    mockThemeMode = 'light';
    jest.clearAllMocks();
  });

  it('updates ChatHistoryCard background and colors immediately when theme switches from light to dark without any user interaction', () => {
    let tree!: renderer.ReactTestRenderer;

    const props = {
      isPanelOpen: true,
      isPanelAnimating: false,
      panelWidth: 360,
      panelAnim: new Animated.Value(0),
      backdropOpacity: new Animated.Value(1),
      panelStyle: {},
      topInset: 36,
      bottomInset: 24,
      chatHistory: [sampleChat],
      groupedChatHistory: groupedHistory,
      historySearchQuery: '',
      onHistorySearchQueryChange: jest.fn(),
      isLoadingHistory: false,
      currentChatId: null,
      isMultiselectMode: false,
      selectedChatIds: new Set<string>(),
      multiselectHeaderHeight: new Animated.Value(0),
      multiselectHeaderOpacity: new Animated.Value(1),
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
    };

    act(() => {
      tree = renderer.create(<HistoryDrawer {...props} />);
    });

    const root = tree.root;

    const titleNode = root.findByProps({ children: 'Sample Chat Title' });
    expect(titleNode).toBeDefined();

    // The card container is the Pressable ancestor containing the title
    let cardContainer: any = titleNode.parent;
    while (cardContainer && (!cardContainer.props.style || !StyleSheet.flatten(cardContainer.props.style)?.backgroundColor)) {
      cardContainer = cardContainer.parent;
    }
    expect(cardContainer).not.toBeNull();
    expect(StyleSheet.flatten(cardContainer.props.style).backgroundColor).toBe('#F8F8F8');

    // Now simulate switching theme to dark without any chat interaction or selection
    mockThemeMode = 'dark';
    act(() => {
      tree.update(<HistoryDrawer {...props} />);
    });

    // In dark mode, ChatHistoryCard idle background must immediately be #252525
    const darkTitleNode = tree.root.findByProps({ children: 'Sample Chat Title' });
    let darkCardContainer: any = darkTitleNode.parent;
    while (darkCardContainer && (!darkCardContainer.props.style || !StyleSheet.flatten(darkCardContainer.props.style)?.backgroundColor)) {
      darkCardContainer = darkCardContainer.parent;
    }
    expect(darkCardContainer).not.toBeNull();
    expect(StyleSheet.flatten(darkCardContainer.props.style).backgroundColor).toBe('#252525');

    // Switch back to light mode without any interaction
    mockThemeMode = 'light';
    act(() => {
      tree.update(<HistoryDrawer {...props} />);
    });

    const lightAgainTitleNode = tree.root.findByProps({ children: 'Sample Chat Title' });
    let lightAgainContainer: any = lightAgainTitleNode.parent;
    while (lightAgainContainer && (!lightAgainContainer.props.style || !StyleSheet.flatten(lightAgainContainer.props.style)?.backgroundColor)) {
      lightAgainContainer = lightAgainContainer.parent;
    }
    expect(lightAgainContainer).not.toBeNull();
    expect(StyleSheet.flatten(lightAgainContainer.props.style).backgroundColor).toBe('#F8F8F8');
  });
});
