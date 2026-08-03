/**
 * Assistant message body with smooth streaming reveal.
 *
 * While revealing: plain Text + caret (avoids Markdown re-parse jank).
 * After catch-up: themed Markdown (code fences + copy).
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Platform, Text, View } from 'react-native';

import { useSmoothRevealText } from '../hooks/useSmoothRevealText';
import { MessageMarkdown } from './MessageMarkdown';

type Props = {
  content: string;
  isStreaming: boolean;
  color: string;
};

const BODY_SIZE = 16;
const LINE_HEIGHT = 24;
const FONT = 'Poppins';
const ANDROID_TEXT =
  Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : null;
const StreamingCaret = React.memo(({ color }: { color: string }) => {
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
        fontSize: BODY_SIZE,
        fontFamily: FONT,
        lineHeight: LINE_HEIGHT,
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
}: Props) {
  const { displayed, isRevealing } = useSmoothRevealText(content, isStreaming);

  if (isRevealing) {
    return (
      <View style={{ flexShrink: 1, width: '100%', maxWidth: '100%' }}>
        <Text
          style={{
            fontSize: BODY_SIZE,
            fontFamily: FONT,
            color,
            lineHeight: LINE_HEIGHT,
            ...ANDROID_TEXT,
          }}
        >
          {displayed}
          <StreamingCaret color={color} />
        </Text>
      </View>
    );
  }

  return <MessageMarkdown content={content} color={color} />;
});
