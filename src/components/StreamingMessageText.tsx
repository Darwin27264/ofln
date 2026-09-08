/**
 * Assistant message body with smooth streaming reveal.
 *
 * While revealing: plain Text + caret (avoids Markdown re-parse jank).
 * After catch-up: themed Markdown (code fences + copy).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';

import { useSmoothRevealText } from '../hooks/useSmoothRevealText';
import { lineHeightForChatFont } from '../utils/chatFontSize';
import { MessageMarkdown } from './MessageMarkdown';

type Props = {
  content: string;
  isStreaming: boolean;
  color: string;
  fontSize?: number;
};

const FONT = 'Poppins';
const ANDROID_TEXT =
  Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : null;
const StreamingCaret = React.memo(({
  color,
  fontSize,
  lineHeight,
}: {
  color: string;
  fontSize: number;
  lineHeight: number;
}) => {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.12,
          duration: 400,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.Text
      style={{
        color,
        opacity,
        fontSize,
        fontFamily: FONT,
        lineHeight,
        fontWeight: '500',
        ...ANDROID_TEXT,
      }}
    >
      ▍
    </Animated.Text>
  );
});
StreamingCaret.displayName = 'StreamingCaret';

export const StreamingMessageText = React.memo(function StreamingMessageText({
  content,
  isStreaming,
  color,
  fontSize = 16,
}: Props) {
  const { displayed, isRevealing } = useSmoothRevealText(content, isStreaming);
  const lineHeight = lineHeightForChatFont(fontSize);

  if (isRevealing) {
    return (
      <View style={{ flexShrink: 1, width: '100%', maxWidth: '100%' }}>
        <Text
          style={{
            fontSize,
            fontFamily: FONT,
            color,
            lineHeight,
            ...ANDROID_TEXT,
          }}
        >
          {displayed}
          <StreamingCaret color={color} fontSize={fontSize} lineHeight={lineHeight} />
        </Text>
      </View>
    );
  }

  return (
    <MessageMarkdown
      content={content}
      color={color}
      fontSize={fontSize}
      lineHeight={lineHeight}
      fontFamily={FONT}
    />
  );
});
