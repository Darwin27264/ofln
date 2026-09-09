/**
 * Message list + empty-state greeting for the conversation canvas.
 * Presentational — ConversationScreen owns scroll/send/regenerate handlers.
 */

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Animated,
  Dimensions,
  Image,
  TextInput,
  StyleSheet,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { MessageMarkdown } from './MessageMarkdown';
import { StreamingMessageText } from './StreamingMessageText';
import { Diamond } from './loading-ui/Diamond';
import { TextBlink } from './loading-ui/TextBlink';
import { lineHeightForChatFont, bubbleMetricsForChatFont } from '../utils/chatFontSize';
import { FrostedGlass } from './FrostedGlass';
import { PersonaAvatar } from './PersonaAvatar';
import { BottomSheet } from './BottomSheet';
import { useTheme } from '../context/ThemeContext';
import { createStyles } from '../styles/styles';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';
import { formatTokensPerSecondLabel } from '../utils/accelChipDisplay';
import type { Persona } from '../services/personaService';
import {
  hasPersonaAttribution,
  resolveMessagePersonaForDisplay,
  resolveMessagePersonaForSummary,
  type MessagePersonaFields,
} from '../utils/personaAttribution';

/** Match MessageMarkdown defaults so enter/exit edit does not change type size. */
const USER_MSG_FONT_FAMILY = 'Poppins';
/** messageBubble maxWidth share of scroll content width. */
const BUBBLE_MAX_WIDTH_RATIO = 0.8;
/** WhatsApp-style persona avatar beside assistant bubbles. */
const PERSONA_AVATAR_SIZE = 32;
const PERSONA_AVATAR_GAP = 8;

const PERSONA_STRENGTH_LABELS: Record<NonNullable<Persona['personaStrength']>, string> = {
  low: 'Subtle',
  medium: 'Balanced',
  high: 'Strong',
};

export type MessageListAttachment = {
  type: 'image' | 'pdf';
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
};

export type MessageListItem = {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  showThought?: boolean;
  tokensPerSecond?: number;
  attachments?: MessageListAttachment[];
} & MessagePersonaFields;

/** Waiting for first tokens — loading-ui Diamond. */
const ChatLoadingIndicator: React.FC<{ color: string }> = React.memo(({ color }) => (
  <View style={{ paddingVertical: 4, paddingHorizontal: 2, justifyContent: 'center' }}>
    <Diamond size={18} color={color} />
  </View>
));
ChatLoadingIndicator.displayName = 'ChatLoadingIndicator';

/** Model is in a thinking / CoT phase — loading-ui TextBlink. */
const ThinkingIndicator: React.FC<{ color: string }> = React.memo(({ color }) => (
  <View style={{ paddingVertical: 4, paddingHorizontal: 2, justifyContent: 'center' }}>
    <TextBlink
      accessibilityLabel="Thinking"
      style={{ fontSize: 14, color }}
    >
      Thinking
    </TextBlink>
  </View>
));
ThinkingIndicator.displayName = 'ThinkingIndicator';

const PulsingPersonaAvatar: React.FC<{
  persona: Persona;
  isPulsing: boolean;
  onPress: () => void;
  backgroundColor: string;
  iconColor: string;
}> = React.memo(({ persona, isPulsing, onPress, backgroundColor, iconColor }) => {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isPulsing) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: ANIMATION_DURATIONS.SLOW,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: ANIMATION_DURATIONS.SLOW,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isPulsing, pulse]);

  const animatedStyle = isPulsing
    ? {
        opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
        transform: [
          { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) },
        ],
      }
    : undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={`${persona.name} persona details`}
    >
      <Animated.View style={animatedStyle}>
        <PersonaAvatar
          persona={persona}
          size={PERSONA_AVATAR_SIZE}
          borderRadius={10}
          backgroundColor={backgroundColor}
          iconColor={iconColor}
        />
      </Animated.View>
    </TouchableOpacity>
  );
});
PulsingPersonaAvatar.displayName = 'PulsingPersonaAvatar';

