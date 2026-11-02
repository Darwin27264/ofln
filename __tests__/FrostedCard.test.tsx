import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text, View } from 'react-native';
import { FrostedCard, ExpandableCardDropdown } from '../src/components/FrostedCard';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const mockTheme = {
  mode: 'dark',
  colors: {
    background: '#0A0A0A',
    surface: '#141414',
    card: '#1A1A1A',
    text: '#FFFFFF',
    textSecondary: '#E5E7EB',
    border: '#2A2A2A',
    glass: 'rgba(36, 36, 36, 0.75)',
  },
};

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: jest.fn(() => ({
    theme: mockTheme,
    isDark: true,
  })),
}));

jest.mock('@react-native-community/blur', () => ({
  BlurView: 'BlurView',
}));

describe('FrostedCard Component', () => {
  it('renders children with frosted glass background and border', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <FrostedCard>
          <Text>Card Content</Text>
        </FrostedCard>
      );
    });

    const root = tree!.root;
    const textNode = root.findByType(Text);
    expect(textNode.props.children).toBe('Card Content');

    // Root View should have frosted glass styling
    const rootViews = root.findAllByType(View);
    const cardView = rootViews[0];
    const flatStyle = Object.assign({}, ...(Array.isArray(cardView.props.style) ? cardView.props.style : [cardView.props.style]));
    expect(flatStyle.borderRadius).toBe(16);
    expect(flatStyle.overflow).toBe('hidden');
    expect(flatStyle.backgroundColor).toBe('rgba(255, 255, 255, 0.05)');
    expect(flatStyle.borderColor).toBe('rgba(255, 255, 255, 0.12)');
  });
});

describe('ExpandableCardDropdown Component', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not render content when isExpanded is false initially', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ExpandableCardDropdown isExpanded={false}>
          <Text>Hidden Actions</Text>
        </ExpandableCardDropdown>
      );
    });

    const texts = tree!.root.findAllByType(Text);
    expect(texts.length).toBe(0);
  });

  it('renders content when isExpanded is true and performs animation', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ExpandableCardDropdown isExpanded={true}>
          <Text>Action Buttons</Text>
        </ExpandableCardDropdown>
      );
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    const textNode = tree!.root.findByType(Text);
    expect(textNode.props.children).toBe('Action Buttons');
  });

  it('unmounts cleanly when isExpanded transitions from true to false', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ExpandableCardDropdown isExpanded={true}>
          <Text>Action Buttons</Text>
        </ExpandableCardDropdown>
      );
    });

    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(tree!.root.findAllByType(Text).length).toBe(1);

    // Transition to collapsed
    act(() => {
      tree.update(
        <ExpandableCardDropdown isExpanded={false}>
          <Text>Action Buttons</Text>
        </ExpandableCardDropdown>
      );
    });

    // Advance exit animation timer (150ms)
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(tree!.root.findAllByType(Text).length).toBe(0);
  });
});
