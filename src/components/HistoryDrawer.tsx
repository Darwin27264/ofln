/**
 * Chat history slide-out drawer + long-press context menu.
 * Presentational only — ConversationScreen owns state and handlers (S04a).
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  ScrollView,
  Animated,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { FrostedGlass } from './FrostedGlass';
import { StaggerFadeIn } from './StaggerFadeIn';
import { useTheme } from '../context/ThemeContext';
import type { ChatConversation } from '../services/chatHistoryService';

export type GroupedChatHistory = {
  pinnedChats: ChatConversation[];
  sortedKeys: string[];
  groupedUnpinned: Map<string, ChatConversation[]>;
};

type ChatHistoryCardProps = {
  chat: ChatConversation;
  currentChatId: string | null;
  theme: { colors: Record<string, string> };
  onPress: () => void;
  onLongPress: (event: any) => void;
  isEditing: boolean;
  editingTitle: string;
  onEditingTitleChange: (title: string) => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;
  isMultiselectMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
};

const ChatHistoryCard: React.FC<ChatHistoryCardProps> = React.memo(
  ({
    chat,
    currentChatId,
    theme,
    onPress,
    onLongPress,
    isEditing,
    editingTitle,
    onEditingTitleChange,
    onRenameSave,
    isMultiselectMode = false,
    isSelected = false,
    onToggleSelect,
  }) => {
    const isCurrentChat = currentChatId === chat.id;

    if (isEditing) {
      return (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          style={{
            paddingVertical: 8,
            marginBottom: 4,
          }}
        >
          <TextInput
            value={editingTitle}
            onChangeText={onEditingTitleChange}
            onBlur={onRenameSave}
            onSubmitEditing={onRenameSave}
            style={{
              color: theme.colors.text,
              fontSize: 18,
              fontWeight: '400',
              fontFamily: 'Poppins',
            }}
            autoFocus
            selectTextOnFocus
          />
        </Pressable>
      );
    }

    if (isMultiselectMode) {
      return (
        <Pressable
          onPress={onToggleSelect}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 12,
            marginBottom: 4,
            flexDirection: 'row',
            alignItems: 'center',
            borderRadius: 8,
            backgroundColor: isCurrentChat ? theme.colors.primary + '15' : 'transparent',
          }}
        >
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              borderWidth: 2,
              borderColor: isSelected ? theme.colors.primary : theme.colors.border,
              backgroundColor: isSelected ? theme.colors.primary : 'transparent',
              marginRight: 12,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isSelected && (
              <Ionicons name="checkmark" size={16} color={theme.colors.primaryText} />
            )}
          </View>
          <Text
            style={{
              color: isCurrentChat ? theme.colors.text : theme.colors.textSecondary,
              fontSize: 18,
              fontWeight: isCurrentChat ? '500' : '400',
              fontFamily: 'Poppins',
              flex: 1,
            }}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {chat.title}
          </Text>
        </Pressable>
      );
    }

    return (
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          marginBottom: 4,
          borderRadius: 8,
          backgroundColor: isCurrentChat ? theme.colors.primary + '15' : 'transparent',
        }}
      >
        <Text
          style={{
            color: isCurrentChat ? theme.colors.text : theme.colors.textSecondary,
            fontSize: 18,
            fontWeight: isCurrentChat ? '500' : '400',
            fontFamily: 'Poppins',
          }}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {chat.title}
        </Text>
      </Pressable>
    );
  },
  (prevProps, nextProps) =>
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.currentChatId === nextProps.currentChatId &&
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.editingTitle === nextProps.editingTitle &&
    prevProps.isMultiselectMode === nextProps.isMultiselectMode &&
    prevProps.isSelected === nextProps.isSelected,
);

ChatHistoryCard.displayName = 'ChatHistoryCard';

export type HistoryDrawerProps = {
  isPanelOpen: boolean;
  panelWidth: number;
  panelAnim: Animated.Value;
  backdropOpacity: Animated.Value;
  panelStyle: object;
  bottomInset: number;

  chatHistory: ChatConversation[];
  groupedChatHistory: GroupedChatHistory | null;
  historySearchQuery: string;
  onHistorySearchQueryChange: (query: string) => void;
  isLoadingHistory: boolean;
  currentChatId: string | null;

  isMultiselectMode: boolean;
  selectedChatIds: Set<string>;
  multiselectHeaderHeight: Animated.Value;
  multiselectHeaderOpacity: Animated.Value;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDeleteSelected: () => void;
  onExitMultiselect: () => void;
  onToggleSelect: (chatId: string) => void;

  editingChatId: string | null;
  editingTitle: string;
  onEditingTitleChange: (title: string) => void;
  onRenameSave: () => void;
  onRenameCancel: () => void;

  onClose: () => void;
  onChatPress: (chat: ChatConversation) => void;
  onChatLongPress: (chat: ChatConversation, event: any) => void;
  onNewChat: () => void;

  menuVisible: boolean;
  menuPosition: { x: number; y: number } | null;
  selectedMenuChatId: string | null;
  menuOpacity: Animated.Value;
  menuScale: Animated.Value;
  menuItem0Opacity: Animated.Value;
  menuItem0Translate: Animated.Value;
  menuItem1Opacity: Animated.Value;
  menuItem1Translate: Animated.Value;
  menuItem2Opacity: Animated.Value;
  menuItem2Translate: Animated.Value;
  menuItem3Opacity: Animated.Value;
  menuItem3Translate: Animated.Value;
  onDismissMenu: () => void;
  onRename: (chatId: string) => void;
  onPinToggle: (chatId: string) => void;
  onEnterMultiselect: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
};

export function HistoryDrawer({
  isPanelOpen,
  panelWidth,
  panelAnim,
  backdropOpacity,
  panelStyle,
  bottomInset,
  chatHistory,
  groupedChatHistory,
  historySearchQuery,
  onHistorySearchQueryChange,
  isLoadingHistory,
  currentChatId,
  isMultiselectMode,
  selectedChatIds,
  multiselectHeaderHeight,
  multiselectHeaderOpacity,
  onSelectAll,
  onDeselectAll,
  onDeleteSelected,
  onExitMultiselect,
  onToggleSelect,
  editingChatId,
  editingTitle,
  onEditingTitleChange,
  onRenameSave,
  onRenameCancel,
  onClose,
  onChatPress,
  onChatLongPress,
  onNewChat,
  menuVisible,
  menuPosition,
  selectedMenuChatId,
  menuOpacity,
  menuScale,
  menuItem0Opacity,
  menuItem0Translate,
  menuItem1Opacity,
  menuItem1Translate,
  menuItem2Opacity,
  menuItem2Translate,
  menuItem3Opacity,
  menuItem3Translate,
  onDismissMenu,
  onRename,
  onPinToggle,
  onEnterMultiselect,
  onDeleteChat,
}: HistoryDrawerProps) {
  const { theme } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;

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

  const selectedMenuChat = selectedMenuChatId
    ? chatHistory.find((c) => c.id === selectedMenuChatId)
    : null;
  const isPinned = selectedMenuChat?.pinned || false;

  return (
    <>
      {menuVisible && (
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
          <TouchableWithoutFeedback onPress={onDismissMenu}>
            <Animated.View
              style={{
                ...StyleSheet.absoluteFillObject,
                backgroundColor: 'rgba(0, 0, 0, 0.2)',
                opacity: menuOpacity,
              }}
            />
          </TouchableWithoutFeedback>
          {menuPosition && selectedMenuChatId && (
            <Animated.View
              style={{
                position: 'absolute',
                left: Math.max(16, Math.min(menuPosition.x - 80, screenWidth - 200)),
                top:
                  menuPosition.y < screenHeight * 0.3
                    ? Math.min(menuPosition.y + 10, screenHeight - 220)
                    : Math.max(50, menuPosition.y - 220),
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
                  onPress={() => onRename(selectedMenuChatId)}
                  style={menuBlockStyle}
                  activeOpacity={0.85}
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
                    Rename
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: menuItem1Opacity,
                  transform: [{ translateY: menuItem1Translate }],
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => onPinToggle(selectedMenuChatId)}
                  style={menuBlockStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons
                    name={isPinned ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                    color={theme.colors.text}
                  />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    {isPinned ? 'Unpin' : 'Pin'}
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: menuItem2Opacity,
                  transform: [{ translateY: menuItem2Translate }],
                  marginBottom: 8,
                }}
              >
                <TouchableOpacity
                  onPress={() => onEnterMultiselect(selectedMenuChatId)}
                  style={menuBlockStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="checkbox-outline" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    Select Multiple
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: menuItem3Opacity,
                  transform: [{ translateY: menuItem3Translate }],
                }}
              >
                <TouchableOpacity
                  onPress={() => onDeleteChat(selectedMenuChatId)}
                  style={menuBlockStyle}
                  activeOpacity={0.85}
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                  <Text
                    style={{
                      color: theme.colors.error,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              </Animated.View>
            </Animated.View>
          )}
        </View>
      )}

      {isPanelOpen && (
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              opacity: backdropOpacity,
              zIndex: 15,
            }}
          />
        </TouchableWithoutFeedback>
      )}

      <Animated.View
        style={[
          panelStyle,
          {
            transform: [{ translateX: panelAnim }],
            zIndex: 20,
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: panelWidth,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 20,
            borderBottomLeftRadius: 0,
            borderBottomRightRadius: 20,
            overflow: 'hidden',
          },
        ]}
        pointerEvents={isPanelOpen ? 'auto' : 'none'}
      >
        <FrostedGlass variant="panel" style={StyleSheet.absoluteFillObject} />

        <Animated.View
          style={{
            overflow: 'hidden',
            height: multiselectHeaderHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 60],
            }),
          }}
        >
          <Animated.View style={{ opacity: multiselectHeaderOpacity }}>
            {isMultiselectMode && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.colors.border,
                  backgroundColor: 'transparent',
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 16,
                      fontWeight: '600',
                      fontFamily: 'Poppins',
                      marginRight: 16,
                    }}
                  >
                    {selectedChatIds.size} selected
                  </Text>
                  <TouchableOpacity
                    onPress={
                      selectedChatIds.size === chatHistory.length ? onDeselectAll : onSelectAll
                    }
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons
                      name={
                        selectedChatIds.size === chatHistory.length
                          ? 'square-outline'
                          : 'checkbox'
                      }
                      size={20}
                      color={theme.colors.text}
                    />
                  </TouchableOpacity>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {selectedChatIds.size > 0 && (
                    <TouchableOpacity
                      onPress={onDeleteSelected}
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: theme.colors.error,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 12,
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash" size={20} color={theme.colors.primaryText} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={onExitMultiselect}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={20} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </Animated.View>
        </Animated.View>

        <ScrollView
          style={{ flex: 1, marginTop: isMultiselectMode ? 0 : 16, paddingHorizontal: 16 }}
          contentContainerStyle={{ paddingBottom: 100 }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          {!isMultiselectMode && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.surface,
                borderRadius: 14,
                paddingHorizontal: 12,
                marginBottom: 16,
                minHeight: 44,
              }}
            >
              <Ionicons
                name="search-outline"
                size={18}
                color={theme.colors.textTertiary}
                style={{ marginRight: 8 }}
              />
              <TextInput
                value={historySearchQuery}
                onChangeText={onHistorySearchQueryChange}
                placeholder="Search chats"
                placeholderTextColor={theme.colors.textTertiary}
                accessibilityLabel="Search chats"
                style={{
                  flex: 1,
                  color: theme.colors.text,
                  fontSize: 15,
                  fontFamily: 'Poppins',
                  paddingVertical: 10,
                }}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
              {historySearchQuery.length > 0 && (
                <TouchableOpacity
                  onPress={() => onHistorySearchQueryChange('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Clear search"
                >
                  <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
          )}

          {isLoadingHistory ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 18,
                  fontFamily: 'Poppins',
                }}
              >
                Loading...
              </Text>
            </View>
          ) : chatHistory.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 18,
                  fontFamily: 'Poppins',
                }}
              >
                No chats yet
              </Text>
              <Text
                style={{
                  color: theme.colors.textTertiary,
                  fontSize: 14,
                  marginTop: 8,
                  fontFamily: 'Poppins',
                }}
              >
                Start a conversation to see it here
              </Text>
            </View>
          ) : !groupedChatHistory ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 16,
                  fontFamily: 'Poppins',
                  textAlign: 'center',
                }}
              >
                No chats match "{historySearchQuery.trim()}"
              </Text>
            </View>
          ) : groupedChatHistory ? (
            <>
              {groupedChatHistory.pinnedChats.length > 0 && (
                <View style={{ marginBottom: 24 }}>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: '600',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Pinned
                  </Text>
                  {groupedChatHistory.pinnedChats.map((chat, index) => (
                    <StaggerFadeIn
                      key={chat.id}
                      index={index}
                      active={isPanelOpen && !isLoadingHistory}
                    >
                      <ChatHistoryCard
                        chat={chat}
                        currentChatId={currentChatId}
                        theme={theme}
                        onPress={() =>
                          isMultiselectMode ? onToggleSelect(chat.id) : onChatPress(chat)
                        }
                        onLongPress={(e) => onChatLongPress(chat, e)}
                        isEditing={editingChatId === chat.id}
                        editingTitle={editingTitle}
                        onEditingTitleChange={onEditingTitleChange}
                        onRenameSave={onRenameSave}
                        onRenameCancel={onRenameCancel}
                        isMultiselectMode={isMultiselectMode}
                        isSelected={selectedChatIds.has(chat.id)}
                        onToggleSelect={() => onToggleSelect(chat.id)}
                      />
                    </StaggerFadeIn>
                  ))}
                </View>
              )}

              {groupedChatHistory.sortedKeys.map((monthYear) => (
                <View key={monthYear} style={{ marginBottom: 24 }}>
                  <Text
                    style={{
                      color: theme.colors.textSecondary,
                      fontSize: 14,
                      fontWeight: 'bold',
                      marginBottom: 12,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {monthYear}
                  </Text>
                  {groupedChatHistory.groupedUnpinned.get(monthYear)!.map((chat, chatIndex) => {
                    const globalIndex =
                      groupedChatHistory.pinnedChats.length +
                      groupedChatHistory.sortedKeys
                        .slice(0, groupedChatHistory.sortedKeys.indexOf(monthYear))
                        .reduce(
                          (sum, key) =>
                            sum + (groupedChatHistory.groupedUnpinned.get(key)?.length || 0),
                          0,
                        ) +
                      chatIndex;
                    return (
                      <StaggerFadeIn
                        key={chat.id}
                        index={globalIndex}
                        active={isPanelOpen && !isLoadingHistory}
                      >
                        <ChatHistoryCard
                          chat={chat}
                          currentChatId={currentChatId}
                          theme={theme}
                          onPress={() =>
                            isMultiselectMode ? onToggleSelect(chat.id) : onChatPress(chat)
                          }
                          onLongPress={(e) => onChatLongPress(chat, e)}
                          isEditing={editingChatId === chat.id}
                          editingTitle={editingTitle}
                          onEditingTitleChange={onEditingTitleChange}
                          onRenameSave={onRenameSave}
                          onRenameCancel={onRenameCancel}
                          isMultiselectMode={isMultiselectMode}
                          isSelected={selectedChatIds.has(chat.id)}
                          onToggleSelect={() => onToggleSelect(chat.id)}
                        />
                      </StaggerFadeIn>
                    );
                  })}
                </View>
              ))}
            </>
          ) : null}
        </ScrollView>

        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: Math.max(16, bottomInset + 8),
            backgroundColor: 'transparent',
          }}
        >
          <TouchableOpacity
            onPress={() => {
              onNewChat();
              onClose();
            }}
            style={{
              backgroundColor: theme.colors.primary,
              paddingVertical: 16,
              paddingHorizontal: 20,
              borderRadius: 30,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
            }}
          >
            <Ionicons name="add" size={22} color={theme.colors.primaryText} />
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 18,
                fontWeight: '600',
                fontFamily: 'Poppins',
                marginLeft: 8,
              }}
            >
              New Chat
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}
