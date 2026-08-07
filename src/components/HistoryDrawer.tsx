/**
 * Chat history slide-out drawer + long-press context menu.
 * Collage (masonry) layout — presentational only; ConversationScreen owns state (S04a).
 *
 * Layout:
 * - Top-right filter pill (unchanged). Left column aligns to that baseline;
 *   right column starts lower so cards never sit under the filter.
 * - Bottom: Back + New chat. Search is a centered floating pill that expands
 *   and lifts to the mid-band above the keyboard.
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
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
  Image,
  Keyboard,
  Platform,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { FrostedGlass } from './FrostedGlass';
import { StaggerFadeIn } from './StaggerFadeIn';
import { useTheme } from '../context/ThemeContext';
import type { ChatConversation, Message } from '../services/chatHistoryService';
import {
  HISTORY_DATE_PERIODS,
  filterChatsByDatePeriod,
  type HistoryDatePeriod,
} from '../services/chatHistoryHelpers';
import { ANIMATION_DURATIONS, EASING } from '../utils/animationConfig';

export type GroupedChatHistory = {
  pinnedChats: ChatConversation[];
  sortedKeys: string[];
  groupedUnpinned: Map<string, ChatConversation[]>;
};

const CARD_RADIUS = 14;
const GAP = 10;
/** Matches top filter pill height so left-column cards share its baseline. */
const TOP_CHROME_TOP = 8;
const FILTER_PILL_SIZE = 42;
/**
 * Right column drops below the filter so cards never sit under the pill —
 * left column starts flush with the filter for a staggered y-axis collage.
 */
const RIGHT_COLUMN_TOP_INSET = FILTER_PILL_SIZE + 22;
/** Capsule height; half-radius keeps collapsed + expanded field pill-shaped. */
const SEARCH_PILL_H = 44;
/** Icon + "Search" label pill (not a circle). */
const SEARCH_PILL_COLLAPSED_W = 108;
const BOTTOM_CHROME_PAD_H = 15;
const BACK_ROW_H = 48;

/**
 * Search pill motion — tight, overlapping expand + lift (shared EASING only).
 */
const SEARCH_MOTION = {
  expandMs: 200,
  collapseMs: 170,
  scrimInMs: 140,
  scrimOutMs: 110,
  easeOut: EASING.DECELERATE,
  easeIn: EASING.EASE_IN,
  easeInOut: EASING.STANDARD,
  /** Snappy vertical travel, no bounce */
  spring: {
    tension: 320,
    friction: 28,
    overshootClamping: true,
    useNativeDriver: false as const,
  },
} as const;

function formatRelativeChatLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round(
    (startOfToday.getTime() - startOfThatDay.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (dayDiff === 0) {
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function firstImageUri(messages: Message[] | undefined): string | null {
  if (!messages?.length) return null;
  for (const m of messages) {
    const att = m.attachments?.find((a) => a.type === 'image' && a.uri);
    if (att?.uri) return att.uri;
  }
  return null;
}

function estimateCardWeight(chat: ChatConversation): number {
  let weight = 3;
  const preview = (chat.preview || '').trim();
  if (preview) weight += Math.min(4, Math.ceil(preview.length / 36));
  if (firstImageUri(chat.messages)) weight += 4;
  return weight;
}

function flattenGroupedHistory(grouped: GroupedChatHistory): ChatConversation[] {
  const list = [...grouped.pinnedChats];
  for (const key of grouped.sortedKeys) {
    const month = grouped.groupedUnpinned.get(key);
    if (month) list.push(...month);
  }
  return list;
}

function splitIntoColumns(chats: ChatConversation[]): [ChatConversation[], ChatConversation[]] {
  const left: ChatConversation[] = [];
  const right: ChatConversation[] = [];
  let leftWeight = 0;
  let rightWeight = 0;
  for (const chat of chats) {
    const w = estimateCardWeight(chat);
    if (leftWeight <= rightWeight) {
      left.push(chat);
      leftWeight += w;
    } else {
      right.push(chat);
      rightWeight += w;
    }
  }
  return [left, right];
}

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
    const imageUri = firstImageUri(chat.messages);
    const preview = (chat.preview || '').trim();
    const dateLabel = formatRelativeChatLabel(chat.updatedAt || chat.createdAt);
    const previewLines = preview.length > 100 ? 5 : preview.length > 50 ? 4 : preview ? 3 : 0;

    if (isEditing) {
      return (
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: CARD_RADIUS,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            marginBottom: GAP,
            minHeight: 140,
          }}
        >
          <TextInput
            value={editingTitle}
            onChangeText={onEditingTitleChange}
            onBlur={onRenameSave}
            onSubmitEditing={onRenameSave}
            style={{
              color: theme.colors.text,
              fontSize: 16,
              fontWeight: '600',
              fontFamily: 'Poppins',
              padding: 0,
            }}
            autoFocus
            selectTextOnFocus
          />
        </View>
      );
    }

    return (
      <Pressable
        onPress={isMultiselectMode ? onToggleSelect : onPress}
        onLongPress={isMultiselectMode ? undefined : onLongPress}
        style={{
          backgroundColor: isCurrentChat ? theme.colors.secondary : theme.colors.card,
          borderRadius: CARD_RADIUS,
          borderWidth: 1,
          borderColor: isSelected
            ? theme.colors.primary
            : isCurrentChat
              ? theme.colors.border
              : theme.colors.borderLight,
          padding: 16,
          marginBottom: GAP,
          overflow: 'hidden',
          minHeight: imageUri ? 220 : 160,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: theme.colors.textTertiary,
              fontSize: 12,
              fontFamily: 'Poppins',
              fontWeight: '500',
              flex: 1,
            }}
            numberOfLines={1}
          >
            {dateLabel}
          </Text>
          {chat.pinned ? (
            <Ionicons
              name="bookmark"
              size={13}
              color={theme.colors.textTertiary}
              style={{ marginLeft: 4 }}
            />
          ) : null}
          {isMultiselectMode ? (
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                backgroundColor: isSelected ? theme.colors.primary : 'transparent',
                marginLeft: 6,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isSelected ? (
                <Ionicons name="checkmark" size={12} color={theme.colors.primaryText} />
              ) : null}
            </View>
          ) : null}
        </View>

        <Text
          style={{
            color: theme.colors.text,
            fontSize: 16,
            fontWeight: '600',
            fontFamily: 'Poppins',
            lineHeight: 22,
            marginBottom: preview || imageUri ? 10 : 0,
          }}
          numberOfLines={4}
          ellipsizeMode="tail"
        >
          {chat.title}
        </Text>

        {preview && !imageUri ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 13,
              fontFamily: 'Poppins',
              lineHeight: 19,
              flexGrow: 1,
            }}
            numberOfLines={previewLines || 3}
            ellipsizeMode="tail"
          >
            {preview}
          </Text>
        ) : null}

        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={{
              width: '100%',
              height: preview.length > 60 ? 120 : 148,
              borderRadius: 10,
              marginTop: preview ? 10 : 6,
              backgroundColor: theme.colors.surface,
            }}
            resizeMode="cover"
          />
        ) : null}

        {preview && imageUri ? (
          <Text
            style={{
              color: theme.colors.textSecondary,
              fontSize: 13,
              fontFamily: 'Poppins',
              lineHeight: 19,
              marginTop: 10,
            }}
            numberOfLines={3}
            ellipsizeMode="tail"
          >
            {preview}
          </Text>
        ) : null}

        {!preview && !imageUri ? <View style={{ flexGrow: 1, minHeight: 48 }} /> : null}
      </Pressable>
    );
  },
  (prevProps, nextProps) =>
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.chat.preview === nextProps.chat.preview &&
    prevProps.chat.pinned === nextProps.chat.pinned &&
    prevProps.chat.updatedAt === nextProps.chat.updatedAt &&
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
  topInset: number;
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
  menuItem4Opacity: Animated.Value;
  menuItem4Translate: Animated.Value;
  onDismissMenu: () => void;
  onRename: (chatId: string) => void;
  onPinToggle: (chatId: string) => void;
  onExportChat: (chatId: string) => void;
  onEnterMultiselect: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
};

