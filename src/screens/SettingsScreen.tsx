// SettingsScreen.tsx
import React, { useRef, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Pressable, Animated, Easing, Platform } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import RNFS from "react-native-fs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showAlert } from "../components/CustomAlert";
import { readErrorLog, getErrorLogPath, clearErrorLog } from "../utils/errorLogger";

interface Props {
  assistantDisplayMode: "bubble" | "direct";
  setAssistantDisplayMode: React.Dispatch<React.SetStateAction<"bubble" | "direct">>;
  onBackToConversation: () => void;
  onGoToModelSelection: () => void;
  onOpenStats: () => void;
  onGoToPersonas: () => void;
  onGoToInfo: () => void;
  /** DEV-only: open diagnostics (long-press on Settings title) */
  onOpenDiagnostics?: () => void;
}

export default function SettingsScreen({
  assistantDisplayMode,
  setAssistantDisplayMode,
  onBackToConversation,
  onGoToModelSelection,
  onOpenStats,
  onGoToPersonas,
  onGoToInfo,
  onOpenDiagnostics,
}: Props) {
  const { theme, toggleTheme, isDark, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);

  // For Chat Mode, "on" means bubble mode.
  const bubblesMode = assistantDisplayMode === "bubble";
  const toggleChatMode = () => {
    setAssistantDisplayMode(bubblesMode ? "direct" : "bubble");
  };

  const showChatModeInfo = () => {
    showAlert(
      "Chat Mode",
      "When enabled, messages are shown in bubbles. When disabled, the assistant prints directly.",
      [{ text: "OK" }]
    );
  };

  /**
   * Animation configuration for settings toggles
   * Optimized for mobile with native driver where possible
   */
  const TOGGLE_ANIMATION_CONFIG = {
    duration: 250, // Reduced from 300ms for snappier feel
    easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design easing
    useNativeDriver: false, // Color animations can't use native driver
  };

  /**
   * Animated value for Chat Mode toggle
   * Animates background color and text color transitions
   */
  const chatModeAnim = useRef(new Animated.Value(bubblesMode ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chatModeAnim, {
      toValue: bubblesMode ? 1 : 0,
      ...TOGGLE_ANIMATION_CONFIG,
    }).start();
  }, [assistantDisplayMode, chatModeAnim]);
  const chatModeBackground = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.secondary, theme.colors.primary],
  });
  const chatModeTextColor = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.text, theme.colors.primaryText],
  });

  /**
   * Animated value for Dark Mode toggle
   * Animates background color and text color transitions
   */
  const darkModeAnim = useRef(new Animated.Value(isDark ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(darkModeAnim, {
      toValue: isDark ? 1 : 0,
      ...TOGGLE_ANIMATION_CONFIG,
    }).start();
  }, [isDark, darkModeAnim]);
  const darkModeBackground = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.secondary, theme.colors.primary],
  });
  const darkModeTextColor = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.text, theme.colors.primaryText],
  });

  // Define the type for usage stats
  interface UsageStats {
    totalInferences: number;
    avgInferenceTime: number;
    avgTokensPerSecond: number;
    latestPerformance: string;
  }
  
  // State for aggregated usage stats (loaded from RNFS)
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [accelEnabled, setAccelEnabled] = useState<boolean>(false);

  const ACCEL_SETTING_KEY = "@runtime_accel_enabled";

  useEffect(() => {
    const loadUsageData = async () => {
      try {
        const filePath = `${RNFS.DocumentDirectoryPath}/usage_log.json`;
        const exists = await RNFS.exists(filePath);
        if (exists) {
          const contents = await RNFS.readFile(filePath, "utf8");
          const lines = contents.split("\n").filter((line) => line.trim().length > 0);
          const records = lines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch (error) {
                return null;
              }
            })
            .filter((record) => record !== null);
          if (records.length > 0) {
            const totalInferences = records.length;
            const avgInferenceTime =
              records.reduce((sum: number, record: any) => sum + record.inferenceTime, 0) /
              totalInferences;
            const avgTokensPerSecond =
              records.reduce((sum: number, record: any) => sum + record.tokensPerSecond, 0) /
              totalInferences;
            const latestPerformance = records[records.length - 1].performanceLevel;
            setUsageStats({
              totalInferences,
              avgInferenceTime,
              avgTokensPerSecond,
              latestPerformance,
            });
          }
        }
      } catch (error) {
        console.error("Error reading usage data:", error);
      }
    };
    loadUsageData();
  }, []);

  useEffect(() => {
    const loadAccelSetting = async () => {
      try {
        const stored = await AsyncStorage.getItem(ACCEL_SETTING_KEY);
        if (stored !== null) {
          setAccelEnabled(stored === "true");
        } else {
          // Default: experimental acceleration OFF
          setAccelEnabled(false);
        }
      } catch (error) {
        console.error("Error loading acceleration setting:", error);
      }
    };
    if (Platform.OS === "android") {
      loadAccelSetting();
    }
  }, []);

  const toggleAccel = async () => {
    if (Platform.OS !== "android") return;
    try {
      const next = !accelEnabled;
      setAccelEnabled(next);
      await AsyncStorage.setItem(ACCEL_SETTING_KEY, next ? "true" : "false");
    } catch (error) {
      console.error("Error saving acceleration setting:", error);
    }
  };

  return (
    <Animated.View 
      style={[
        styles.container, 
        { 
          padding: 20, 
          flex: 1, 
          backgroundColor: theme.colors.background,
          opacity: isTransitioning ? 0.95 : 1,
        }
      ]}
    >
      {__DEV__ && onOpenDiagnostics ? (
        <Pressable
          onLongPress={onOpenDiagnostics}
          delayLongPress={600}
          style={{ marginBottom: 40 }}
        >
          <Text style={[styles.settingsTitle]}>Settings</Text>
        </Pressable>
      ) : (
        <Text style={[styles.settingsTitle, { marginBottom: 40 }]}>Settings</Text>
      )}
      <View style={{ marginBottom: 15 }}>
        <View style={{ flexDirection: "row", marginBottom: 10, height: 145 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={onOpenStats}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="speedometer-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Performance</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToModelSelection}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="grid-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Models</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", height: 145 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={() => {}} activeOpacity={1}>
            <Animated.View style={[styles.settingsBlock, { opacity: 0.7 }]}>
              <Ionicons name="key-outline" size={20} color={theme.colors.textSecondary} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={[styles.blockText, { color: theme.colors.textSecondary }]}>API</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToPersonas}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="person-circle-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Personas</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{height: 2.5, backgroundColor: theme.colors.border, marginVertical: 12, width: '30%', alignSelf: 'center'}}/>
      <View style={{ flexDirection: "row", height: 120, justifyContent: "space-between" }}>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleChatMode}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: chatModeBackground }]}>
            <Ionicons name="chatbubble-outline" size={21} color={bubblesMode ? theme.colors.primaryText : theme.colors.text} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: chatModeTextColor }]}>Chat Mode</Animated.Text>
            </View>
            <TouchableOpacity style={styles.blockInfoIcon} onPress={showChatModeInfo}>
              <Ionicons name="information-circle-outline" size={19} color={bubblesMode ? theme.colors.primaryText : theme.colors.text}/>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleTheme}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: darkModeBackground }]}>
            <Ionicons name={isDark ? "moon" : "moon-outline"} size={21} color={isDark ? theme.colors.primaryText : theme.colors.text} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: darkModeTextColor }]}>Dark Mode</Animated.Text>
            </View>
            <Animated.Text style={[styles.blockToggleText, { color: darkModeTextColor }]}>{isDark ? "On" : "Off"}</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
      {Platform.OS === "android" && (
        <View style={{ marginTop: 16 }}>
          <TouchableOpacity
            onPress={toggleAccel}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              paddingHorizontal: 16,
              paddingVertical: 14,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 4,
                }}
              >
                Experimental acceleration (GPU/OpenCL)
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                }}
              >
                May improve speed on some Android devices; can cause model load failures. Off by default.
              </Text>
            </View>
            <View
              style={{
                width: 50,
                height: 30,
                borderRadius: 15,
                backgroundColor: accelEnabled ? theme.colors.primary : theme.colors.border,
                justifyContent: "center",
                paddingHorizontal: 4,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  backgroundColor: theme.colors.background,
                  alignSelf: accelEnabled ? "flex-end" : "flex-start",
                }}
              />
            </View>
          </TouchableOpacity>
        </View>
      )}
      <View style={{ position: "absolute", bottom: 20, left: 15, right: 15, backgroundColor: "transparent", flexDirection: "row", justifyContent: "space-between" }}>
        <TouchableOpacity onPress={onBackToConversation} style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: theme.colors.primary,
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 30,
        }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText}/>
          <Text style={{
            color: theme.colors.primaryText,
            fontSize: 20,
            fontFamily: "Poppins",
            marginLeft: 8,
            marginBottom: 2,
          }}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onGoToInfo} style={{
          backgroundColor: theme.colors.primary,
          borderRadius: 30,
          paddingHorizontal: 12,
          paddingVertical: 8,
          alignItems: "center",
          justifyContent: "center",
        }}>
          <Ionicons name="information" size={24} color={theme.colors.primaryText} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// Performance styles moved to StagesScreen where the detailed stats are shown