function PersonaSummaryBody({
  persona,
  textColor,
  textSecondary,
  borderColor,
  surfaceColor,
}: {
  persona: Persona;
  textColor: string;
  textSecondary: string;
  borderColor: string;
  surfaceColor: string;
}) {
  const sections: Array<{ label: string; body: string }> = [];
  if (persona.identity?.trim()) {
    sections.push({ label: 'Identity', body: persona.identity.trim() });
  }
  if (persona.speakingStyle?.trim()) {
    sections.push({ label: 'Speaking style', body: persona.speakingStyle.trim() });
  }
  if (persona.backstory?.trim()) {
    sections.push({ label: 'Backstory', body: persona.backstory.trim() });
  }

  return (
    <View>
      <View style={{ alignItems: 'center', marginBottom: 16 }}>
        <PersonaAvatar
          persona={persona}
          size={72}
          borderRadius={16}
          backgroundColor={surfaceColor}
          iconColor={textColor}
        />
      </View>
      {persona.personaStrength ? (
        <Text
          style={{
            fontSize: 13,
            fontFamily: 'Poppins',
            color: textSecondary,
            textAlign: 'center',
            marginBottom: 12,
          }}
        >
          Character strength: {PERSONA_STRENGTH_LABELS[persona.personaStrength]}
        </Text>
      ) : null}
      {persona.tags && persona.tags.length > 0 ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: 6,
            marginBottom: sections.length > 0 ? 16 : 0,
          }}
        >
          {persona.tags.map((tag) => (
            <View
              key={tag}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 12,
                borderWidth: 1,
                borderColor,
                backgroundColor: surfaceColor,
              }}
            >
              <Text style={{ fontSize: 12, fontFamily: 'Poppins', color: textSecondary }}>
                {tag}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {sections.map((section) => (
        <View key={section.label} style={{ marginBottom: 14 }}>
          <Text
            style={{
              fontSize: 12,
              fontFamily: 'Poppins',
              fontWeight: '600',
              color: textSecondary,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.4,
            }}
          >
            {section.label}
          </Text>
          <Text
            style={{
              fontSize: 14,
              fontFamily: 'Poppins',
              color: textColor,
              lineHeight: 21,
            }}
          >
            {section.body}
          </Text>
        </View>
      ))}
    </View>
  );
}

export type MessageListProps = {
  conversation: MessageListItem[];
  scrollViewRef: React.RefObject<ScrollView | null>;
  scrollBottomPadding: number;
  autoScrollEnabled: boolean;
  isGenerating: boolean;
  keyboardPadding: number;
  onScroll: (event: any) => void;
  onScrollChatToEnd: (animated?: boolean) => void;

  assistantDisplayMode: 'bubble' | 'direct';
  chatFontSize: number;
  tokensPerSecond: number[];
  onToggleThought: (absoluteIndex: number) => void;
  onCopyMessage: (content: string) => void;
  onRegenerateMessage: (visibleIndex: number) => void;
  /** Speak / stop assistant reply via OS TTS. */
  onSpeakMessage?: (content: string, visibleIndex: number) => void;
  /** When set, play button shows stop icon for this visible index. */
  speakingVisibleIndex?: number | null;
  /** Edit user turn → truncate later turns → regenerate (visible = slice(1) index). */
  onEditUserMessage: (visibleIndex: number, newContent: string) => void;
  /** True while a user bubble is being edited (suppress keyboard scroll-to-end). */
  onEditingChange?: (isEditing: boolean) => void;
  /**
   * Open thread identity (`chatId` or null for a blank new chat).
   * When this changes (history load / new chat), the list sticks to the
   * newest messages until the user scrolls away.
   */
  threadKey?: string | null;

  noMessages: boolean;
  isTemporaryMode: boolean;
  isPerspectiveMode?: boolean;
  perspectivePresetName?: string;
  greetingLine: string;
  greetingTop: number;
  greetingOpacity: Animated.Value;
  greetingKeyboardShift: Animated.Value;
  /** Empty-hero enter (0→1) — fade/scale with OVERLAY_MOTION. */
  emptyHeroEnter: Animated.Value;
  quickActionsOpacity: Animated.Value;
  tempModeExplanationAnim: Animated.Value;
  presetMessagesAnim: Animated.Value;
  presetMessages: string[];
  presetIcons: Record<string, string>;
  onPresetMessage: (preset: string) => void;
  /** Calm one-liner when context trim dropped older turns. */
  showTrimNotice?: boolean;
  /** Persona library — used to resolve per-message attribution and summary sheets. */
  availablePersonas?: Persona[];
  /** Active persona for streaming placeholder before stamp (usually same as message snapshot). */
  selectedPersona?: Persona | null;
};

/** Instant (non-animated) viewport pin to newest messages. */
function snapScrollToBottom(
  scrollRef: React.RefObject<ScrollView | null>,
  contentHeight: number,
  viewportHeight: number,
) {
  const node = scrollRef.current;
  if (!node) return;
  if (contentHeight > 0 && viewportHeight > 0) {
    node.scrollTo({
      y: Math.max(0, contentHeight - viewportHeight),
      animated: false,
    });
    return;
  }
  node.scrollToEnd({ animated: false });
}

