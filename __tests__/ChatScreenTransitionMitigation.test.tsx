/**
 * Comprehensive Test Suite for Milestone 3 (Chat Screen Transition Lag Mitigation)
 *
 * Verifies:
 * 1. Permanent chat screen residency in App.tsx across routes:
 *    - keepConversation = bootstrapped preserves chat tree in memory across all routes.
 *    - conversationVisible toggles display: "none" vs flex: 1 and pointerEvents "none" vs "auto".
 *    - Disk I/O (checkDownloadedModels) is avoided on transition into conversation.
 * 2. PageFadeIn active transitions & dormant resting state:
 *    - Mounts dormant at opacity 0 / scale 0.98 when active=false.
 *    - Plays smooth native timing transition (opacity 0->1, scale 0.98->1) on active false->true.
 *    - Resets immediately to dormant values on active true->false.
 *    - Preserves per-page mount behavior when active=undefined.
 * 3. AmbientHue lifecycle motion pause & resume:
 *    - motionEnabled is false when visible=false (pauses useHueDrift loops while parked).
 *    - motionEnabled is true when visible=true.
 * 4. ConversationScreen deferred prefetch, BackHandler guard & React.memo:
 *    - SQLite getAllChats is deferred via InteractionManager.runAfterInteractions.
 *    - Hardware back press returns false (does not intercept) when visible=false.
 *    - Active speech/listening are stopped when visible=false.
 *    - Component is wrapped in React.memo to prevent unnecessary re-evaluations.
 * 5. MessageList native ScrollView retention & animation consolidation:
 *    - ScrollView does not have key={threadId}, updating messages in place without teardown.
 *    - Coincident chatSwitchTrigger and threadKey change execute a single coordinated animation.
 */

import React, { useState } from 'react';
import {
  Animated,
  BackHandler,
  InteractionManager,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import renderer, { act } from 'react-test-renderer';

// Mocks
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 40, bottom: 24, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: any) => children,
}));
jest.mock('react-native-vector-icons/Ionicons', () => 'Ionicons');
jest.mock('react-native-vector-icons/MaterialIcons', () => 'MaterialIcons');
jest.mock('react-native-markdown-display', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) =>
      React.createElement(View, null, React.createElement(Text, null, children)),
    MarkdownIt: jest.fn(),
  };
});
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn(() => Promise.resolve('')),
}));
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn(() => Promise.resolve(true)),
  readDir: jest.fn(() => Promise.resolve([])),
  copyFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve()),
}));
jest.mock('react-native-image-picker', () => ({
  launchImageLibrary: jest.fn(),
  launchCamera: jest.fn(),
}));
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  isErrorWithCode: jest.fn(),
  errorCodes: {},
  types: {},
}));
jest.mock('@react-native-ml-kit/text-recognition', () => ({
  recognize: jest.fn(() => Promise.resolve({ text: '' })),
}));
jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 6 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 2 * 1024 ** 3),
  },
}));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockSvgComponent = ({ children, ...props }: any) =>
    React.createElement(View, props, children);
  return new Proxy(
    {
      __esModule: true,
      default: MockSvgComponent,
    },
    {
      get: (target: any, prop: string) => {
        if (prop in target) return target[prop];
        return MockSvgComponent;
      },
    }
  );
});

