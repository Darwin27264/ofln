/**
 * Interactive floating command palette for OFLN slash commands.
 * Renders frosted glass popover above the chat composer when user types "/".
 * Completely positioned out of flex flow so it never distorts composer layout height.
 */

import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Animated,
  StyleSheet,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { FrostedGlass } from './FrostedGlass';
import { useTheme } from '../context/ThemeContext';
import {
  type SlashCommand,
  filterSlashCommands,
} from '../utils/slashCommands';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

export interface CommandPaletteProps {
  userInput: string;
  onSelectCommand: (command: SlashCommand) => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = React.memo(
  ({ userInput, onSelectCommand }) => {
    const { theme } = useTheme();

    const matchingCommands = useMemo(
      () => filterSlashCommands(userInput),
      [userInput],
    );

    const isVisible = matchingCommands.length > 0;

    const animOpacity = useRef(new Animated.Value(0)).current;
    const animTranslateY = useRef(new Animated.Value(8)).current;

    useEffect(() => {
      Animated.parallel([
        Animated.timing(animOpacity, {
          toValue: isVisible ? 1 : 0,
          duration: ANIMATION_DURATIONS.FAST,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(animTranslateY, {
          toValue: isVisible ? 0 : 8,
          duration: ANIMATION_DURATIONS.FAST,
          easing: EASING.DECELERATE,
          useNativeDriver: true,
        }),
      ]).start();
    }, [isVisible, animOpacity, animTranslateY]);

    if (!isVisible) {
      return null;
    }

    return (
      <Animated.View
        pointerEvents={isVisible ? 'box-none' : 'none'}
        style={[
          styles.container,
          {
            borderColor: theme.colors.border,
            shadowColor: theme.mode === 'dark' ? '#000' : '#444',
            opacity: animOpacity,
            transform: [{ translateY: animTranslateY }],
          },
        ]}
      >
        <FrostedGlass style={StyleSheet.absoluteFillObject} />

        {/* Header */}
        <View style={[styles.headerRow, { borderBottomColor: theme.colors.borderLight }]}>
          <Ionicons
            name="flash-outline"
            size={13}
            color={theme.colors.accent}
            style={styles.headerIcon}
          />
          <Text style={[styles.headerTitle, { color: theme.colors.textSecondary }]}>
            COMMANDS
          </Text>
        </View>

        {/* Scrollable command list */}
        <ScrollView
          style={styles.scrollList}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {matchingCommands.map((item, index) => {
            const isLast = index === matchingCommands.length - 1;
            return (
              <TouchableOpacity
                key={item.name}
                style={[
                  styles.itemRow,
                  !isLast && { borderBottomColor: theme.colors.borderLight, borderBottomWidth: StyleSheet.hairlineWidth },
                ]}
                activeOpacity={0.65}
                onPress={() => onSelectCommand(item)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} command, ${item.description}`}
              >
                <View
                  style={[
                    styles.iconBubble,
                    { backgroundColor: theme.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' },
                  ]}
                >
                  <Ionicons
                    name={item.icon}
                    size={17}
                    color={theme.colors.accent || theme.colors.primary}
                  />
                </View>

                <View style={styles.textColumn}>
                  <View style={styles.nameRow}>
                    <Text style={[styles.cmdName, { color: theme.colors.text }]}>
                      {item.label}
                    </Text>
                    {item.hasArgs && item.syntax && (
                      <Text style={[styles.syntaxBadge, { color: theme.colors.textTertiary }]}>
                        {item.syntax.replace(item.label, '').trim()}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[styles.cmdDesc, { color: theme.colors.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.description}
                  </Text>
                </View>

                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color={theme.colors.textTertiary}
                  style={styles.chevron}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
    );
  },
);

CommandPalette.displayName = 'CommandPalette';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    marginBottom: 10,
    maxHeight: 240,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    zIndex: 50,
    ...Platform.select({
      ios: {
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.22,
        shadowRadius: 14,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerIcon: {
    marginRight: 6,
  },
  headerTitle: {
    fontSize: 10.5,
    fontFamily: 'Poppins',
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  scrollList: {
    maxHeight: 200,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cmdName: {
    fontSize: 13.5,
    fontFamily: 'Poppins',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  syntaxBadge: {
    fontSize: 11.5,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    marginLeft: 6,
  },
  cmdDesc: {
    fontSize: 11,
    fontFamily: 'Poppins',
    marginTop: 1,
  },
  chevron: {
    marginLeft: 8,
  },
});

