import React from 'react';
import { Animated, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import {
  HueLoadingIndicator,
  DEFAULT_HUE_LOADER_WIDTH,
  DEFAULT_HUE_LOADER_HEIGHT,
} from '../src/components/loading-ui/HueLoadingIndicator';
import { TextBlink } from '../src/components/loading-ui/TextBlink';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
    theme: {
      mode: 'dark',
      colors: {
        text: '#FFFFFF',
        textSecondary: '#E5E7EB',
        glass: 'rgba(36, 36, 36, 0.75)',
      },
    },
    isDark: true,
  })),
}));

jest.mock('@react-native-community/blur', () => ({
  BlurView: 'BlurView',
}));

describe('HueLoadingIndicator', () => {
  const originalLoop = Animated.loop;

  beforeAll(() => {
    Animated.loop = jest.fn(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      reset: jest.fn(),
    })) as any;
  });

  afterAll(() => {
    Animated.loop = originalLoop;
  });

  it('exports default enlarged width and height constants', () => {
    expect(DEFAULT_HUE_LOADER_WIDTH).toBe(100);
    expect(DEFAULT_HUE_LOADER_HEIGHT).toBe(28);
  });

  it('renders default pill capsule size without children when idle', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HueLoadingIndicator />);
    });

    const root = tree!.root;
    const capsuleView = root.findByProps({ accessibilityRole: 'progressbar' });
    expect(capsuleView).toBeTruthy();
    expect(capsuleView.props.accessibilityLabel).toBe('Generating response');

    const flattened = Array.isArray(capsuleView.props.style)
      ? Object.assign({}, ...capsuleView.props.style.filter(Boolean))
      : capsuleView.props.style;

    expect(flattened.width).toBe(100);
    expect(flattened.height).toBe(28);
    expect(flattened.borderRadius).toBe(14);
  });

  it('renders children centered in the pill capsule when thinking', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <HueLoadingIndicator accessibilityLabel="Thinking">
          <TextBlink accessibilityLabel="Thinking">Thinking</TextBlink>
        </HueLoadingIndicator>
      );
    });

    const root = tree!.root;
    const capsuleView = root.findByProps({ accessibilityRole: 'progressbar' });
    expect(capsuleView.props.accessibilityLabel).toBe('Thinking');

    // Sizing remains identical (100 x 28)
    const flattened = Array.isArray(capsuleView.props.style)
      ? Object.assign({}, ...capsuleView.props.style.filter(Boolean))
      : capsuleView.props.style;

    expect(flattened.width).toBe(100);
    expect(flattened.height).toBe(28);

    // Thinking text is present inside
    const blinkText = root.findByType(TextBlink);
    expect(blinkText).toBeTruthy();
    expect(blinkText.props.children).toBe('Thinking');
  });

  it('allows explicit width and height overrides', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<HueLoadingIndicator width={120} height={32} />);
    });

    const root = tree!.root;
    const capsuleView = root.findByProps({ accessibilityRole: 'progressbar' });
    const flattened = Array.isArray(capsuleView.props.style)
      ? Object.assign({}, ...capsuleView.props.style.filter(Boolean))
      : capsuleView.props.style;

    expect(flattened.width).toBe(120);
    expect(flattened.height).toBe(32);
    expect(flattened.borderRadius).toBe(16);
  });
});