export function MessageList({
  conversation,
  scrollViewRef,
  scrollBottomPadding,
  autoScrollEnabled,
  isGenerating,
  keyboardPadding,
  onScroll,
  onScrollChatToEnd,
  assistantDisplayMode,
  chatFontSize,
  tokensPerSecond,
  onToggleThought,
  onCopyMessage,
  onRegenerateMessage,
  onSpeakMessage,
  speakingVisibleIndex = null,
  onEditUserMessage,
  onEditingChange,
  threadKey = null,
  noMessages,
  isTemporaryMode,
  isPerspectiveMode = false,
  perspectivePresetName,
  greetingLine,
  greetingTop,
  greetingOpacity,
  greetingKeyboardShift,
  emptyHeroEnter,
  quickActionsOpacity,
  tempModeExplanationAnim,
  presetMessagesAnim,
  presetMessages,
  presetIcons,
  onPresetMessage,
  showTrimNotice = false,
  availablePersonas = [],
  selectedPersona = null,
}: MessageListProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const visible = conversation.slice(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [personaSheetOpen, setPersonaSheetOpen] = useState(false);
  const [personaSheetPersona, setPersonaSheetPersona] = useState<Persona | null>(null);
  const [editDraft, setEditDraft] = useState('');
  /** Content Y of each visible message wrapper (for scroll-into-view on edit). */
  const messageOffsetsRef = useRef<Record<number, number>>({});

  /**
   * Stick-to-newest after open/switch/load.
   *
   * Thread seed is async (useAIChat commits history after `chatId` updates),
   * so we cannot pin only on the id change when `visible` is still empty.
   * Instead: arm on thread change; snap whenever content lays out while armed;
   * disarm when the user scrolls away from the bottom.
   */
  const threadId = threadKey ?? 'new';
  const activeThreadRef = useRef(threadId);
  const stickToNewestRef = useRef(true);
  const contentHeightRef = useRef(0);
  const viewportHeightRef = useRef(0);

  if (activeThreadRef.current !== threadId) {
    activeThreadRef.current = threadId;
    stickToNewestRef.current = true;
  }

  const snapToNewest = useCallback(() => {
    const run = () =>
      snapScrollToBottom(
        scrollViewRef,
        contentHeightRef.current,
        viewportHeightRef.current,
      );
    // Apply immediately and once after the native layout commit.
    run();
    requestAnimationFrame(run);
  }, [scrollViewRef]);

  // Messages often arrive one commit after `threadKey` (history seed). Snap then.
  // Also re-run when the open thread changes even if count is unchanged.
  useEffect(() => {
    if (!stickToNewestRef.current) return;
    if (visible.length === 0) return;
    snapToNewest();
  }, [threadId, visible.length, snapToNewest]);

  const handleListScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      contentHeightRef.current = contentSize.height;
      viewportHeightRef.current = layoutMeasurement.height;
      const distanceFromBottom =
        contentSize.height - layoutMeasurement.height - contentOffset.y;
      // User left the newest edge — stop force-sticking this thread open.
      if (distanceFromBottom > 80) {
        stickToNewestRef.current = false;
      }
      onScroll(event);
    },
    [onScroll],
  );

  const handleContentSizeChange = useCallback(
    (_w: number, h: number) => {
      contentHeightRef.current = h;
      if (editingIndex !== null) return;

      // While sticking (open/load), keep the end of the thread in view through
      // reflows — animated:false so this is a set-offset, not a scroll animation.
      if (stickToNewestRef.current && visible.length > 0) {
        snapToNewest();
        return;
      }

      if (autoScrollEnabled && (isGenerating || keyboardPadding > 0)) {
        onScrollChatToEnd(false);
      }
    },
    [
      editingIndex,
      visible.length,
      snapToNewest,
      autoScrollEnabled,
      isGenerating,
      keyboardPadding,
      onScrollChatToEnd,
    ],
  );

  const handleScrollViewLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      viewportHeightRef.current = e.nativeEvent.layout.height;
      if (stickToNewestRef.current && visible.length > 0) {
        snapToNewest();
      }
    },
    [snapToNewest, visible.length],
  );

  const userBubbleMaxWidth = useMemo(() => {
    const windowWidth = Dimensions.get('window').width;
    const contentPad = Math.max(16, windowWidth * 0.04);
    return (windowWidth - contentPad * 2) * BUBBLE_MAX_WIDTH_RATIO;
  }, []);

  const msgLineHeight = lineHeightForChatFont(chatFontSize);
  const bubbleMetrics = useMemo(
    () => bubbleMetricsForChatFont(chatFontSize),
    [chatFontSize],
  );

  const editInputStyle = useMemo(
    () => ({
      width: '100%' as const,
      maxWidth: '100%' as const,
      alignSelf: 'stretch' as const,
      fontSize: chatFontSize,
      fontFamily: USER_MSG_FONT_FAMILY,
      lineHeight: msgLineHeight,
      color: theme.colors.primaryText,
      padding: 0,
      margin: 0,
      textAlignVertical: 'top' as const,
      ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    }),
    [chatFontSize, msgLineHeight, theme.colors.primaryText],
  );

  // Long-press user menu (same frosted + stagger pattern as history context menu)
  const rootRef = useRef<View>(null);
  const [listSize, setListSize] = useState({ width: 0, height: 0 });
  const [userMenu, setUserMenu] = useState<{
    visibleIndex: number;
    content: string;
    x: number;
    y: number;
  } | null>(null);
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const menuScale = useRef(new Animated.Value(0.92)).current;
  const menuItem0Opacity = useRef(new Animated.Value(0)).current;
  const menuItem0Translate = useRef(new Animated.Value(6)).current;
  const menuItem1Opacity = useRef(new Animated.Value(0)).current;
  const menuItem1Translate = useRef(new Animated.Value(6)).current;

  const dismissUserMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(menuScale, {
        toValue: 0.92,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(() => setUserMenu(null));
  }, [menuOpacity, menuScale]);

  const openUserMenu = useCallback(
    (
      event: { nativeEvent: { pageX: number; pageY: number } },
      visibleIndex: number,
      content: string,
    ) => {
      if (isGenerating || editingIndex !== null) return;
      const { pageX, pageY } = event.nativeEvent;
      rootRef.current?.measureInWindow((rx, ry) => {
        const localX = pageX - rx;
        const localY = pageY - ry;
        setUserMenu({ visibleIndex, content, x: localX, y: localY });

        menuOpacity.setValue(0);
        menuScale.setValue(0.92);
        menuItem0Opacity.setValue(0);
        menuItem1Opacity.setValue(0);
        menuItem0Translate.setValue(6);
        menuItem1Translate.setValue(6);

        const itemAnim = (
          opacity: Animated.Value,
          translate: Animated.Value,
          delay: number,
        ) =>
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 100,
              delay,
              easing: EASING.EASE_OUT,
              useNativeDriver: true,
            }),
            Animated.timing(translate, {
              toValue: 0,
              duration: 100,
              delay,
              easing: EASING.EASE_OUT,
              useNativeDriver: true,
            }),
          ]);

        Animated.parallel([
          Animated.timing(menuOpacity, {
            toValue: 1,
            duration: 80,
            easing: EASING.EASE_OUT,
            useNativeDriver: true,
          }),
          Animated.spring(menuScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 280,
            friction: 22,
            overshootClamping: true,
          }),
          itemAnim(menuItem0Opacity, menuItem0Translate, 25),
          itemAnim(menuItem1Opacity, menuItem1Translate, 50),
        ]).start();
      });
    },
    [
      isGenerating,
      editingIndex,
      menuOpacity,
      menuScale,
      menuItem0Opacity,
      menuItem0Translate,
      menuItem1Opacity,
      menuItem1Translate,
    ],
  );

  useEffect(() => {
    if (!isGenerating) return;
    setEditingIndex(null);
    setEditDraft('');
    setUserMenu(null);
    menuOpacity.setValue(0);
    onEditingChange?.(false);
  }, [isGenerating, menuOpacity, onEditingChange]);

  const openPersonaSheet = useCallback(
    (msg: MessageListItem) => {
      const persona = resolveMessagePersonaForSummary(msg, availablePersonas);
      if (!persona) return;
      setPersonaSheetPersona(persona);
      setPersonaSheetOpen(true);
    },
    [availablePersonas],
  );

  const scrollEditingIntoView = useCallback(
    (visibleIndex: number, animated = true) => {
      const y = messageOffsetsRef.current[visibleIndex];
      if (y == null || !scrollViewRef.current) return;
      // Slight top inset so the bubble clears header/pills
      scrollViewRef.current.scrollTo({
        y: Math.max(0, y - 24),
        animated,
      });
    },
    [scrollViewRef],
  );

  const startEdit = (visibleIndex: number, content: string) => {
    if (isGenerating) return;
    setEditingIndex(visibleIndex);
    setEditDraft(content);
    onEditingChange?.(true);
    // Keep the edited bubble on screen after layout + keyboard settle
    // (keyboard open otherwise auto-scrolls the list to the end).
    requestAnimationFrame(() => {
      scrollEditingIntoView(visibleIndex, true);
    });
    setTimeout(() => scrollEditingIntoView(visibleIndex, true), 80);
    setTimeout(() => scrollEditingIntoView(visibleIndex, true), 320);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft('');
    onEditingChange?.(false);
  };

  const confirmEdit = (visibleIndex: number, hasAttachments: boolean) => {
    const trimmed = editDraft.trim();
    if (!trimmed && !hasAttachments) return;
    setEditingIndex(null);
    setEditDraft('');
    onEditingChange?.(false);
    onEditUserMessage(visibleIndex, editDraft);
  };

  // Re-focus edited bubble when keyboard/composer height changes mid-edit
  useEffect(() => {
    if (editingIndex === null) return;
    const t1 = setTimeout(() => scrollEditingIntoView(editingIndex, false), 50);
    const t2 = setTimeout(() => scrollEditingIntoView(editingIndex, true), 300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [editingIndex, keyboardPadding, scrollBottomPadding, scrollEditingIntoView]);

  const menuBlockStyle = {
    backgroundColor: 'transparent' as const,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
  };

  const menuMaxW = 160;
  const menuW = listSize.width || Dimensions.get('window').width;
  const menuH = listSize.height || Dimensions.get('window').height;
  const menuLeft = userMenu
    ? Math.max(12, Math.min(userMenu.x - 70, menuW - menuMaxW - 12))
    : 0;
  const menuTop = userMenu
    ? userMenu.y < menuH * 0.35
      ? Math.min(userMenu.y + 10, Math.max(12, menuH - 140))
      : Math.max(12, userMenu.y - 120)
    : 0;

  return (
    <View
      ref={rootRef}
      style={{ flex: 1, position: 'relative' }}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setListSize({ width, height });
      }}
    >
      <ScrollView
        key={threadId}
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: Math.max(16, Dimensions.get('window').width * 0.04),
          paddingTop: 60,
          paddingBottom: scrollBottomPadding,
        }}
        ref={scrollViewRef}
        onLayout={handleScrollViewLayout}
        onScroll={handleListScroll}
        scrollEventThrottle={16}
        onContentSizeChange={handleContentSizeChange}
      >
        {visible.map((msg, index) => {
          const isLastVisible = index === visible.length - 1;
          const isStreamingMessage =
            msg.role === 'assistant' && isGenerating && isLastVisible;
          const isAssistantDirect =
            msg.role === 'assistant' && assistantDisplayMode === 'direct';
          const bubbleSizeStyle = {
            paddingVertical: bubbleMetrics.paddingVertical,
            paddingHorizontal: isAssistantDirect
              ? 0
              : bubbleMetrics.paddingHorizontal,
            minHeight: bubbleMetrics.minHeight,
          };
          const containerStyle: object[] = [];
          if (msg.role === 'user') {
            containerStyle.push(
              styles.messageBubble,
              styles.userBubble,
              bubbleSizeStyle,
            );
          } else if (msg.role === 'assistant' && !isAssistantDirect) {
            containerStyle.push(
              styles.messageBubble,
              styles.llamaBubble,
              bubbleSizeStyle,
            );
          } else if (isAssistantDirect) {
            containerStyle.push(styles.messageDirect, bubbleSizeStyle);
          }

          const hasBubbleContent =
            (msg.role === 'user' && msg.attachments && msg.attachments.length > 0) ||
            (msg.content && msg.content.trim().length > 0) ||
            (msg.role === 'assistant' &&
              (!msg.content || msg.content.trim().length === 0) &&
              isGenerating &&
              isLastVisible) ||
            (msg.role === 'assistant' &&
              !!msg.thought &&
              (!msg.content || msg.content.trim().length === 0) &&
              !isGenerating);

          const bubbleBody = (
            <>
                  {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
                    <View
                      style={{
                        flexDirection: 'row',
                        flexWrap: 'wrap',
                        marginBottom: 8,
                        gap: 6,
                      }}
                    >
                      {msg.attachments.map((att, i) =>
                        att.type === 'image' ? (
                          <Image
                            key={i}
                            source={{ uri: att.uri }}
                            style={{ width: 64, height: 64, borderRadius: 8 }}
                            resizeMode="cover"
                          />
                        ) : att.type === 'pdf' ? (
                          <View
                            key={i}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              maxWidth: 180,
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              backgroundColor: theme.colors.surface,
                              gap: 8,
                            }}
                          >
                            <Ionicons
                              name="document-text-outline"
                              size={20}
                              color={theme.colors.textSecondary}
                            />
                            <Text
                              numberOfLines={1}
                              style={{
                                flex: 1,
                                fontSize: 12,
                                fontFamily: 'Poppins',
                                color: theme.colors.textSecondary,
                              }}
                            >
                              {att.fileName || 'Document.pdf'}
                            </Text>
                          </View>
                        ) : null,
                      )}
                    </View>
                  )}
                  {msg.role === 'assistant' &&
                  (!msg.content || msg.content.trim().length === 0) &&
                  isGenerating &&
                  isLastVisible ? (
                    msg.thought !== undefined ? (
                      <ThinkingIndicator color={theme.colors.textSecondary} />
                    ) : (
                      <ChatLoadingIndicator color={theme.colors.textSecondary} />
                    )
                  ) : msg.role === 'assistant' &&
                    (!msg.content || msg.content.trim().length === 0) &&
                    msg.thought ? (
                    <Text
                      style={{
                        fontSize: 14,
                        fontFamily: 'Poppins',
                        color: theme.colors.textTertiary,
                        fontStyle: 'italic',
                      }}
                    >
                      Reasoning complete — expand Thinking below for details, or regenerate for a
                      shorter answer.
                    </Text>
                  ) : msg.content ? (
                    msg.role === 'assistant' ? (
                      <StreamingMessageText
                        content={msg.content}
                        isStreaming={isStreamingMessage}
                        color={theme.colors.text}
                        fontSize={chatFontSize}
                      />
                    ) : editingIndex === index ? (
                      <TextInput
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        autoFocus
                        scrollEnabled={false}
                        style={editInputStyle}
                        placeholderTextColor={theme.colors.textTertiary}
                        selectionColor={theme.colors.primaryText}
                      />
                    ) : (
                      <MessageMarkdown
                        content={msg.content}
                        color={theme.colors.primaryText}
                        fontSize={chatFontSize}
                        lineHeight={msgLineHeight}
                        fontFamily={USER_MSG_FONT_FAMILY}
                      />
                    )
                  ) : editingIndex === index && msg.role === 'user' ? (
                    <TextInput
                      value={editDraft}
                      onChangeText={setEditDraft}
                      multiline
                      autoFocus
                      scrollEnabled={false}
                      style={editInputStyle}
                      placeholderTextColor={theme.colors.textTertiary}
                      selectionColor={theme.colors.primaryText}
                    />
                  ) : null}
            </>
          );

          const isEditingThis = msg.role === 'user' && editingIndex === index;
          // Explicit pixel max width so multiline TextInput wraps inside the bubble
          // (percentage maxWidth alone is not enough for TextInput intrinsic growth).
          const editBubbleWidthStyle = isEditingThis
            ? {
                maxWidth: userBubbleMaxWidth,
                width: userBubbleMaxWidth,
                alignSelf: 'flex-end' as const,
              }
            : null;

          const showPersonaAvatar =
            msg.role === 'assistant' &&
            (hasPersonaAttribution(msg) ||
              (isStreamingMessage && !!selectedPersona));
          const displayPersona =
            msg.role === 'assistant'
              ? hasPersonaAttribution(msg)
                ? resolveMessagePersonaForDisplay(msg, availablePersonas)
                : isStreamingMessage && selectedPersona
                  ? selectedPersona
                  : null
              : null;

          const bubbleNode =
            hasBubbleContent &&
            (msg.role === 'user' && editingIndex !== index ? (
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={isGenerating}
                delayLongPress={350}
                onLongPress={(e) => openUserMenu(e, index, msg.content)}
                style={[containerStyle]}
              >
                {bubbleBody}
              </TouchableOpacity>
            ) : (
              <View
                style={[
                  containerStyle,
                  isAssistantDirect ? { maxWidth: '100%' } : {},
                  editBubbleWidthStyle,
                ]}
              >
                {bubbleBody}
              </View>
            ));

          const thinkingNode =
            msg.thought && msg.role === 'assistant' ? (
              <TouchableOpacity
                onPress={() => onToggleThought(index + 1)}
                style={styles.toggleButton}
              >
                <Text style={styles.toggleText}>
                  {msg.showThought ? '▼ Hide Thinking' : '▶ Show Thinking'}
                </Text>
              </TouchableOpacity>
            ) : null;

          const thoughtNode =
            msg.showThought && msg.thought ? (
              <View style={styles.thoughtContainer}>
                <Text style={styles.thoughtTitle}>Thinking Process:</Text>
                <View style={{ width: '100%', maxWidth: '100%', flexShrink: 1 }}>
                  <Text style={styles.thoughtText}>
                    {msg.thought.replace(/^(?:\s*Thinking Process:\s*)+/i, '').trim()}
                  </Text>
                </View>
              </View>
            ) : null;

          const assistantBody = (msg.content || '').trim();
          const assistantThought = (msg.thought || '')
            .replace(/^(?:\s*Thinking Process:\s*)+/i, '')
            .trim();
          // Thought-only replies (empty visible answer) still need copy/regen —
          // the placeholder copy mentions regenerate.
          const showAssistantActions =
            msg.role === 'assistant' &&
            !isStreamingMessage &&
            (assistantBody.length > 0 || assistantThought.length > 0);
          const copyPayload = assistantBody || assistantThought;

          const actionsNode = showAssistantActions ? (
              <View
                style={{
                  width: '100%',
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginTop: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    flexShrink: 1,
                    gap: 8,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => onCopyMessage(copyPayload)}
                    style={{
                      padding: 6,
                      borderRadius: 16,
                      backgroundColor: theme.colors.glass,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Copy message"
                  >
                    <Ionicons name="copy-outline" size={16} color={theme.colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRegenerateMessage(index)}
                    disabled={isGenerating}
                    style={{
                      padding: 6,
                      borderRadius: 16,
                      backgroundColor: theme.colors.glass,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      opacity: isGenerating ? 0.5 : 1,
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="Regenerate message"
                  >
                    <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
                  </TouchableOpacity>
                  {(() => {
                    const assistantTurnIndex =
                      conversation
                        .slice(1, index + 2)
                        .filter((m) => m.role === 'assistant').length - 1;
                    const turnTps =
                      typeof msg.tokensPerSecond === 'number'
                        ? msg.tokensPerSecond
                        : assistantTurnIndex >= 0
                          ? tokensPerSecond[assistantTurnIndex]
                          : undefined;
                    return typeof turnTps === 'number' && turnTps > 0 ? (
                      <Text style={[styles.tokenInfo, { marginTop: 0 }]}>
                        {formatTokensPerSecondLabel(turnTps)}
                      </Text>
                    ) : null;
                  })()}
                </View>
                {onSpeakMessage && assistantBody.length > 0 && (
                  <>
                    <View style={{ flex: 1, minWidth: 24 }} />
                    <TouchableOpacity
                      onPress={() => onSpeakMessage(msg.content, index)}
                      disabled={isGenerating}
                      style={{
                        padding: 6,
                        borderRadius: 16,
                        backgroundColor: theme.colors.glass,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        opacity: isGenerating ? 0.5 : 1,
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel={
                        speakingVisibleIndex === index ? 'Stop speaking' : 'Speak message'
                      }
                    >
                      <Ionicons
                        name={
                          speakingVisibleIndex === index
                            ? 'stop-outline'
                            : 'volume-medium-outline'
                        }
                        size={16}
                        color={theme.colors.text}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : null;

          return (
            <View
              key={index}
              style={styles.messageWrapper}
              onLayout={(e) => {
                messageOffsetsRef.current[index] = e.nativeEvent.layout.y;
              }}
            >
              {showPersonaAvatar && displayPersona ? (
                <View style={{ width: '100%' }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'flex-end',
                      width: '100%',
                      gap: PERSONA_AVATAR_GAP,
                    }}
                  >
                    <PulsingPersonaAvatar
                      persona={displayPersona}
                      isPulsing={isStreamingMessage}
                      onPress={() => openPersonaSheet(msg)}
                      backgroundColor={theme.colors.surface}
                      iconColor={theme.colors.text}
                    />
                    <View
                      style={{
                        flex: 1,
                        flexShrink: 1,
                        minWidth: 0,
                        alignItems: 'flex-start',
                      }}
                    >
                      {bubbleNode}
                    </View>
                  </View>
                  {(thinkingNode || thoughtNode || actionsNode) && (
                    <View
                      style={{
                        marginLeft: PERSONA_AVATAR_SIZE + PERSONA_AVATAR_GAP,
                        alignSelf: 'stretch',
                      }}
                    >
                      {thinkingNode}
                      {thoughtNode}
                      {actionsNode}
                    </View>
                  )}
                </View>
              ) : (
                <>
                  {bubbleNode}
                  {msg.role === 'user' && editingIndex === index && !isGenerating && (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        alignSelf: 'flex-end',
                        marginTop: 8,
                        gap: 8,
                      }}
                    >
                      <TouchableOpacity
                        onPress={cancelEdit}
                        style={{
                          padding: 6,
                          borderRadius: 16,
                          backgroundColor: theme.colors.glass,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel="Cancel edit"
                      >
                        <Ionicons name="close-outline" size={16} color={theme.colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() =>
                          confirmEdit(index, (msg.attachments?.length ?? 0) > 0)
                        }
                        disabled={!editDraft.trim() && !(msg.attachments?.length)}
                        style={{
                          padding: 6,
                          borderRadius: 16,
                          backgroundColor: theme.colors.glass,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          opacity:
                            !editDraft.trim() && !(msg.attachments?.length) ? 0.5 : 1,
                        }}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityLabel="Save edit and regenerate"
                      >
                        <Ionicons
                          name="checkmark-outline"
                          size={16}
                          color={theme.colors.text}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                  {thinkingNode}
                  {thoughtNode}
                  {actionsNode}
                </>
              )}
            </View>
          );
        })}
        {showTrimNotice && (
          <Text
            accessibilityRole="text"
            accessibilityLabel="Older messages were trimmed to fit context"
            style={styles.trimNotice}
          >
            Older messages were trimmed to fit context
          </Text>
        )}
      </ScrollView>

      {noMessages && (
        <Animated.View
          style={[
            styles.greetingContainer,
            {
              top: greetingTop,
              opacity: Animated.multiply(greetingOpacity, emptyHeroEnter),
              transform: [
                { translateY: greetingKeyboardShift },
                {
                  scale: emptyHeroEnter.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.98, 1],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="box-none"
        >
          {isTemporaryMode && (
            <Ionicons
              name="flash"
              size={36}
              color={theme.colors.text}
              style={{ marginBottom: 12 }}
            />
          )}
          {isPerspectiveMode && !isTemporaryMode && (
            <Ionicons
              name="git-compare-outline"
              size={36}
              color={theme.colors.text}
              style={{ marginBottom: 12 }}
            />
          )}
          <Text style={styles.greetingText}>
            {isTemporaryMode
              ? 'Temporary Mode'
              : isPerspectiveMode
                ? 'Perspective'
                : greetingLine}
          </Text>

          <Animated.View
            style={{
              marginTop: 20,
              alignItems: 'center',
              width: '100%',
              opacity: quickActionsOpacity,
            }}
            pointerEvents={keyboardPadding > 0 ? 'none' : 'box-none'}
          >
            {isTemporaryMode ? (
              <Animated.View
                style={{
                  opacity: tempModeExplanationAnim,
                  transform: [
                    {
                      translateY: tempModeExplanationAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                  width: '100%',
                  alignItems: 'center',
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 18,
                    fontFamily: 'Poppins',
                    textAlign: 'center',
                    lineHeight: 24,
                    paddingHorizontal: 20,
                  }}
                >
                  Conversations in temporary mode are not saved. This chat will not appear in
                  history. Photos still run on-device OCR before the model sees them.
                </Text>
              </Animated.View>
            ) : isPerspectiveMode ? (
              <View
                style={{
                  width: '100%',
                  alignItems: 'center',
                  paddingHorizontal: 20,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 18,
                    fontFamily: 'Poppins',
                    textAlign: 'center',
                    lineHeight: 24,
                  }}
                >
                  {perspectivePresetName
                    ? `“${perspectivePresetName}” is ready. Send a topic — each speaker replies in turn. Input locks during the round; Stop cancels remaining speakers. Start a new chat to leave Perspective.`
                    : 'Send a topic — each speaker replies in turn. Input locks during the round; Stop cancels remaining speakers. Start a new chat to leave Perspective.'}
                </Text>
              </View>
            ) : (
              <Animated.View
                style={{
                  opacity: presetMessagesAnim,
                  transform: [
                    {
                      translateY: presetMessagesAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                      }),
                    },
                  ],
                  alignItems: 'center',
                  width: '100%',
                }}
              >
                {presetMessages.map((preset, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => onPresetMessage(preset)}
                    activeOpacity={0.75}
                    style={{
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 30,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor:
                        theme.mode === 'dark'
                          ? 'rgba(255,255,255,0.18)'
                          : 'rgba(0,0,0,0.08)',
                      marginBottom: index < presetMessages.length - 1 ? 8 : 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 200,
                      overflow: 'hidden',
                    }}
                  >
                    <FrostedGlass
                      style={StyleSheet.absoluteFillObject}
                      blurAmount={18}
                      tintOpacity={theme.mode === 'dark' ? 0.16 : 0.28}
                      inverted={theme.mode === 'dark'}
                    />
                    <Ionicons
                      name={presetIcons[preset] as any}
                      size={20}
                      color={theme.colors.text}
                      style={{ marginRight: 8 }}
                    />
                    <Text
                      style={{
                        color: theme.colors.text,
                        fontSize: 16,
                        fontFamily: 'Poppins',
                        textAlign: 'center',
                      }}
                    >
                      {preset}
                    </Text>
                  </TouchableOpacity>
                ))}
              </Animated.View>
            )}
          </Animated.View>
        </Animated.View>
      )}

      {userMenu && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 10000,
            elevation: 10000,
          }}
          pointerEvents="box-none"
        >
          <TouchableWithoutFeedback onPress={dismissUserMenu}>
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                opacity: menuOpacity,
              }}
            />
          </TouchableWithoutFeedback>
          <Animated.View
            style={{
              position: 'absolute',
              left: menuLeft,
              top: menuTop,
              minWidth: 140,
              opacity: menuOpacity,
              transform: [{ scale: menuScale }],
            }}
            onStartShouldSetResponder={() => true}
          >
            <Animated.View
              style={{
                opacity: menuItem0Opacity,
                transform: [{ translateY: menuItem0Translate }],
                marginBottom: 8,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  const content = userMenu.content;
                  dismissUserMenu();
                  if (content) onCopyMessage(content);
                }}
                style={menuBlockStyle}
                activeOpacity={0.85}
                accessibilityLabel="Copy message"
              >
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Ionicons name="copy-outline" size={18} color={theme.colors.text} />
                <Text
                  style={{
                    color: theme.colors.text,
                    marginLeft: 10,
                    fontSize: 14,
                    fontFamily: 'Poppins',
                  }}
                >
                  Copy
                </Text>
              </TouchableOpacity>
            </Animated.View>
            <Animated.View
              style={{
                opacity: menuItem1Opacity,
                transform: [{ translateY: menuItem1Translate }],
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  const { visibleIndex, content } = userMenu;
                  dismissUserMenu();
                  startEdit(visibleIndex, content);
                }}
                style={menuBlockStyle}
                activeOpacity={0.85}
                accessibilityLabel="Edit message"
              >
                <FrostedGlass style={StyleSheet.absoluteFillObject} />
                <Ionicons name="pencil-outline" size={18} color={theme.colors.text} />
                <Text
                  style={{
                    color: theme.colors.text,
                    marginLeft: 10,
                    fontSize: 14,
                    fontFamily: 'Poppins',
                  }}
                >
                  Edit
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>
        </View>
      )}

      {personaSheetPersona && (
        <BottomSheet
          visible={personaSheetOpen}
          onClose={() => {
            setPersonaSheetOpen(false);
            setPersonaSheetPersona(null);
          }}
          title={personaSheetPersona.name}
          subtitle={personaSheetPersona.tagline?.trim() || undefined}
          fitContent
        >
          <PersonaSummaryBody
            persona={personaSheetPersona}
            textColor={theme.colors.text}
            textSecondary={theme.colors.textSecondary}
            borderColor={theme.colors.border}
            surfaceColor={theme.colors.surface}
          />
        </BottomSheet>
      )}
    </View>
  );
}
