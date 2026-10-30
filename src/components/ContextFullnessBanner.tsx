/**
 * Soft context-fullness notice.
 * Dismiss + New chat only — no n_ctx reload in this step.
 */

import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useTheme } from '../context/ThemeContext';

type Props = {
  percent: number;
  onDismiss: () => void;
  onNewChat: () => void;
  onSummarize?: () => void;
  isSummarizing?: boolean;
};

export function ContextFullnessBanner({
  percent,
  onDismiss,
  onNewChat,
  onSummarize,
  isSummarizing = false,
}: Props) {
  const { theme } = useTheme();

  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`Context about ${percent} percent full`}
      style={{
        marginHorizontal: 16,
        marginTop: 58,
        marginBottom: 4,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        zIndex: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <Ionicons
          name="alert-circle-outline"
          size={18}
          color={theme.colors.warning}
          style={{ marginRight: 10, marginTop: 2 }}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 14,
              fontFamily: 'Poppins',
              fontWeight: '600',
              color: theme.colors.text,
              marginBottom: 4,
            }}
          >
            Context getting full (~{percent}%)
          </Text>
          <Text
            style={{
              fontSize: 13,
              fontFamily: 'Poppins',
              color: theme.colors.textSecondary,
              lineHeight: 18,
            }}
          >
            Older turns may be trimmed soon. Start a new chat for a fresh window.
          </Text>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
                marginTop: 10,
              }}
            >
              {onSummarize && (
                <TouchableOpacity
                  onPress={onSummarize}
                  disabled={isSummarizing}
                  accessibilityLabel="Summarize earlier turns and continue"
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: theme.colors.card,
                    borderColor: theme.colors.accent,
                    borderWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                  }}
                >
                  {isSummarizing ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.accent}
                      style={{ marginRight: 6 }}
                    />
                  ) : (
                    <Ionicons
                      name="sparkles-outline"
                      size={14}
                      color={theme.colors.accent}
                      style={{ marginRight: 5 }}
                    />
                  )}
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: 'Poppins',
                      fontWeight: '600',
                      color: theme.colors.accent,
                    }}
                  >
                    {isSummarizing ? 'Summarizing…' : 'Summarize & continue'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onNewChat}
                accessibilityLabel="New chat"
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: 'Poppins',
                    fontWeight: '600',
                    color: theme.colors.text,
                  }}
                >
                  New chat
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDismiss}
                accessibilityLabel="Dismiss context banner"
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontFamily: 'Poppins',
                    color: theme.colors.textTertiary,
                  }}
                >
                  Dismiss
                </Text>
              </TouchableOpacity>
            </View>
        </View>
      </View>
    </View>
  );
}
