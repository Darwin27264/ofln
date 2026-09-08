/**
 * Themed markdown for chat messages.
 *
 * Dark-mode code fences + copy control. Uses markdown-it `breaks: true` with a
 * full-width hardbreak so lone newlines survive after streaming (library
 * paragraphs are row+wrap; plain Text during stream already kept `\n`).
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Platform,
  Text,
  TouchableOpacity,
  View,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import Ionicons from 'react-native-vector-icons/Ionicons';
import Markdown, { MarkdownIt } from 'react-native-markdown-display';

import { useTheme, type ThemeColors } from '../context/ThemeContext';

type Props = {
  content: string;
  /** Body text color (assistant vs user bubble). */
  color: string;
  fontSize?: number;
  lineHeight?: number;
  fontFamily?: string;
};

const MONO = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

const chatMarkdownIt = MarkdownIt({ typographer: true, breaks: true });

function codePalette(isDark: boolean, colors: ThemeColors) {
  if (isDark) {
    return {
      background: '#1C1C1E',
      border: colors.border,
      text: '#E5E7EB',
      headerBg: '#252528',
      muted: colors.textTertiary,
      inlineBg: '#2A2A2A',
    };
  }
  return {
    background: '#F4F4F5',
    border: colors.border,
    text: '#1F2937',
    headerBg: '#EAEAEC',
    muted: colors.textTertiary,
    inlineBg: '#EFEFF1',
  };
}

function trimFenceContent(raw: string) {
  if (typeof raw === 'string' && raw.charAt(raw.length - 1) === '\n') {
    return raw.substring(0, raw.length - 1);
  }
  return raw;
}

const CodeFence = React.memo(function CodeFence({
  content,
  language,
  palette,
}: {
  content: string;
  language: string;
  palette: ReturnType<typeof codePalette>;
}) {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    Clipboard.setString(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }, [content]);

  const label = language?.trim() || 'code';

  return (
    <View
      style={{
        marginVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.background,
        overflow: 'hidden',
        width: '100%',
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 8,
          backgroundColor: palette.headerBg,
          borderBottomWidth: 1,
          borderBottomColor: palette.border,
        }}
      >
        <Text
          style={{
            fontSize: 12,
            fontFamily: 'Poppins',
            color: palette.muted,
            textTransform: 'lowercase',
          }}
          numberOfLines={1}
        >
          {label}
        </Text>
        <TouchableOpacity
          onPress={onCopy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 6,
            paddingVertical: 2,
          }}
          accessibilityLabel={copied ? 'Copied' : 'Copy code'}
        >
          <Ionicons
            name={copied ? 'checkmark' : 'copy-outline'}
            size={14}
            color={copied ? '#34C759' : palette.muted}
          />
          <Text
            style={{
              fontSize: 12,
              fontFamily: 'Poppins',
              color: copied ? '#34C759' : palette.muted,
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>
      <Text
        selectable
        style={{
          padding: 12,
          fontSize: 13,
          lineHeight: 20,
          fontFamily: MONO,
          color: palette.text,
        }}
      >
        {content}
      </Text>
    </View>
  );
});

