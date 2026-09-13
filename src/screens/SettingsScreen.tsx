// SettingsScreen.tsx
import React, { useRef, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  ScrollView,
  StyleProp,
  ViewStyle,
  TextStyle,
  StyleSheet,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { BottomSheet } from "../components/BottomSheet";
import { FrostedGlass, FrostedPanel, SETTINGS_BLOCK } from "../components/FrostedGlass";
import {
  FloatingBackButton,
  FloatingIconButton,
} from "../components/FloatingBackButton";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import { EASING } from "../utils/animationConfig";
import { getPersonas } from "../services/personaService";
import { getPerspectivePresets } from "../services/perspectiveService";
import { countEnabledTasks } from "../services/taskService";
import {
  loadUsageRecords,
  computeUsageAverages,
  type PerformanceLevel,
} from "../services/performanceTracking";
import {
  listStoredGgufModels,
} from "../services/modelStorageService";
import { sumStoredModelBytes } from "../utils/modelStorageHelpers";
import { formatBytesShort } from "../utils/diskPreflight";
import { chatHistoryService } from "../services/chatHistoryService";
import {
  CHAT_FONT_SIZES,
  DEFAULT_CHAT_FONT_SIZE,
  type ChatFontSize,
} from "../utils/chatFontSize";

interface Props {
  assistantDisplayMode: "bubble" | "direct";
  setAssistantDisplayMode: React.Dispatch<React.SetStateAction<"bubble" | "direct">>;
  chatFontSize: ChatFontSize;
  setChatFontSize: React.Dispatch<React.SetStateAction<ChatFontSize>>;
  downloadedModels: string[];
  onBackToConversation: () => void;
  onGoToModelSelection: () => void;
  onOpenStats: () => void;
  onGoToPersonas: () => void;
  onGoToPerspectives: () => void;
  onGoToTasks: () => void;
  onGoToInfo: () => void;
  onGoToDiagnostics: () => void;
  onGoToStorage: () => void;
}

/** Grid tiles: slightly larger buttons, tighter gutters (same overall footprint). */
const SETTINGS_TILE_HEIGHT = 130;
const SETTINGS_TILE_GAP = SETTINGS_BLOCK.gap;
const SETTINGS_TILE_GUTTER = SETTINGS_BLOCK.gutter;

type SettingsTileProps = {
  styles: ReturnType<typeof createStyles>;
  icon: string;
  label: string;
  stat?: string | null;
  onPress: () => void;
  touchStyle?: StyleProp<ViewStyle>;
  /** Optional solid wash on top of frost (e.g. quick-settings On state). */
  overlayColor?: string | Animated.AnimatedInterpolation<string | number>;
  iconColor: string;
  labelColor?: string | Animated.AnimatedInterpolation<string | number>;
  iconCircleBg: string;
  badgeBg: string;
  badgeTextColor: string;
  info?: {
    onPress: () => void;
    color: string;
  };
};

function SettingsTile({
  styles,
  icon,
  label,
  stat,
  onPress,
  touchStyle,
  overlayColor,
  iconColor,
  labelColor,
  iconCircleBg,
  badgeBg,
  badgeTextColor,
  info,
}: SettingsTileProps) {
  const { isDark } = useTheme();
  const showStat = typeof stat === "string" && stat.length > 0;

  return (
    <TouchableOpacity style={touchStyle} onPress={onPress} activeOpacity={0.85}>
      <Animated.View style={styles.settingsBlock}>
        <FrostedGlass
          style={StyleSheet.absoluteFillObject}
          blurAmount={SETTINGS_BLOCK.blurAmount}
          // Light: soft white frost (readable). Dark: deeper shaded glass.
          tintOpacity={isDark ? SETTINGS_BLOCK.tintDark : SETTINGS_BLOCK.tintLight}
        />
        {overlayColor != null ? (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFillObject, { backgroundColor: overlayColor as any }]}
          />
        ) : null}
        <View style={[styles.blockIconCircle, { backgroundColor: iconCircleBg }]}>
          <Ionicons name={icon as any} size={18} color={iconColor} />
        </View>
        {showStat ? (
          <View style={[styles.blockStatBadge, { backgroundColor: badgeBg }]}>
            <Text
              style={[styles.blockStatText, { color: badgeTextColor }]}
              numberOfLines={1}
            >
              {stat}
            </Text>
          </View>
        ) : null}
        <View style={styles.blockTextContainer}>
          {typeof labelColor === "string" || labelColor == null ? (
            <Text style={[styles.blockText, labelColor ? { color: labelColor } : null]}>
              {label}
            </Text>
          ) : (
            <Animated.Text style={[styles.blockText, { color: labelColor } as TextStyle]}>
              {label}
            </Animated.Text>
          )}
        </View>
        {info ? (
          <TouchableOpacity
            style={styles.blockInfoIcon}
            onPress={info.onPress}
            activeOpacity={0.85}
            accessibilityLabel="Chat mode info"
            accessibilityHint="Explains bubble vs transcript display"
          >
            <Ionicons name="information-circle-outline" size={19} color={info.color} />
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function SettingsScreen({
  assistantDisplayMode,
  setAssistantDisplayMode,
  chatFontSize,
  setChatFontSize,
  downloadedModels,
  onBackToConversation,
  onGoToModelSelection,
  onOpenStats,
  onGoToPersonas,
  onGoToPerspectives,
  onGoToTasks,
  onGoToInfo,
  onGoToDiagnostics,
  onGoToStorage,
}: Props) {
  const { theme, toggleTheme, isDark, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();
  /** Quick-settings chip sits above Back; clear both when scrolling. */
  const contentPadBottom = Math.max(scrollPadBottom, 92 + 32 + 16);
  const [chatModeInfoOpen, setChatModeInfoOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);

  const [perfLevel, setPerfLevel] = useState<PerformanceLevel | null>(null);
  const [personaCount, setPersonaCount] = useState<number | null>(null);
  const [perspectiveCount, setPerspectiveCount] = useState<number | null>(null);
  const [tasksActiveCount, setTasksActiveCount] = useState<number | null>(null);
  const [storageUsedLabel, setStorageUsedLabel] = useState<string | null>(null);
  const [storageChatCount, setStorageChatCount] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const records = await loadUsageRecords();
      const averages = computeUsageAverages(records);
      setPerfLevel(averages?.performanceLevel ?? null);
    } catch {
      setPerfLevel(null);
    }

    try {
      const personas = await getPersonas();
      setPersonaCount(personas.length);
    } catch {
      setPersonaCount(null);
    }

    try {
      const presets = await getPerspectivePresets();
      setPerspectiveCount(presets.length);
    } catch {
      setPerspectiveCount(null);
    }

    try {
      const n = await countEnabledTasks();
      setTasksActiveCount(n);
    } catch {
      setTasksActiveCount(null);
    }

    try {
      const [models, chats] = await Promise.all([
        listStoredGgufModels(),
        chatHistoryService.getAllChats(),
      ]);
      const bytes = sumStoredModelBytes(models);
      setStorageUsedLabel(bytes > 0 ? formatBytesShort(bytes) : null);
      setStorageChatCount(chats.length);
    } catch {
      setStorageUsedLabel(null);
      setStorageChatCount(null);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // For Chat Mode, "on" means bubble mode.
  const bubblesMode = assistantDisplayMode === "bubble";
  const toggleChatMode = () => {
    setAssistantDisplayMode(bubblesMode ? "direct" : "bubble");
  };

  // Color interpolation cannot use the native driver.
  const TOGGLE_ANIMATION_CONFIG = {
    duration: 250,
    easing: EASING.STANDARD,
    useNativeDriver: false,
  };

  const chatModeAnim = useRef(new Animated.Value(bubblesMode ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chatModeAnim, {
      toValue: bubblesMode ? 1 : 0,
      ...TOGGLE_ANIMATION_CONFIG,
    }).start();
  }, [assistantDisplayMode, chatModeAnim]);
  const chatModeBackground = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", theme.colors.primary],
  });
  const chatModeTextColor = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.text, theme.colors.primaryText],
  });

  const darkModeAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(darkModeAnim, {
      toValue: isDark ? 1 : 0,
      ...TOGGLE_ANIMATION_CONFIG,
    }).start();
  }, [isDark, darkModeAnim]);
  const darkModeBackground = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["transparent", theme.colors.primary],
  });
  const darkModeTextColor = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.text, theme.colors.primaryText],
  });

  const mutedBadgeBg = isDark
    ? "rgba(255, 255, 255, 0.14)"
    : "rgba(0, 0, 0, 0.12)";
  const mutedBadgeText = isDark
    ? theme.colors.textSecondary
    : theme.colors.text;
  const onBadgeBg = isDark
    ? "rgba(0, 0, 0, 0.18)"
    : "rgba(255, 255, 255, 0.22)";
  const iconCircleDefault = theme.colors.card;
  const iconCircleOn = isDark
    ? "rgba(0, 0, 0, 0.25)"
    : "rgba(255, 255, 255, 0.92)";

  const modelsStat = String(downloadedModels.length);
  const personasStat =
    personaCount != null && personaCount > 0 ? String(personaCount) : null;
  const perspectivesStat =
    perspectiveCount != null && perspectiveCount > 0
      ? String(perspectiveCount)
      : null;
  const tasksStat =
    tasksActiveCount != null && tasksActiveCount > 0
      ? String(tasksActiveCount)
      : null;

  const perfStatColor =
    perfLevel === "High"
      ? theme.colors.success
      : perfLevel === "Medium"
        ? theme.colors.warning
        : perfLevel === "Low" || perfLevel === "Very Low"
          ? theme.colors.error
          : mutedBadgeText;
  const perfBadgeBg =
    perfLevel == null
      ? mutedBadgeBg
      : perfLevel === "High"
        ? "rgba(52, 199, 89, 0.18)"
        : perfLevel === "Medium"
          ? "rgba(255, 159, 10, 0.18)"
          : "rgba(255, 69, 58, 0.18)";

  return (
    <Animated.View
      style={[
        styles.container,
        {
          padding: 20,
          flex: 1,
          backgroundColor: theme.colors.background,
          opacity: isTransitioning ? 0.95 : 1,
        },
      ]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: contentPadBottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.settingsTitle}>Settings</Text>
        <View style={{ marginBottom: 0 }}>
          <View
            style={{
              flexDirection: "row",
              marginBottom: SETTINGS_TILE_GAP,
              height: SETTINGS_TILE_HEIGHT,
            }}
          >
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginRight: SETTINGS_TILE_GUTTER }}
              icon="speedometer-outline"
              label="Performance"
              stat={perfLevel}
              onPress={onOpenStats}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={perfBadgeBg}
              badgeTextColor={perfStatColor}
            />
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginLeft: SETTINGS_TILE_GUTTER }}
              icon="cube-outline"
              label="Models"
              stat={modelsStat}
              onPress={onGoToModelSelection}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={mutedBadgeBg}
              badgeTextColor={mutedBadgeText}
            />
          </View>
          <View style={{ flexDirection: "row", height: SETTINGS_TILE_HEIGHT }}>
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginRight: SETTINGS_TILE_GUTTER }}
              icon="pulse-outline"
              label="Diagnostics"
              onPress={onGoToDiagnostics}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={mutedBadgeBg}
              badgeTextColor={mutedBadgeText}
            />
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginLeft: SETTINGS_TILE_GUTTER }}
              icon="person-circle-outline"
              label="Personas"
              stat={personasStat}
              onPress={onGoToPersonas}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={mutedBadgeBg}
              badgeTextColor={mutedBadgeText}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              height: SETTINGS_TILE_HEIGHT,
              marginTop: SETTINGS_TILE_GAP,
            }}
          >
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginRight: SETTINGS_TILE_GUTTER }}
              icon="alarm-outline"
              label="Tasks"
              stat={tasksStat}
              onPress={onGoToTasks}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={mutedBadgeBg}
              badgeTextColor={mutedBadgeText}
            />
            <SettingsTile
              styles={styles}
              touchStyle={{ flex: 1, marginLeft: SETTINGS_TILE_GUTTER }}
              icon="git-compare-outline"
              label="Perspective"
              stat={perspectivesStat}
              onPress={onGoToPerspectives}
              iconColor={theme.colors.text}
              iconCircleBg={iconCircleDefault}
              badgeBg={mutedBadgeBg}
              badgeTextColor={mutedBadgeText}
            />
          </View>
          <View style={{ height: SETTINGS_TILE_HEIGHT, marginTop: SETTINGS_TILE_GAP }}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={onGoToStorage}
              activeOpacity={0.85}
            >
              <View style={styles.settingsBlock}>
                <FrostedGlass
                  style={StyleSheet.absoluteFillObject}
                  blurAmount={SETTINGS_BLOCK.blurAmount}
                  tintOpacity={isDark ? SETTINGS_BLOCK.tintDark : SETTINGS_BLOCK.tintLight}
                />
                <View
                  style={[
                    styles.blockIconCircle,
                    { backgroundColor: iconCircleDefault },
                  ]}
                >
                  <Ionicons
                    name="folder-outline"
                    size={18}
                    color={theme.colors.text}
                  />
                </View>
                <View
                  style={{
                    position: "absolute",
                    top: 14,
                    right: 14,
                    alignItems: "flex-end",
                    gap: 6,
                  }}
                >
                  {storageUsedLabel ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        backgroundColor: mutedBadgeBg,
                      }}
                    >
                      <Text
                        style={[
                          styles.blockStatText,
                          { color: mutedBadgeText },
                        ]}
                      >
                        {storageUsedLabel} used
                      </Text>
                    </View>
                  ) : null}
                  {storageChatCount != null ? (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 5,
                        borderRadius: 20,
                        backgroundColor: mutedBadgeBg,
                      }}
                    >
                      <Text
                        style={[
                          styles.blockStatText,
                          { color: mutedBadgeText },
                        ]}
                      >
                        {storageChatCount} conversation
                        {storageChatCount === 1 ? "" : "s"}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.blockTextContainer}>
                  <Text style={styles.blockText}>Storage</Text>
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 92,
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          onPress={() => setQuickSettingsOpen(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Quick settings"
          accessibilityHint="Opens chat mode and dark mode controls"
          style={{
            width: 52,
            height: 32,
            borderRadius: 16,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FrostedGlass
            style={StyleSheet.absoluteFillObject}
            blurAmount={14}
            tintOpacity={isDark ? 0.58 : 0.5}
          />
          <Ionicons
            name="options-outline"
            size={20}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View
        style={{
          position: "absolute",
          bottom: backBottom,
          left: 15,
          right: 15,
          backgroundColor: "transparent",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <FloatingBackButton onPress={onBackToConversation} />
        <FloatingIconButton
          icon="information"
          onPress={onGoToInfo}
          accessibilityLabel="About"
          accessibilityHint="Opens about the app and how-to tips"
        />
      </View>

      <BottomSheet
        visible={quickSettingsOpen}
        onClose={() => setQuickSettingsOpen(false)}
        title="Quick settings"
        subtitle="Display preferences"
        fitContent
      >
        <View
          style={{
            flexDirection: "row",
            height: SETTINGS_TILE_HEIGHT,
            justifyContent: "space-between",
          }}
        >
          <SettingsTile
            styles={styles}
            touchStyle={{ flex: 1, marginRight: SETTINGS_TILE_GUTTER }}
            icon="chatbubble-outline"
            label={"Chat\nMode"}
            stat={bubblesMode ? "On" : "Off"}
            onPress={toggleChatMode}
            overlayColor={chatModeBackground}
            iconColor={bubblesMode ? theme.colors.primaryText : theme.colors.text}
            labelColor={chatModeTextColor}
            iconCircleBg={bubblesMode ? iconCircleOn : iconCircleDefault}
            badgeBg={bubblesMode ? onBadgeBg : mutedBadgeBg}
            badgeTextColor={
              bubblesMode ? theme.colors.primaryText : mutedBadgeText
            }
            info={{
              onPress: () => setChatModeInfoOpen(true),
              color: bubblesMode ? theme.colors.primaryText : theme.colors.text,
            }}
          />
          <SettingsTile
            styles={styles}
            touchStyle={{ flex: 1, marginLeft: SETTINGS_TILE_GUTTER }}
            icon={isDark ? "moon" : "moon-outline"}
            label={"Dark\nMode"}
            stat={isDark ? "On" : "Off"}
            onPress={toggleTheme}
            overlayColor={darkModeBackground}
            iconColor={isDark ? theme.colors.primaryText : theme.colors.text}
            labelColor={darkModeTextColor}
            iconCircleBg={isDark ? iconCircleOn : iconCircleDefault}
            badgeBg={isDark ? onBadgeBg : mutedBadgeBg}
            badgeTextColor={
              isDark ? theme.colors.primaryText : mutedBadgeText
            }
          />
        </View>

        <View
          style={[
            styles.settingsBlock,
            {
              height: SETTINGS_TILE_HEIGHT,
              marginTop: SETTINGS_TILE_GAP,
              flex: 0,
            },
          ]}
        >
          <FrostedGlass
            style={StyleSheet.absoluteFillObject}
            blurAmount={SETTINGS_BLOCK.blurAmount}
            tintOpacity={isDark ? SETTINGS_BLOCK.tintDark : SETTINGS_BLOCK.tintLight}
          />
          <View style={[styles.blockIconCircle, { backgroundColor: iconCircleDefault }]}>
            <Ionicons name="text-outline" size={18} color={theme.colors.text} />
          </View>
          <View
            style={{
              position: "absolute",
              top: 14,
              right: 14,
              left: 62,
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 6,
            }}
          >
            {CHAT_FONT_SIZES.map((size) => {
              const selected = chatFontSize === size;
              return (
                <TouchableOpacity
                  key={size}
                  onPress={() => setChatFontSize(size)}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`Font size ${size}`}
                  style={{
                    minWidth: 40,
                    height: 36,
                    borderRadius: 18,
                    paddingHorizontal: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected
                      ? theme.colors.primary
                      : mutedBadgeBg,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Poppins",
                      fontWeight: "600",
                      fontSize: Math.min(16, size),
                      color: selected
                        ? theme.colors.primaryText
                        : theme.colors.textSecondary,
                    }}
                  >
                    {size}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.blockTextContainer}>
            <Text style={styles.blockText}>{"Font\nSize"}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setChatFontSize(DEFAULT_CHAT_FONT_SIZE)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Reset font size to default"
            disabled={chatFontSize === DEFAULT_CHAT_FONT_SIZE}
            style={{
              position: "absolute",
              bottom: 15,
              right: 14,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: mutedBadgeBg,
              opacity: chatFontSize === DEFAULT_CHAT_FONT_SIZE ? 0.45 : 1,
            }}
          >
            <Text
              style={{
                fontFamily: "Poppins",
                fontSize: 13,
                fontWeight: "500",
                color: theme.colors.textSecondary,
              }}
            >
              Default
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <BottomSheet
        visible={chatModeInfoOpen}
        onClose={() => setChatModeInfoOpen(false)}
        title="Chat Mode"
        subtitle="Display preference"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
          }}
        >
          On: replies in chat bubbles.{"\n"}
          Off: continuous transcript style.{"\n\n"}
          Display only — does not change the model.
        </Text>
      </BottomSheet>
    </Animated.View>
  );
}
