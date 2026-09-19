import React from 'react';
import { Animated } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { InputListeningGlow } from '../src/components/InputListeningGlow';

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

describe('InputListeningGlow', () => {
  const originalLoop = Animated.loop;

  beforeAll(() => {
    // Mock Animated.loop so infinite animation loops don't keep Jest handles open
    Animated.loop = jest.fn(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    })) as any;
  });

  afterAll(() => {
    Animated.loop = originalLoop;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when initially inactive', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(<InputListeningGlow active={false} />);
    });
    expect(tree!.toJSON()).toBeNull();
    act(() => {
      tree!.unmount();
    });
  });

  it('renders radiant layers when active is true with pointerEvents="none"', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(<InputListeningGlow active={true} />);
    });
    const json = tree!.toJSON() as renderer.ReactTestRendererJSON;
    expect(json).not.toBeNull();
    expect(json.props.pointerEvents).toBe('none');
    act(() => {
      tree!.unmount();
    });
  });

  it('handles transition from inactive to active and back without crashing', () => {
    let tree: renderer.ReactTestRenderer | null = null;
    act(() => {
      tree = renderer.create(<InputListeningGlow active={false} />);
    });
    expect(tree!.toJSON()).toBeNull();

    act(() => {
      tree!.update(<InputListeningGlow active={true} />);
    });
    expect(tree!.toJSON()).not.toBeNull();

    act(() => {
      tree!.update(<InputListeningGlow active={false} />);
    });
    act(() => {
      tree!.unmount();
    });
  });
});