export function HistoryDrawer({
  isPanelOpen,
  panelWidth,
  panelAnim,
  backdropOpacity,
  panelStyle,
  topInset,
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
  menuItem4Opacity,
  menuItem4Translate,
  onDismissMenu,
  onRename,
  onPinToggle,
  onExportChat,
  onEnterMultiselect,
  onDeleteChat,
}: HistoryDrawerProps) {
  const { theme } = useTheme();
  const screenWidth = Dimensions.get('window').width;
  const screenHeight = Dimensions.get('window').height;
  const [datePeriod, setDatePeriod] = useState<HistoryDatePeriod>('all');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const searchInputRef = useRef<TextInput>(null);
  const searchExpand = useRef(new Animated.Value(0)).current;
  const searchScrim = useRef(new Animated.Value(0)).current;
  const searchBottomAnim = useRef(
    new Animated.Value(Math.max(16, bottomInset) + BACK_ROW_H + 12),
  ).current;
  /** Invalidates animation completion callbacks after superseding work. */
  const searchAnimEpochRef = useRef(0);
  const mountedRef = useRef(true);
  const historySearchQueryRef = useRef(historySearchQuery);
  historySearchQueryRef.current = historySearchQuery;
  const blurCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const filterBackdropOpacity = useRef(new Animated.Value(0)).current;
  const filterMenuScale = useRef(new Animated.Value(0.92)).current;
  const filterItemAnims = useRef(
    HISTORY_DATE_PERIODS.map(() => ({
      opacity: new Animated.Value(0),
      translate: new Animated.Value(6),
    })),
  ).current;

  const chromeBottom = Math.max(16, bottomInset);
  const dockedSearchBottom = chromeBottom + BACK_ROW_H + 12;
  const searchExpandedWidth = Math.max(
    SEARCH_PILL_COLLAPSED_W,
    panelWidth - BOTTOM_CHROME_PAD_H * 2,
  );
  const searchExpandedRef = useRef(searchExpanded);
  searchExpandedRef.current = searchExpanded;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      searchAnimEpochRef.current += 1;
      if (blurCollapseTimerRef.current) {
        clearTimeout(blurCollapseTimerRef.current);
        blurCollapseTimerRef.current = null;
      }
      searchExpand.stopAnimation();
      searchScrim.stopAnimation();
      searchBottomAnim.stopAnimation();
    };
  }, [searchExpand, searchScrim, searchBottomAnim]);

  /**
   * True visual center of the panel/window. Does not subtract keyboard height —
   * window resize already changes `screenHeight` on some devices; stacking a
   * keyboard offset on top pushed the pill too high.
   */
  const screenCenterBottom = Math.max(
    dockedSearchBottom,
    screenHeight / 2 - SEARCH_PILL_H / 2,
  );

  /** Center while keyboard is open; rest above Back when it is not. */
  const targetSearchBottom = useCallback(
    (keyboardOpen: boolean, expanded: boolean) => {
      if (expanded && keyboardOpen) return screenCenterBottom;
      return dockedSearchBottom;
    },
    [screenCenterBottom, dockedSearchBottom],
  );

  const animateSearchBottom = useCallback(
    (keyboardOpen: boolean, expanded = searchExpandedRef.current) => {
      searchBottomAnim.stopAnimation();
      Animated.spring(searchBottomAnim, {
        toValue: targetSearchBottom(keyboardOpen, expanded),
        ...SEARCH_MOTION.spring,
      }).start();
    },
    [searchBottomAnim, targetSearchBottom],
  );

  const collapseSearch = useCallback(
    (clearQuery = false) => {
      if (blurCollapseTimerRef.current) {
        clearTimeout(blurCollapseTimerRef.current);
        blurCollapseTimerRef.current = null;
      }
      Keyboard.dismiss();
      if (clearQuery) onHistorySearchQueryChange('');

      const epoch = ++searchAnimEpochRef.current;
      searchExpand.stopAnimation();
      searchScrim.stopAnimation();
      searchBottomAnim.stopAnimation();

      Animated.parallel([
        Animated.timing(searchExpand, {
          toValue: 0,
          duration: SEARCH_MOTION.collapseMs,
          easing: SEARCH_MOTION.easeInOut,
          useNativeDriver: false,
        }),
        Animated.timing(searchScrim, {
          toValue: 0,
          duration: SEARCH_MOTION.scrimOutMs,
          easing: SEARCH_MOTION.easeIn,
          useNativeDriver: true,
        }),
        Animated.spring(searchBottomAnim, {
          toValue: dockedSearchBottom,
          ...SEARCH_MOTION.spring,
        }),
      ]).start(({ finished }) => {
        if (!finished || !mountedRef.current) return;
        if (epoch !== searchAnimEpochRef.current) return;
        setSearchExpanded(false);
        setKeyboardHeight(0);
      });
    },
    [
      searchExpand,
      searchScrim,
      searchBottomAnim,
      dockedSearchBottom,
      onHistorySearchQueryChange,
    ],
  );

  const expandSearch = useCallback(() => {
    if (blurCollapseTimerRef.current) {
      clearTimeout(blurCollapseTimerRef.current);
      blurCollapseTimerRef.current = null;
    }
    setSearchExpanded(true);
    const epoch = ++searchAnimEpochRef.current;
    searchExpand.stopAnimation();
    searchBottomAnim.stopAnimation();
    searchScrim.stopAnimation();

    // Expand width + lift to center together; focus immediately so keyboard
    // rises in parallel (no "grow then move" sequencing).
    Animated.parallel([
      Animated.timing(searchExpand, {
        toValue: 1,
        duration: SEARCH_MOTION.expandMs,
        easing: SEARCH_MOTION.easeOut,
        useNativeDriver: false,
      }),
      Animated.spring(searchBottomAnim, {
        toValue: screenCenterBottom,
        ...SEARCH_MOTION.spring,
      }),
      Animated.timing(searchScrim, {
        toValue: 1,
        duration: SEARCH_MOTION.scrimInMs,
        easing: SEARCH_MOTION.easeOut,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (!finished || !mountedRef.current) return;
      if (epoch !== searchAnimEpochRef.current) return;
    });

    // Kick keyboard + lift mid-animation; don't wait for expand to finish.
    requestAnimationFrame(() => {
      if (!mountedRef.current || epoch !== searchAnimEpochRef.current) return;
      searchInputRef.current?.focus();
    });
  }, [searchExpand, searchBottomAnim, searchScrim, screenCenterBottom]);

  /** Defer empty-blur collapse so clear/close buttons still receive the press. */
  const scheduleCollapseIfEmpty = useCallback(() => {
    if (blurCollapseTimerRef.current) {
      clearTimeout(blurCollapseTimerRef.current);
    }
    blurCollapseTimerRef.current = setTimeout(() => {
      blurCollapseTimerRef.current = null;
      if (!mountedRef.current) return;
      if (!historySearchQueryRef.current.trim()) {
        collapseSearch(false);
      }
    }, 80);
  }, [collapseSearch]);

  useEffect(() => {
    if (!isPanelOpen) return;

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const onShow = Keyboard.addListener(showEvent, (e) => {
      if (!mountedRef.current || !searchExpandedRef.current) return;
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
      animateSearchBottom(true, true);
      searchScrim.stopAnimation();
      Animated.timing(searchScrim, {
        toValue: 1,
        duration: SEARCH_MOTION.scrimInMs,
        easing: SEARCH_MOTION.easeOut,
        useNativeDriver: true,
      }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      if (!mountedRef.current) return;
      setKeyboardHeight(0);
      animateSearchBottom(false, searchExpandedRef.current);
      searchScrim.stopAnimation();
      Animated.timing(searchScrim, {
        toValue: 0,
        duration: SEARCH_MOTION.scrimOutMs,
        easing: SEARCH_MOTION.easeIn,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [isPanelOpen, animateSearchBottom, searchScrim]);

  // Only snap dock offset while collapsed — never race an active spring/lift.
  useEffect(() => {
    if (searchExpanded || keyboardHeight > 0) return;
    searchBottomAnim.setValue(dockedSearchBottom);
  }, [dockedSearchBottom, searchExpanded, keyboardHeight, searchBottomAnim]);

  const closeFilterMenu = useCallback(() => {
    Animated.parallel([
      Animated.timing(filterBackdropOpacity, {
        toValue: 0,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
      Animated.timing(filterMenuScale, {
        toValue: 0.92,
        duration: 80,
        easing: EASING.EASE_IN,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (mountedRef.current) setFilterMenuOpen(false);
    });
  }, [filterBackdropOpacity, filterMenuScale]);

  const openFilterMenu = useCallback(() => {
    setFilterMenuOpen(true);
    filterBackdropOpacity.setValue(0);
    filterMenuScale.setValue(0.92);
    filterItemAnims.forEach((item) => {
      item.opacity.setValue(0);
      item.translate.setValue(6);
    });

    const itemAnim = (opacity: Animated.Value, translate: Animated.Value, delay: number) =>
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
      Animated.timing(filterBackdropOpacity, {
        toValue: 1,
        duration: 80,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      }),
      Animated.spring(filterMenuScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 280,
        friction: 22,
        overshootClamping: true,
      }),
      ...filterItemAnims.map((item, i) => itemAnim(item.opacity, item.translate, 25 + i * 25)),
    ]).start();
  }, [filterBackdropOpacity, filterMenuScale, filterItemAnims]);

  useEffect(() => {
    if (isPanelOpen) return;

    searchAnimEpochRef.current += 1;
    if (blurCollapseTimerRef.current) {
      clearTimeout(blurCollapseTimerRef.current);
      blurCollapseTimerRef.current = null;
    }
    searchExpand.stopAnimation();
    searchScrim.stopAnimation();
    searchBottomAnim.stopAnimation();
    Keyboard.dismiss();

    setDatePeriod('all');
    setFilterMenuOpen(false);
    filterBackdropOpacity.setValue(0);
    filterMenuScale.setValue(0.92);
    searchExpand.setValue(0);
    searchScrim.setValue(0);
    searchBottomAnim.setValue(dockedSearchBottom);
    setSearchExpanded(false);
    setKeyboardHeight(0);
  }, [
    isPanelOpen,
    filterBackdropOpacity,
    filterMenuScale,
    searchExpand,
    searchScrim,
    searchBottomAnim,
    dockedSearchBottom,
  ]);

  // Active query keeps the docked full field (above Back) when reopening the panel.
  useEffect(() => {
    if (!isPanelOpen || !historySearchQuery.trim()) return;
    if (searchExpanded) return;
    setSearchExpanded(true);
    searchExpand.setValue(1);
    searchScrim.setValue(0);
    searchBottomAnim.setValue(dockedSearchBottom);
  }, [
    isPanelOpen,
    historySearchQuery,
    searchExpanded,
    searchExpand,
    searchScrim,
    searchBottomAnim,
    dockedSearchBottom,
  ]);

  const collageChats = useMemo(() => {
    if (!groupedChatHistory) return [];
    return filterChatsByDatePeriod(flattenGroupedHistory(groupedChatHistory), datePeriod);
  }, [groupedChatHistory, datePeriod]);

  const [leftColumn, rightColumn] = useMemo(
    () => splitIntoColumns(collageChats),
    [collageChats],
  );

  const indexById = useMemo(() => {
    const map = new Map<string, number>();
    collageChats.forEach((c, i) => map.set(c.id, i));
    return map;
  }, [collageChats]);

  const activePeriodLabel =
    HISTORY_DATE_PERIODS.find((p) => p.id === datePeriod)?.label ?? 'All time';
  const filterActive = datePeriod !== 'all';

  const searchWidth = searchExpand.interpolate({
    inputRange: [0, 1],
    outputRange: [SEARCH_PILL_COLLAPSED_W, searchExpandedWidth],
  });
  // Soft handoff: icon/label fades as field comes in mid-expand (tighter overlap).
  const searchFieldOpacity = searchExpand.interpolate({
    inputRange: [0, 0.2, 0.5, 1],
    outputRange: [0, 0, 0.9, 1],
  });
  const searchIconOnlyOpacity = searchExpand.interpolate({
    inputRange: [0, 0.15, 0.4, 1],
    outputRange: [1, 0.4, 0, 0],
  });
  // Minimal bloom — less scale so it feels tight, not floaty.
  const searchShellScale = searchExpand.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 1.01, 1],
  });

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

  const topRightPillStyle = {
    backgroundColor: theme.colors.transparent,
    borderRadius: 30,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden' as const,
    minWidth: FILTER_PILL_SIZE,
    minHeight: FILTER_PILL_SIZE,
    justifyContent: 'center' as const,
  };

  const selectedMenuChat = selectedMenuChatId
    ? chatHistory.find((c) => c.id === selectedMenuChatId)
    : null;
  const isPinned = selectedMenuChat?.pinned || false;

  const renderCard = (chat: ChatConversation) => (
    <StaggerFadeIn
      key={chat.id}
      index={indexById.get(chat.id) ?? 0}
      active={isPanelOpen && !isLoadingHistory}
    >
      <ChatHistoryCard
        chat={chat}
        currentChatId={currentChatId}
        theme={theme}
        onPress={() => (isMultiselectMode ? onToggleSelect(chat.id) : onChatPress(chat))}
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

  const emptyPeriodMessage =
    filterActive && groupedChatHistory
      ? `No chats from ${activePeriodLabel.toLowerCase()}`
      : historySearchQuery.trim()
        ? `No chats match "${historySearchQuery.trim()}"`
        : null;

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
                    ? Math.min(menuPosition.y + 10, screenHeight - 280)
                    : Math.max(50, menuPosition.y - 280),
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
                  onPress={() => onExportChat(selectedMenuChatId)}
                  style={menuBlockStyle}
                  activeOpacity={0.85}
                  accessibilityLabel="Export as Markdown"
                >
                  <FrostedGlass style={StyleSheet.absoluteFillObject} />
                  <Ionicons name="share-outline" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      marginLeft: 10,
                      fontSize: 14,
                      fontFamily: 'Poppins',
                    }}
                  >
                    Export
                  </Text>
                </TouchableOpacity>
              </Animated.View>
              <Animated.View
                style={{
                  opacity: menuItem3Opacity,
                  transform: [{ translateY: menuItem3Translate }],
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
                  opacity: menuItem4Opacity,
                  transform: [{ translateY: menuItem4Translate }],
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
            overflow: 'hidden',
          },
        ]}
        pointerEvents={isPanelOpen ? 'auto' : 'none'}
      >
        <FrostedGlass variant="panel" style={StyleSheet.absoluteFillObject} />

        {!isMultiselectMode && (
          <View
            style={{
              position: 'absolute',
              top: TOP_CHROME_TOP,
              right: 16,
              zIndex: 35,
            }}
          >
            <TouchableOpacity
              onPress={() => {
                if (filterMenuOpen) closeFilterMenu();
                else openFilterMenu();
              }}
              style={[
                topRightPillStyle,
                filterActive ? { backgroundColor: theme.colors.secondary } : null,
              ]}
              activeOpacity={0.85}
              accessibilityLabel={`Filter by date, ${activePeriodLabel}`}
            >
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <Ionicons
                name={filterActive ? 'options' : 'options-outline'}
                size={23}
                color={theme.colors.text}
              />
            </TouchableOpacity>
          </View>
        )}

        {filterMenuOpen && !isMultiselectMode && (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 30,
            }}
            pointerEvents="box-none"
          >
            <TouchableWithoutFeedback onPress={closeFilterMenu}>
              <Animated.View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(0, 0, 0, 0.4)',
                  opacity: filterBackdropOpacity,
                }}
              />
            </TouchableWithoutFeedback>
            <Animated.View
              style={{
                position: 'absolute',
                top: TOP_CHROME_TOP + FILTER_PILL_SIZE + 6,
                right: 16,
                minWidth: 168,
                opacity: filterBackdropOpacity,
                transform: [{ scale: filterMenuScale }],
              }}
            >
              {HISTORY_DATE_PERIODS.map((period, index) => {
                const selected = datePeriod === period.id;
                const itemAnim = filterItemAnims[index];
                return (
                  <Animated.View
                    key={period.id}
                    style={{
                      opacity: itemAnim.opacity,
                      transform: [{ translateY: itemAnim.translate }],
                      marginBottom: 8,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setDatePeriod(period.id);
                        closeFilterMenu();
                      }}
                      style={menuBlockStyle}
                      activeOpacity={0.85}
                    >
                      <FrostedGlass style={StyleSheet.absoluteFillObject} />
                      <Ionicons
                        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                        size={18}
                        color={selected ? theme.colors.text : theme.colors.textTertiary}
                      />
                      <Text
                        style={{
                          color: theme.colors.text,
                          marginLeft: 10,
                          fontSize: 14,
                          fontFamily: 'Poppins',
                          fontWeight: selected ? '600' : '400',
                        }}
                      >
                        {period.label}
                      </Text>
                    </TouchableOpacity>
                  </Animated.View>
                );
              })}
            </Animated.View>
          </View>
        )}

        <Animated.View
          style={{
            overflow: 'hidden',
            height: multiselectHeaderHeight.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 60 + Math.max(0, topInset)],
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
                  paddingTop: Math.max(12, topInset + 4),
                  paddingBottom: 12,
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
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            // Room for collapsed centered search + Back / New chat
            paddingBottom: chromeBottom + BACK_ROW_H + SEARCH_PILL_H + 28,
            paddingTop: isMultiselectMode ? 4 : TOP_CHROME_TOP,
          }}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews={false}
        >
          {!isMultiselectMode && filterActive && (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                marginBottom: 12,
                // Leave filter pill clear on the right
                paddingRight: FILTER_PILL_SIZE + 12,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.secondary,
                  borderRadius: 30,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 13,
                    fontFamily: 'Poppins',
                    fontWeight: '500',
                  }}
                >
                  {activePeriodLabel}
                </Text>
                <TouchableOpacity
                  onPress={() => setDatePeriod('all')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 8 }}
                  accessibilityLabel="Clear date filter"
                >
                  <Ionicons name="close" size={14} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {isLoadingHistory ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 16,
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
                  fontSize: 16,
                  fontFamily: 'Poppins',
                }}
              >
                No chats yet
              </Text>
              <Text
                style={{
                  color: theme.colors.textTertiary,
                  fontSize: 13,
                  marginTop: 8,
                  fontFamily: 'Poppins',
                  textAlign: 'center',
                }}
              >
                Start a conversation to see it here
              </Text>
            </View>
          ) : collageChats.length === 0 ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 15,
                  fontFamily: 'Poppins',
                  textAlign: 'center',
                }}
              >
                {emptyPeriodMessage || 'No chats found'}
              </Text>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {/* Left column shares filter Y baseline */}
              <View style={{ flex: 1, paddingRight: GAP / 2 }}>
                {leftColumn.map(renderCard)}
              </View>
              {/* Right column starts below filter — staggered vertical rhythm */}
              <View
                style={{
                  flex: 1,
                  paddingLeft: GAP / 2,
                  paddingTop: RIGHT_COLUMN_TOP_INSET,
                }}
              >
                {rightColumn.map(renderCard)}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Soft dim only while the keyboard is open. pointerEvents none so history stays tappable. */}
        {!isMultiselectMode && (
          <Animated.View
            pointerEvents="none"
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'rgba(0, 0, 0, 0.22)',
              opacity: searchScrim,
              zIndex: 26,
            }}
          />
        )}

        {/* Centered pill: docks above Back; lifts mid-screen only while keyboard is active */}
        {!isMultiselectMode && (
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: BOTTOM_CHROME_PAD_H,
              right: BOTTOM_CHROME_PAD_H,
              bottom: searchBottomAnim,
              alignItems: 'center',
              zIndex: 28,
            }}
          >
            <Animated.View
              style={{
                width: searchWidth,
                height: SEARCH_PILL_H,
                borderRadius: SEARCH_PILL_H / 2,
                borderWidth: 1,
                borderColor: theme.colors.border,
                overflow: 'hidden',
                justifyContent: 'center',
                alignSelf: 'center',
                transform: [{ scale: searchShellScale }],
              }}
            >
              <FrostedGlass style={StyleSheet.absoluteFillObject} />

              {/* Collapsed: search pill with icon + "Search" label */}
              <Animated.View
                pointerEvents={searchExpanded ? 'none' : 'auto'}
                style={{
                  ...StyleSheet.absoluteFillObject,
                  opacity: searchIconOnlyOpacity,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <TouchableOpacity
                  onPress={expandSearch}
                  style={{
                    flex: 1,
                    width: '100%',
                    height: SEARCH_PILL_H,
                    borderRadius: SEARCH_PILL_H / 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 14,
                  }}
                  activeOpacity={0.85}
                  accessibilityLabel="Search chats"
                >
                  <Ionicons
                    name="search-outline"
                    size={18}
                    color={theme.colors.text}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 15,
                      fontFamily: 'Poppins',
                      fontWeight: '500',
                    }}
                  >
                    Search
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              {/* Expanded: full capsule — keeps query when keyboard dismisses */}
              <Animated.View
                pointerEvents={searchExpanded ? 'auto' : 'none'}
                style={{
                  ...StyleSheet.absoluteFillObject,
                  opacity: searchFieldOpacity,
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 14,
                }}
              >
                <Ionicons
                  name="search-outline"
                  size={18}
                  color={theme.colors.textTertiary}
                  style={{ marginRight: 8 }}
                />
                <TextInput
                  ref={searchInputRef}
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
                    paddingVertical: 0,
                    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
                  }}
                  autoCorrect={false}
                  autoCapitalize="none"
                  clearButtonMode="while-editing"
                  returnKeyType="search"
                  blurOnSubmit
                  onSubmitEditing={() => Keyboard.dismiss()}
                  onBlur={scheduleCollapseIfEmpty}
                />
                {historySearchQuery.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      if (blurCollapseTimerRef.current) {
                        clearTimeout(blurCollapseTimerRef.current);
                        blurCollapseTimerRef.current = null;
                      }
                      onHistorySearchQueryChange('');
                      // Clear + keep field focused so keyboard can stay for a new term.
                      searchInputRef.current?.focus();
                    }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Clear search"
                  >
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={theme.colors.textTertiary}
                    />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => collapseSearch(false)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Close search"
                  >
                    <Ionicons name="close" size={18} color={theme.colors.textTertiary} />
                  </TouchableOpacity>
                )}
              </Animated.View>
            </Animated.View>
          </Animated.View>
        )}

        <View
          style={{
            position: 'absolute',
            bottom: chromeBottom,
            left: BOTTOM_CHROME_PAD_H,
            right: BOTTOM_CHROME_PAD_H,
            backgroundColor: 'transparent',
            zIndex: 25,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <TouchableOpacity
            onPress={onClose}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 30,
            }}
            activeOpacity={0.85}
            accessibilityLabel="Back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 20,
                fontFamily: 'Poppins',
                marginLeft: 8,
                marginBottom: 2,
              }}
            >
              Back
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              onNewChat();
              onClose();
            }}
            style={topRightPillStyle}
            activeOpacity={0.85}
            accessibilityLabel="New chat"
          >
            <FrostedGlass style={StyleSheet.absoluteFillObject} />
            <Ionicons name="add-outline" size={23} color={theme.colors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>
    </>
  );
}