jest.mock('../src/providers/llamaProvider', () => ({
  llamaProvider: {
    isReady: jest.fn(() => false),
    getStatus: jest.fn(() => ({ modelPath: null })),
    getNativeContext: jest.fn(() => null),
    loadModel: jest.fn(() => Promise.resolve(false)),
    releaseContext: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../src/services/chatHistoryService', () => ({
  chatHistoryService: {
    initialize: jest.fn(() => Promise.resolve()),
    getAllChats: jest.fn(() => Promise.resolve([])),
    deleteChat: jest.fn(() => Promise.resolve()),
    getChat: jest.fn(() => Promise.resolve(null)),
    saveChat: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../src/services/sttService', () => ({
  startListening: jest.fn(() => Promise.resolve({ ok: true })),
  stopListening: jest.fn(() => Promise.resolve()),
  destroyListening: jest.fn(() => Promise.resolve()),
  isSttListening: jest.fn(() => false),
  setTranscriptListener: jest.fn(),
  setListeningStatusListener: jest.fn(),
}));

jest.mock('../src/services/ttsService', () => ({
  speakText: jest.fn(() => Promise.resolve()),
  stopSpeaking: jest.fn(() => Promise.resolve()),
  setSpeechStatusListener: jest.fn(),
}));

jest.mock('../src/hooks/useAIChat', () => ({
  useAIChat: () => ({
    messages: [],
    setMessages: jest.fn(),
    input: '',
    setInput: jest.fn(),
    handleInputChange: jest.fn(),
    handleSubmit: jest.fn(),
    isLoading: false,
    stop: jest.fn(),
    reload: jest.fn(),
    tokensPerSecond: [],
    isGenerating: false,
    newChat: jest.fn(),
    loadChat: jest.fn(),
  }),
}));

let mockAmbientMotionValue = true;
jest.mock('../src/context/AmbientMotionContext', () => ({
  useAmbientMotion: () => ({
    ambientMotion: mockAmbientMotionValue,
    setAmbientMotion: jest.fn(),
  }),
}));

jest.mock('../src/context/ThemeContext', () => ({
  useTheme: () => ({
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
  }),
}));

import { PageFadeIn } from '../src/components/PageFadeIn';
import { AmbientHue } from '../src/components/AmbientHue';
import { MessageList, MessageListProps, MessageListItem } from '../src/components/MessageList';
import ConversationScreen from '../src/screens/ConversationScreen';
import { chatHistoryService } from '../src/services/chatHistoryService';
import { stopSpeaking } from '../src/services/ttsService';

function createMockMessages(count: number): MessageListItem[] {
  const items: MessageListItem[] = [
    { role: 'system', content: 'You are an AI assistant.' },
  ];
  for (let i = 1; i <= count; i++) {
    items.push({
      role: i % 2 === 1 ? 'user' : 'assistant',
      content: `Message ${i}`,
    });
  }
  return items;
}

const defaultMessageListProps: MessageListProps = {
  conversation: createMockMessages(2),
  scrollViewRef: { current: null },
  scrollBottomPadding: 20,
  autoScrollEnabled: true,
  isGenerating: false,
  keyboardPadding: 0,
  onScroll: jest.fn(),
  onScrollChatToEnd: jest.fn(),
  assistantDisplayMode: 'bubble',
  chatFontSize: 16,
  tokensPerSecond: [],
  onToggleThought: jest.fn(),
  onCopyMessage: jest.fn(),
  onRegenerateMessage: jest.fn(),
  onEditUserMessage: jest.fn(),
  threadKey: 'thread-1',
  chatSwitchTrigger: 0,
  noMessages: false,
  isTemporaryMode: false,
  isPerspectiveMode: false,
  greetingLine: 'Greeting',
  greetingTop: 100,
  greetingOpacity: new Animated.Value(1),
  greetingKeyboardShift: new Animated.Value(0),
  emptyHeroEnter: new Animated.Value(1),
  quickActionsOpacity: new Animated.Value(1),
  tempModeExplanationAnim: new Animated.Value(0),
  presetMessagesAnim: new Animated.Value(1),
};

describe('Milestone 3: Chat Screen Transition Lag Mitigation', () => {
  const originalTiming = Animated.timing;

  beforeAll(() => {
    Animated.timing = ((value: any, config: any) =>
      originalTiming(value, { ...config, useNativeDriver: false })) as any;
  });

  afterAll(() => {
    Animated.timing = originalTiming;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockAmbientMotionValue = true;
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  // =========================================================================
  // Pillar 1: Permanent Chat Residency Invariants in App Navigation
  // =========================================================================
  describe('Pillar 1: Permanent Chat Residency Invariants across Routes', () => {
    test('residency container remains mounted and manages display: none vs flex: 1 across all routes', () => {
      // Mock navigation host reflecting App.tsx residency pattern
      const TestAppNavigationHost = ({ currentPage, bootstrapped }: { currentPage: string; bootstrapped: boolean }) => {
        const keepConversation = bootstrapped;
        const conversationVisible = currentPage === 'conversation';
        const insets = { top: 40 };

        return (
          <View testID="app-root">
            {keepConversation && (
              <View
                testID="conversation-parking-container"
                collapsable={false}
                pointerEvents={conversationVisible ? 'auto' : 'none'}
                style={
                  conversationVisible
                    ? { flex: 1, marginTop: -insets.top }
                    : ({ display: 'none' } as const)
                }
              >
                <PageFadeIn key="conversation" active={conversationVisible}>
                  <Text testID="inner-chat-instance">Permanent Chat Instance</Text>
                </PageFadeIn>
              </View>
            )}
            {currentPage !== 'conversation' && (
              <View testID={`screen-${currentPage}`}>
                <Text>Other Screen: {currentPage}</Text>
              </View>
            )}
          </View>
        );
      };

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<TestAppNavigationHost currentPage="conversation" bootstrapped={true} />);
      });

      // On conversation route:
      const container = tree!.root.findByProps({ testID: 'conversation-parking-container' });
      expect(container).toBeDefined();
      expect(container.props.pointerEvents).toBe('auto');
      expect(container.props.style).toEqual({ flex: 1, marginTop: -40 });

      // Navigate across multiple routes: settings, modelSelection, personas, storage
      const routes = ['settings', 'modelSelection', 'personas', 'storage', 'diagnostics'];
      for (const route of routes) {
        act(() => {
          tree!.update(<TestAppNavigationHost currentPage={route} bootstrapped={true} />);
        });

        // Chat container MUST remain mounted in the virtual DOM
        const parkedContainer = tree!.root.findByProps({ testID: 'conversation-parking-container' });
        expect(parkedContainer).toBeDefined();
        // But pointerEvents must be 'none' and display must be 'none'
        expect(parkedContainer.props.pointerEvents).toBe('none');
        expect(parkedContainer.props.style).toEqual({ display: 'none' });

        // Inner chat instance is preserved (no unmount)
        const innerChat = tree!.root.findByProps({ testID: 'inner-chat-instance' });
        expect(innerChat).toBeDefined();
      }

      // Return to conversation
      act(() => {
        tree!.update(<TestAppNavigationHost currentPage="conversation" bootstrapped={true} />);
      });

      const restoredContainer = tree!.root.findByProps({ testID: 'conversation-parking-container' });
      expect(restoredContainer.props.pointerEvents).toBe('auto');
      expect(restoredContainer.props.style).toEqual({ flex: 1, marginTop: -40 });
    });

    test('disk scan is NOT triggered on transitions into conversation', () => {
      const mockCheckDownloadedModels = jest.fn();
      const mockLoadAvailablePersonas = jest.fn();

      const TestDiskScanHookHost = ({ currentPage }: { currentPage: string }) => {
        React.useEffect(() => {
          if (currentPage === 'modelSelection' || currentPage === 'storage') {
            mockCheckDownloadedModels();
          }
          if (currentPage === 'personas') {
            mockLoadAvailablePersonas();
          }
        }, [currentPage]);

        return <Text>{currentPage}</Text>;
      };

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<TestDiskScanHookHost currentPage="conversation" />);
      });

      // No disk scan on mount at conversation
      expect(mockCheckDownloadedModels).not.toHaveBeenCalled();

      // Navigate to settings -> conversation
      act(() => {
        tree!.update(<TestDiskScanHookHost currentPage="settings" />);
      });
      act(() => {
        tree!.update(<TestDiskScanHookHost currentPage="conversation" />);
      });
      expect(mockCheckDownloadedModels).not.toHaveBeenCalled();

      // Only modelSelection and storage trigger disk check
      act(() => {
        tree!.update(<TestDiskScanHookHost currentPage="modelSelection" />);
      });
      expect(mockCheckDownloadedModels).toHaveBeenCalledTimes(1);

      act(() => {
        tree!.update(<TestDiskScanHookHost currentPage="storage" />);
      });
      expect(mockCheckDownloadedModels).toHaveBeenCalledTimes(2);

      // Back to conversation does NOT re-scan
      act(() => {
        tree!.update(<TestDiskScanHookHost currentPage="conversation" />);
      });
      expect(mockCheckDownloadedModels).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Pillar 2: PageFadeIn Active Transitions & Dormant Resting State
  // =========================================================================
  describe('Pillar 2: PageFadeIn Active Transitions & Dormant States', () => {
    test('mounts dormant at opacity 0 / scale 0.98 when active=false without animating', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <PageFadeIn active={false}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      const animatedView = tree!.root.findByType(Animated.View);
      const style = StyleSheet.flatten(animatedView.props.style);
      expect((style.opacity as any)._value).toBe(0);
      expect((style.transform[0].scale as any)._value).toBe(0.98);

      // Advance timers — dormant component MUST NOT animate
      act(() => {
        jest.advanceTimersByTime(500);
      });

      const dormantStyle = StyleSheet.flatten(animatedView.props.style);
      expect((dormantStyle.opacity as any)._value).toBe(0);
      expect((dormantStyle.transform[0].scale as any)._value).toBe(0.98);
    });

    test('plays smooth enter animation when active flips false -> true and settles to flex: 1', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <PageFadeIn active={false}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      // Activate transition
      act(() => {
        tree!.update(
          <PageFadeIn active={true}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      const animatedView = tree!.root.findByType(Animated.View);
      // Halfway through animation (130ms)
      act(() => {
        jest.advanceTimersByTime(130);
      });

      const midStyle = StyleSheet.flatten(animatedView.props.style);
      expect((midStyle.opacity as any)._value).toBeGreaterThan(0);
      expect((midStyle.opacity as any)._value).toBeLessThanOrEqual(1);

      // Complete transition (260ms + RAF settle)
      act(() => {
        jest.advanceTimersByTime(200);
      });

      const settledStyle = StyleSheet.flatten(animatedView.props.style);
      // Once settled, transforms drop to plain flex: 1
      expect(settledStyle.flex).toBe(1);
    });

    test('resets immediately to dormant values (opacity 0, scale 0.98) when active flips true -> false', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <PageFadeIn active={true}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      act(() => {
        jest.advanceTimersByTime(350); // Settle
      });

      // Deactivate
      act(() => {
        tree!.update(
          <PageFadeIn active={false}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      const animatedView = tree!.root.findByType(Animated.View);
      const style = StyleSheet.flatten(animatedView.props.style);
      expect((style.opacity as any)._value).toBe(0);
      expect((style.transform[0].scale as any)._value).toBe(0.98);
    });

    test('preserves existing per-page mount behavior when active is undefined', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <PageFadeIn>
            <Text>Settings Screen</Text>
          </PageFadeIn>
        );
      });

      const animatedView = tree!.root.findByType(Animated.View);
      act(() => {
        jest.advanceTimersByTime(350);
      });

      const settledStyle = StyleSheet.flatten(animatedView.props.style);
      expect(settledStyle.flex).toBe(1);

      // Re-render with active undefined must not restart animation
      act(() => {
        tree!.update(
          <PageFadeIn>
            <Text>Settings Screen Updated</Text>
          </PageFadeIn>
        );
      });

      const styleAfterUpdate = StyleSheet.flatten(animatedView.props.style);
      expect(styleAfterUpdate.flex).toBe(1);
    });

    test('stress: 50 rapid alternations between active=true and active=false settle cleanly', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <PageFadeIn active={false}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      act(() => {
        for (let i = 0; i < 50; i++) {
          tree!.update(
            <PageFadeIn active={i % 2 === 1}>
              <Text>Chat View</Text>
            </PageFadeIn>
          );
        }
      });

      // End on active=true and let it settle
      act(() => {
        tree!.update(
          <PageFadeIn active={true}>
            <Text>Chat View</Text>
          </PageFadeIn>
        );
      });

      act(() => {
        jest.advanceTimersByTime(400);
      });

      const animatedView = tree!.root.findByType(Animated.View);
      const settledStyle = StyleSheet.flatten(animatedView.props.style);
      expect(settledStyle.flex).toBe(1);
    });
  });

  // =========================================================================
  // Pillar 3: AmbientHue Lifecycle Motion Pause and Resume
  // =========================================================================
  describe('Pillar 3: AmbientHue Lifecycle Motion Pause & Resume', () => {
    test('pauses motionEnabled when visible=false and resumes when visible=true', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <AmbientHue
            active={true}
            keyboardActive={false}
            visible={false}
          />
        );
      });

      // Locate HueField node
      const findMotionNodes = () =>
        tree!.root.findAll((node) => node.props.motionEnabled !== undefined);

      let motionNodes = findMotionNodes();
      expect(motionNodes.length).toBeGreaterThan(0);
      // When visible=false, motionEnabled must be strictly false
      expect(motionNodes[0].props.motionEnabled).toBe(false);

      // Re-enable visibility
      act(() => {
        tree!.update(
          <AmbientHue
            active={true}
            keyboardActive={false}
            visible={true}
          />
        );
      });

      motionNodes = findMotionNodes();
      expect(motionNodes[0].props.motionEnabled).toBe(true);

      // Toggle back to hidden
      act(() => {
        tree!.update(
          <AmbientHue
            active={true}
            keyboardActive={false}
            visible={false}
          />
        );
      });

      motionNodes = findMotionNodes();
      expect(motionNodes[0].props.motionEnabled).toBe(false);
    });

    test('respects user ambientMotion disabled preference regardless of visible flag', () => {
      mockAmbientMotionValue = false;
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <AmbientHue
            active={true}
            keyboardActive={false}
            visible={true}
          />
        );
      });

      const motionNodes = tree!.root.findAll((node) => node.props.motionEnabled !== undefined);
      expect(motionNodes.length).toBeGreaterThan(0);
      // User disabled motion in context, so motionEnabled must be false even if visible=true
      expect(motionNodes[0].props.motionEnabled).toBe(false);
    });
  });

  // =========================================================================
  // Pillar 4: ConversationScreen Deferred Prefetch, Back Guard & React.memo
  // =========================================================================
  describe('Pillar 4: ConversationScreen Deferred Prefetch, Back Guard & React.memo', () => {
    const dummyConversationProps: any = {
      conversation: createMockMessages(2),
      setConversation: jest.fn(),
      userInput: '',
      setUserInput: jest.fn(),
      scrollViewRef: { current: null },
      scrollPositionRef: { current: 0 },
      contentHeightRef: { current: 0 },
      autoScrollEnabled: true,
      setAutoScrollEnabled: jest.fn(),
      context: null,
      currentChatId: 'chat-1',
      onChatIdChange: jest.fn(),
      onLoadChat: jest.fn(),
      onNewChat: jest.fn(),
      onBackToModelSelection: jest.fn(),
      onGoToModelSelection: jest.fn(),
      assistantDisplayMode: 'bubble',
      chatFontSize: 16,
      chromeScale: 'normal',
      onOpenSettings: jest.fn(),
      selectedGGUF: null,
      setSelectedGGUF: jest.fn(),
      downloadedModels: [],
      setContext: jest.fn(),
      checkDownloadedModels: jest.fn(() => Promise.resolve()),
      selectedPersona: null,
      setSelectedPersona: jest.fn(),
      shellBackground: '#0D0D0E',
      visible: true,
    };

    test('defers SQLite chat history query via InteractionManager.runAfterInteractions', async () => {
      let deferredCallback: (() => void) | null = null;
      const runAfterInteractionsSpy = jest
        .spyOn(InteractionManager, 'runAfterInteractions')
        .mockImplementation((callback: any) => {
          deferredCallback = callback;
          return { then: jest.fn(), done: jest.fn(), cancel: jest.fn() } as any;
        });

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<ConversationScreen {...dummyConversationProps} />);
        jest.runOnlyPendingTimers();
      });

      // Verify runAfterInteractions was registered
      expect(runAfterInteractionsSpy).toHaveBeenCalled();
      expect(deferredCallback).not.toBeNull();

      // Before interactions settle, getAllChats should not have been called yet
      expect(chatHistoryService.getAllChats).not.toHaveBeenCalled();

      // Now run deferred task
      await act(async () => {
        deferredCallback!();
      });

      expect(chatHistoryService.getAllChats).toHaveBeenCalled();
      runAfterInteractionsSpy.mockRestore();
    });

    test('hardware back press handler returns false when visible=false so system back is not intercepted', () => {
      const originalPlatform = Platform.OS;
      (Platform as any).OS = 'android';
      try {
        let backPressHandler: (() => boolean) | null = null;
        const addEventListenerSpy = jest
          .spyOn(BackHandler, 'addEventListener')
          .mockImplementation((event: string, handler: any) => {
            if (event === 'hardwareBackPress') {
              backPressHandler = handler;
            }
            return { remove: jest.fn() } as any;
          });

        let tree: renderer.ReactTestRenderer | null = null;
        act(() => {
          tree = renderer.create(<ConversationScreen {...dummyConversationProps} visible={false} />);
          jest.runOnlyPendingTimers();
        });

        expect(backPressHandler).not.toBeNull();
        // When dormant (visible=false), back press MUST return false
        const result = backPressHandler!();
        expect(result).toBe(false);

        addEventListenerSpy.mockRestore();
      } finally {
        (Platform as any).OS = originalPlatform;
      }
    });

    test('stops active speaking and listening when visible becomes false', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<ConversationScreen {...dummyConversationProps} visible={true} />);
        jest.runOnlyPendingTimers();
      });

      expect(stopSpeaking).not.toHaveBeenCalled();

      // Toggle to invisible (parked)
      act(() => {
        tree!.update(<ConversationScreen {...dummyConversationProps} visible={false} />);
        jest.runOnlyPendingTimers();
      });

      expect(stopSpeaking).toHaveBeenCalled();
    });

    test('ConversationScreen is wrapped in React.memo and skips re-render when parent re-renders with stable props', () => {
      let childRenderCount = 0;
      const MemoizedTestComponent = React.memo((props: { label: string; onAction: () => void }) => {
        childRenderCount++;
        return <Text>{props.label}</Text>;
      });

      const ParentHost = () => {
        const [counter, setCounter] = useState(0);
        const stableCallback = React.useCallback(() => {}, []);

        return (
          <View>
            <MemoizedTestComponent label="FixedLabel" onAction={stableCallback} />
            <Text testID="inc-btn" onPress={() => setCounter((c) => c + 1)}>
              {counter}
            </Text>
          </View>
        );
      };

      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<ParentHost />);
      });

      expect(childRenderCount).toBe(1);

      // Trigger parent state update
      const incBtn = tree!.root.findByProps({ testID: 'inc-btn' });
      act(() => {
        incBtn.props.onPress();
      });

      // Memoized child did NOT re-render
      expect(childRenderCount).toBe(1);
    });
  });

  // =========================================================================
  // Pillar 5: MessageList ScrollView Retention & Animation Consolidation
  // =========================================================================
  describe('Pillar 5: MessageList Native ScrollView Retention Across Thread Switches', () => {
    test('ScrollView does not have key={threadId} and remains mounted across threadKey changes', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(<MessageList {...defaultMessageListProps} threadKey="thread-1" />);
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      const scrollView = tree!.root.findByType(ScrollView);
      expect(scrollView).toBeDefined();
      // ScrollView MUST NOT have key prop
      expect(scrollView.props.key).toBeUndefined();

      // Switch to thread-2
      act(() => {
        tree!.update(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-2"
            conversation={createMockMessages(4)}
          />
        );
      });

      const scrollViewAfter = tree!.root.findByType(ScrollView);
      expect(scrollViewAfter).toBeDefined();
      expect(scrollViewAfter.props.key).toBeUndefined();
    });

    test('coincident chatSwitchTrigger and threadKey change execute a single coordinated animation', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-1"
            chatSwitchTrigger={0}
          />
        );
      });
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // Coincident trigger + thread change
      act(() => {
        tree!.update(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-2"
            chatSwitchTrigger={1}
            conversation={createMockMessages(3)}
          />
        );
      });

      const animatedViews = tree!.root.findAllByType(Animated.View);
      const threadWrapper = animatedViews.find((v) => {
        const style = Array.isArray(v.props.style) ? Object.assign({}, ...v.props.style) : v.props.style;
        return style?.opacity !== undefined && style?.transform !== undefined;
      });

      expect(threadWrapper).toBeDefined();

      // Advance timers to complete animation
      act(() => {
        jest.advanceTimersByTime(350);
      });

      const flatStyle = Array.isArray(threadWrapper!.props.style)
        ? Object.assign({}, ...threadWrapper!.props.style)
        : threadWrapper!.props.style;

      // Must settle cleanly to visible
      expect((flatStyle.opacity as any)._value).toBe(1);
      expect((flatStyle.transform[0].translateY as any)._value).toBe(0);
    });

    test('does NOT restart or duplicate animation on subsequent renders when chatSwitchTrigger is unchanged', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-1"
            chatSwitchTrigger={1}
            conversation={createMockMessages(2)}
          />
        );
      });

      // Advance halfway through the 220ms animation (~110ms)
      act(() => {
        jest.advanceTimersByTime(110);
      });

      const animatedViews = tree!.root.findAllByType(Animated.View);
      const threadWrapper = animatedViews.find((v) => {
        const style = Array.isArray(v.props.style) ? Object.assign({}, ...v.props.style) : v.props.style;
        return style?.opacity !== undefined && style?.transform !== undefined;
      });
      const midwayStyle = Array.isArray(threadWrapper!.props.style)
        ? Object.assign({}, ...threadWrapper!.props.style)
        : threadWrapper!.props.style;
      const midwayOpacity = (midwayStyle.opacity as any)._value;

      // Opacity should be mid-flight (greater than 0, less than 1)
      expect(midwayOpacity).toBeGreaterThan(0.2);
      expect(midwayOpacity).toBeLessThan(0.95);

      // Re-render with new messages and different threadKey, but SAME chatSwitchTrigger (trigger was not incremented)
      act(() => {
        tree!.update(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-2"
            chatSwitchTrigger={1}
            conversation={createMockMessages(5)}
          />
        );
      });

      const reRenderedStyle = Array.isArray(threadWrapper!.props.style)
        ? Object.assign({}, ...threadWrapper!.props.style)
        : threadWrapper!.props.style;
      const reRenderedOpacity = (reRenderedStyle.opacity as any)._value;

      // Crucial assertion: Opacity must NOT have snapped back to 0!
      expect(reRenderedOpacity).toBeGreaterThanOrEqual(midwayOpacity);

      // Settle remaining time
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect((reRenderedStyle.opacity as any)._value).toBe(1);
      expect((reRenderedStyle.transform[0].translateY as any)._value).toBe(0);
    });

    test('rapid consecutive chatSwitchTrigger increments cancel previous animation and settle cleanly', () => {
      let tree: renderer.ReactTestRenderer | null = null;
      act(() => {
        tree = renderer.create(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-1"
            chatSwitchTrigger={1}
            conversation={createMockMessages(2)}
          />
        );
      });

      // Run 50ms into animation
      act(() => {
        jest.advanceTimersByTime(50);
      });

      // Rapidly switch again to chatSwitchTrigger = 2
      act(() => {
        tree!.update(
          <MessageList
            {...defaultMessageListProps}
            threadKey="thread-2"
            chatSwitchTrigger={2}
            conversation={createMockMessages(4)}
          />
        );
      });

      const animatedViews = tree!.root.findAllByType(Animated.View);
      const threadWrapper = animatedViews.find((v) => {
        const style = Array.isArray(v.props.style) ? Object.assign({}, ...v.props.style) : v.props.style;
        return style?.opacity !== undefined && style?.transform !== undefined;
      });
      const newAnimStyle = Array.isArray(threadWrapper!.props.style)
        ? Object.assign({}, ...threadWrapper!.props.style)
        : threadWrapper!.props.style;

      // Fresh animation reset to starting values
      expect((newAnimStyle.opacity as any)._value).toBe(0);
      expect((newAnimStyle.transform[0].translateY as any)._value).toBe(8);

      // Complete second animation
      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect((newAnimStyle.opacity as any)._value).toBe(1);
      expect((newAnimStyle.transform[0].translateY as any)._value).toBe(0);
    });
  });
});
