/**
 * Message list + empty-state greeting for the conversation canvas.
 * Presentational — ConversationScreen owns scroll/send/regenerate handlers (S04c).
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  Dimensions,
  Image,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { MessageMarkdown } from './MessageMarkdown';
import { StreamingMessageText } from './StreamingMessageText';
import { useTheme } from '../context/ThemeContext';
import { createStyles } from '../styles/styles';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

export type MessageListAttachment = {
  type: 'image';
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
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

  return (
    <View style={{ flex: 1, position: 'relative' }}>
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

          return (
            <View key={index} style={styles.messageWrapper}>
              {hasBubbleContent && (
                <View
                  style={[containerStyle, isAssistantDirect ? { maxWidth: '100%' } : {}]}
                >
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
                    ) : (
                      <MessageMarkdown
                        content={msg.content}
                        color={theme.colors.primaryText}
                      />
                    )
                  ) : null}
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
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginTop: 12,
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
    </View>
  );
}