export const MessageMarkdown = React.memo(function MessageMarkdown({
  content,
  color,
  fontSize = 16,
  lineHeight = 24,
  fontFamily = 'Poppins',
}: Props) {
  const { theme, isDark } = useTheme();
  const palette = useMemo(
    () => codePalette(isDark, theme.colors),
    [isDark, theme.colors],
  );

  const mdStyles = useMemo(() => {
    const inline: TextStyle = {
      fontFamily: MONO,
      fontSize: fontSize * 0.9,
      color: palette.text,
      backgroundColor: palette.inlineBg,
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 4,
      paddingHorizontal: 4,
      paddingVertical: 1,
    };
    const fenceShell: ViewStyle = {
      margin: 0,
      padding: 0,
      backgroundColor: 'transparent',
      borderWidth: 0,
    };
    return {
      body: {
        fontSize,
        fontFamily,
        color,
        lineHeight,
        margin: 0,
        padding: 0,
        ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
      },
      // Keep row+wrap so width:100% hardbreaks wrap to the next line.
      // No bottom margin here — last paragraph must not add slack under the
      // text or single-line bubbles look top-heavy (padding + margin stack).
      paragraph: {
        marginTop: 0,
        marginBottom: 0,
        padding: 0,
        flexWrap: 'wrap',
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'flex-start',
        width: '100%',
      },
      text: {
        lineHeight,
        margin: 0,
        padding: 0,
        ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
      },
      textgroup: {
        lineHeight,
        ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
      },
      // Headings track body size so large/small chat type stays coherent.
      heading1: {
        fontSize: fontSize * 1.35,
        lineHeight: Math.round(lineHeight * 1.35),
        fontFamily,
        color,
        fontWeight: '700' as const,
        marginTop: 4,
        marginBottom: 6,
      },
      heading2: {
        fontSize: fontSize * 1.2,
        lineHeight: Math.round(lineHeight * 1.2),
        fontFamily,
        color,
        fontWeight: '700' as const,
        marginTop: 4,
        marginBottom: 4,
      },
      heading3: {
        fontSize: fontSize * 1.1,
        lineHeight: Math.round(lineHeight * 1.1),
        fontFamily,
        color,
        fontWeight: '600' as const,
        marginTop: 2,
        marginBottom: 4,
      },
      // Full-width, zero-height wrap marker (overrides library height: 1).
      hardbreak: {
        width: '100%',
        height: 0,
      },
      code_inline: inline,
      code_block: {
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 20,
        color: palette.text,
        backgroundColor: palette.background,
        borderWidth: 1,
        borderColor: palette.border,
        borderRadius: 10,
        padding: 12,
        marginVertical: 8,
      },
      fence: fenceShell,
      blockquote: {
        backgroundColor: isDark ? '#1A1A1A' : '#F5F5F5',
        borderColor: theme.colors.border,
        borderLeftWidth: 4,
        marginLeft: 0,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginBottom: 8,
      },
      bullet_list: { marginBottom: 8 },
      ordered_list: { marginBottom: 8 },
      list_item: { marginBottom: 4 },
      hr: {
        backgroundColor: theme.colors.border,
        height: 1,
        marginVertical: 8,
      },
      link: {
        color: theme.colors.accent,
      },
    };
  }, [color, fontFamily, fontSize, isDark, lineHeight, palette, theme.colors]);

  const rules = useMemo(
    () => ({
      fence: (node: any) => {
        const code = trimFenceContent(node.content ?? '');
        const language =
          typeof node.sourceInfo === 'string' ? node.sourceInfo : '';
        return (
          <CodeFence
            key={node.key}
            content={code}
            language={language}
            palette={palette}
          />
        );
      },
      code_block: (node: any) => {
        const code = trimFenceContent(node.content ?? '');
        return (
          <CodeFence
            key={node.key}
            content={code}
            language=""
            palette={palette}
          />
        );
      },
      // Gap between paragraphs only — never after the last one (bubble centering).
      paragraph: (node: any, children: any, parent: any, styles: any) => {
        const siblings = parent?.[0]?.children;
        const isLast =
          !Array.isArray(siblings) ||
          siblings[siblings.length - 1]?.key === node.key;
        return (
          <View
            key={node.key}
            style={[
              styles._VIEW_SAFE_paragraph,
              !isLast ? { marginBottom: 8 } : null,
            ]}
          >
            {children}
          </View>
        );
      },
      // Full-width spacer → next line without an extra blank gap.
      hardbreak: (node: any, _children: any, _parent: any, styles: any) => (
        <Text key={node.key} style={styles.hardbreak} />
      ),
    }),
    [palette],
  );

  if (!content) {
    return null;
  }

  return (
    <View style={{ flexShrink: 1, width: '100%', maxWidth: '100%' }}>
      <Markdown
        style={mdStyles}
        rules={rules}
        markdownit={chatMarkdownIt}
        mergeStyle
      >
        {content}
      </Markdown>
    </View>
  );
});
