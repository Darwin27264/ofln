jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 8 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 3 * 1024 ** 3),
  },
}));

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { CommandPalette } from '../src/components/CommandPalette';

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      mode: 'dark',
      colors: {
        border: '#333',
        borderLight: '#222',
        text: '#fff',
        textSecondary: '#aaa',
        textTertiary: '#666',
        accent: '#f5a623',
        primary: '#4a90e2',
      },
    },
  }),
}));

jest.mock('../src/components/FrostedGlass', () => ({
  FrostedGlass: () => null,
}));

jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');

describe('CommandPalette', () => {
  it('renders null when input does not start with /', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <CommandPalette userInput="hello" onSelectCommand={jest.fn()} />,
      );
    });
    expect(tree.toJSON()).toBeNull();
  });

  it('renders matching commands when input is /', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <CommandPalette userInput="/" onSelectCommand={jest.fn()} />,
      );
    });
    const root = tree.root;
    const texts = root.findAllByType('Text').map((t: any) => t.props.children);
    expect(texts).toContain('/stats');
    expect(texts).toContain('/context');
    expect(texts).toContain('/clear');
  });

  it('filters commands when user types /st', () => {
    let tree: any;
    act(() => {
      tree = renderer.create(
        <CommandPalette userInput="/st" onSelectCommand={jest.fn()} />,
      );
    });
    const root = tree.root;
    const texts = root.findAllByType('Text').map((t: any) => t.props.children);
    expect(texts).toContain('/stats');
    expect(texts).not.toContain('/clear');
  });

  it('invokes onSelectCommand when a command item is pressed', () => {
    const onSelect = jest.fn();
    let tree: any;
    act(() => {
      tree = renderer.create(
        <CommandPalette userInput="/stat" onSelectCommand={onSelect} />,
      );
    });
    const root = tree.root;
    const touchables = root.findAll((node: any) => typeof node.props?.onPress === 'function');
    expect(touchables.length).toBeGreaterThan(0);
    act(() => {
      touchables[0].props.onPress();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'stats', label: '/stats' }),
    );
  });
});
