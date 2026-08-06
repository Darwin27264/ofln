/**
 * Message list + empty-state greeting for the conversation canvas.
 * Presentational — ConversationScreen owns scroll/send/regenerate handlers (S04c).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
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
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { MessageMarkdown } from './MessageMarkdown';
import { StreamingMessageText } from './StreamingMessageText';
import { FrostedGlass } from './FrostedGlass';
import { useTheme } from '../context/ThemeContext';
import { createStyles } from '../styles/styles';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

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
};

const ThinkingIndicator: React.FC<{ theme: { colors: Record<string, string> } }> = React.memo(
  ({ theme }) => {
    const dot1 = useRef(new Animated.Value(0)).current;
    const dot2 = useRef(new Animated.Value(0)).current;
    const dot3 = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const animateDot = (dot: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(dot, {
              toValue: 1,
              duration: ANIMATION_DURATIONS.SLOW,
              easing: EASING.STANDARD,
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: ANIMATION_DURATIONS.SLOW,
              easing: EASING.STANDARD,
              useNativeDriver: true,
            }),
          ]),
        );

      const animations = [animateDot(dot1, 0), animateDot(dot2, 100), animateDot(dot3, 200)];
      animations.forEach((anim) => anim.start());
      return () => animations.forEach((anim) => anim.stop());
    }, [dot1, dot2, dot3]);

    const dotSize = 8;
    const dotSpacing = 6;

    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingHorizontal: 4,
        }}
      >
        {[dot1, dot2, dot3].map((dot, i) => (
          <Animated.View
            key={i}
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: theme.colors.textSecondary,
              marginRight: i < 2 ? dotSpacing : 0,
              opacity: dot.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }),
              transform: [
                { scale: dot.interpolate({ inputRange: [0, 1], outputRange: [1, 1.2] }) },
              ],
            }}
          />
        ))}
      </View>
    );
  },
);
ThinkingIndicator.displayName = 'ThinkingIndicator';

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
  tokensPerSecond: number[];
  onToggleThought: (absoluteIndex: number) => void;
  onCopyMessage: (content: string) => void;
  onRegenerateMessage: (visibleIndex: number) => void;
  /** Speak / stop assistant reply via OS TTS (S29). */
  onSpeakMessage?: (content: string, visibleIndex: number) => void;
  /** When set, play button shows stop icon for this visible index. */
  speakingVisibleIndex?: number | null;
  /** Edit user turn → truncate later turns → regenerate (visible = slice(1) index). */
  onEditUserMessage: (visibleIndex: number, newContent: string) => void;

  noMessages: boolean;
  isTemporaryMode: boolean;
  greetingLine: string;
  greetingTop: number;
  greetingOpacity: Animated.Value;
  greetingKeyboardShift: Animated.Value;
  quickActionsOpacity: Animated.Value;
  tempModeExplanationAnim: Animated.Value;
  presetMessagesAnim: Animated.Value;
  presetMessages: string[];
  presetIcons: Record<string, string>;
  onPresetMessage: (preset: string) => void;
  /** Calm one-liner when context trim dropped older turns (S15). */
  showTrimNotice?: boolean;
};

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
  tokensPerSecond,
  onToggleThought,
  onCopyMessage,
  onRegenerateMessage,
  onSpeakMessage,
  speakingVisibleIndex = null,
  onEditUserMessage,
  noMessages,
  isTemporaryMode,
  greetingLine,
  greetingTop,
  greetingOpacity,
  greetingKeyboardShift,
  quickActionsOpacity,
  tempModeExplanationAnim,
  presetMessagesAnim,
  presetMessages,
  presetIcons,
  onPresetMessage,
  showTrimNotice = false,
}: MessageListProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const visible = conversation.slice(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

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
  }, [isGenerating, menuOpacity]);

  const startEdit = (visibleIndex: number, content: string) => {
    if (isGenerating) return;
    setEditingIndex(visibleIndex);
    setEditDraft(content);
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditDraft('');
  };

  const confirmEdit = (visibleIndex: number, hasAttachments: boolean) => {
    const trimmed = editDraft.trim();
    if (!trimmed && !hasAttachments) return;
    setEditingIndex(null);
    setEditDraft('');
    onEditUserMessage(visibleIndex, editDraft);
  };

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
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'flex-end',
          paddingHorizontal: Math.max(16, Dimensions.get('window').width * 0.04),
          paddingTop: 60,
          paddingBottom: scrollBottomPadding,
        }}
        ref={scrollViewRef}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
          if (autoScrollEnabled && (isGenerating || keyboardPadding > 0)) {
            onScrollChatToEnd(false);
          }
        }}
      >
        {visible.map((msg, index) => {
          const isLastVisible = index === visible.length - 1;
          const isStreamingMessage =
            msg.role === 'assistant' && isGenerating && isLastVisible;
          const isAssistantDirect =
            msg.role === 'assistant' && assistantDisplayMode === 'direct';
          const containerStyle: object[] = [];
          if (msg.role === 'user') {
            containerStyle.push(styles.messageBubble, styles.userBubble);
          } else if (msg.role === 'assistant' && !isAssistantDirect) {
            containerStyle.push(styles.messageBubble, styles.llamaBubble);
          } else if (isAssistantDirect) {
            containerStyle.push(styles.messageDirect);
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
                    <ThinkingIndicator theme={theme} />
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
                      />
                    ) : editingIndex === index ? (
                      <TextInput
                        value={editDraft}
                        onChangeText={setEditDraft}
                        multiline
                        autoFocus
                        style={{
                          width: '100%',
                          minWidth: 120,
                          fontSize: 18,
                          fontFamily: 'Poppins',
                          lineHeight: 28,
                          color: theme.colors.primaryText,
                          padding: 0,
                          margin: 0,
                          textAlignVertical: 'top',
                        }}
                        placeholderTextColor={theme.colors.textTertiary}
                        selectionColor={theme.colors.primaryText}
                      />
                    ) : (
                      <MessageMarkdown
                        content={msg.content}
                        color={theme.colors.primaryText}
                      />
                    )
                  ) : editingIndex === index && msg.role === 'user' ? (
                    <TextInput
                      value={editDraft}
                      onChangeText={setEditDraft}
                      multiline
                      autoFocus
                      style={{
                        width: '100%',
                        minWidth: 120,
                        fontSize: 18,
                        fontFamily: 'Poppins',
                        lineHeight: 28,
                        color: theme.colors.primaryText,
                        padding: 0,
                        margin: 0,
                        textAlignVertical: 'top',
                      }}
                      placeholderTextColor={theme.colors.textTertiary}
                      selectionColor={theme.colors.primaryText}
                    />
                  ) : null}
            </>
          );

          return (
            <View key={index} style={styles.messageWrapper}>
              {hasBubbleContent &&
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
                    ]}
                  >
                    {bubbleBody}
                  </View>
                ))}
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
                    <Ionicons name="checkmark-outline" size={16} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
              )}
              {msg.thought && msg.role === 'assistant' && (
                <TouchableOpacity
                  onPress={() => onToggleThought(index + 1)}
                  style={styles.toggleButton}
                >
                  <Text style={styles.toggleText}>
                    {msg.showThought ? '▼ Hide Thinking' : '▶ Show Thinking'}
                  </Text>
                </TouchableOpacity>
              )}
              {msg.showThought && msg.thought && (
                <View style={styles.thoughtContainer}>
                  <Text style={styles.thoughtTitle}>Thinking Process:</Text>
                  <View style={{ width: '100%', maxWidth: '100%', flexShrink: 1 }}>
                    <Text style={styles.thoughtText}>
                      {msg.thought.replace(/^(?:\s*Thinking Process:\s*)+/i, '').trim()}
                    </Text>
                  </View>
                </View>
              )}
              {msg.role === 'assistant' &&
                msg.content.trim().length > 0 &&
                !isStreamingMessage && (
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
                        onPress={() => onCopyMessage(msg.content)}
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
                            {turnTps} tokens/s
                          </Text>
                        ) : null;
                      })()}
                    </View>
                    {onSpeakMessage && (
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
                            speakingVisibleIndex === index
                              ? 'Stop speaking'
                              : 'Speak message'
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
              opacity: greetingOpacity,
              transform: [{ translateY: greetingKeyboardShift }],
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
          <Text style={styles.greetingText}>
            {isTemporaryMode ? 'Temporary Mode' : greetingLine}
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
                    style={{
                      backgroundColor: 'transparent',
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 30,
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      marginBottom: index < presetMessages.length - 1 ? 8 : 0,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 200,
                    }}
                  >
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
    </View>
  );
}
