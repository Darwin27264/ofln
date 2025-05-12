// SettingsScreen.tsx
import React, { useRef, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Alert, Animated } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { styles } from "../styles/styles";
import RNFS from "react-native-fs";

interface Props {
  assistantDisplayMode: "bubble" | "direct";
  setAssistantDisplayMode: React.Dispatch<React.SetStateAction<"bubble" | "direct">>;
  onBackToConversation: () => void;
  onGoToModelSelection: () => void;
  onOpenStats: () => void; // NEW prop to open the stats (stages) page
}

export default function SettingsScreen({
  assistantDisplayMode,
  setAssistantDisplayMode,
  onBackToConversation,
  onGoToModelSelection,
  onOpenStats,
}: Props) {
  // For Chat Mode, "on" means bubble mode.
  const bubblesMode = assistantDisplayMode === "bubble";
  const toggleChatMode = () => {
    setAssistantDisplayMode(bubblesMode ? "direct" : "bubble");
  };

  // New dark mode state.
  const [darkMode, setDarkMode] = useState(false);
  const toggleDarkMode = () => {
    setDarkMode((prev) => !prev);
  };

  const showChatModeInfo = () => {
    Alert.alert(
      "Chat Mode",
      "When enabled, messages are shown in bubbles. When disabled, the assistant prints directly."
    );
  };

  // Animated value for Chat Mode block.
  const chatModeAnim = useRef(new Animated.Value(bubblesMode ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(chatModeAnim, {
      toValue: bubblesMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [assistantDisplayMode]);
  const chatModeBackground = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#EAEAEA", "#000000"],
  });
  const chatModeTextColor = chatModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#000000", "#FFFFFF"],
  });

  // Animated value for Dark Mode block.
  const darkModeAnim = useRef(new Animated.Value(darkMode ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(darkModeAnim, {
      toValue: darkMode ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  }, [darkMode]);
  const darkModeBackground = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#EAEAEA", "#000000"],
  });
  const darkModeTextColor = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["#000000", "#FFFFFF"],
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

  return (
    <View style={[styles.container, { padding: 20, flex: 1 }]}>
      <Text style={[styles.settingsTitle, { marginBottom: 40 }]}>Settings</Text>

      {/* Performance Block moved above the other options */}
      <TouchableOpacity onPress={onOpenStats}>
        <View style={performanceStyles.performanceBlock}>
          <Text style={performanceStyles.performanceBlockTitle}>Performance</Text>
          {usageStats ? (
            <View>
              <Text style={performanceStyles.performanceBlockDetail}>
                Total Inferences: {usageStats.totalInferences}
              </Text>
              <Text style={performanceStyles.performanceBlockDetail}>
                Avg. Inference Time: {usageStats.avgInferenceTime.toFixed(2)} ms
              </Text>
              <Text style={performanceStyles.performanceBlockDetail}>
                Avg. Tokens/Sec: {usageStats.avgTokensPerSecond.toFixed(2)}
              </Text>
              <Text style={performanceStyles.performanceBlockDetail}>
                Latest Performance: {usageStats.latestPerformance}
              </Text>
            </View>
          ) : (
            <Text style={performanceStyles.performanceBlockDetail}>
              No usage data available.
            </Text>
          )}
        </View>
      </TouchableOpacity>

      {/* Horizontal row block with Model Selection and Chat/Dark mode, with unified spacing */}
      <View style={{ flexDirection: "row", marginVertical: 5, height: 250 }}>
        {/* Left: Model Selection Block */}
        <TouchableOpacity
          style={{
            flex: 1,
            backgroundColor: "#EAEAEA",
            borderRadius: 30,
            justifyContent: "flex-end",
            alignItems: "flex-start",
            padding: 20,
            marginRight: 5,
          }}
          onPress={onGoToModelSelection}
        >
          {/* Bigger icon at top left */}
          <Ionicons
            name="grid-outline"
            size={32}
            color="#000000"
            style={{ position: "absolute", top: 115, left: 15 }}
          />
          {/* Bigger circular icon at bottom right */}
          <Ionicons
            name="arrow-forward-circle-outline"
            size={36}
            color="#000000"
            style={{ position: "absolute", bottom: 15, right: 15 }}
          />

          <View style={{ position: "absolute", bottom: 15, left: 15, right: 15 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "normal",
                textAlign: "left",
                lineHeight: 24,
              }}
            >
              Model{"\n"}Selection
            </Text>
          </View>
        </TouchableOpacity>

        {/* Right: Column with Chat Mode and Dark Mode blocks */}
        <View style={{ flex: 1, marginLeft: 5, justifyContent: "space-between" }}>
          {/* Chat Mode Block */}
          <TouchableOpacity style={{ flex: 1, marginBottom: 5 }} onPress={toggleChatMode}>
            <Animated.View
              style={{
                flex: 1,
                backgroundColor: chatModeBackground,
                borderRadius: 30,
                justifyContent: "flex-end",
                padding: 15,
              }}
            >
              {/* Smaller icon at top right */}
              <Ionicons
                name="chatbubble-outline"
                size={22}
                color={bubblesMode ? "#FFFFFF" : "#000000"}
                style={{ position: "absolute", top: 15, right: 15 }}
              />
              {/* Stacked text (one word per line) at bottom left */}
              <View style={{ position: "absolute", bottom: 15, left: 15 }}>
                <Animated.Text
                  style={{
                    fontSize: 20,
                    fontWeight: "normal",
                    textAlign: "left",
                    color: chatModeTextColor,
                    lineHeight: 24,
                  }}
                >
                  Chat{"\n"}Mode
                </Animated.Text>
              </View>
              {/* Info icon at bottom right */}
              <TouchableOpacity
                style={{ position: "absolute", bottom: 15, right: 15 }}
                onPress={showChatModeInfo}
              >
                <Ionicons
                  name="information-circle-outline"
                  size={20}
                  color={bubblesMode ? "#FFFFFF" : "#000000"}
                />
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>

          {/* Dark Mode Block */}
          <TouchableOpacity style={{ flex: 1, marginTop: 5 }} onPress={toggleDarkMode}>
            <Animated.View
              style={{
                flex: 1,
                backgroundColor: darkModeBackground,
                borderRadius: 30,
                justifyContent: "flex-end",
                padding: 15,
              }}
            >
              {/* Smaller icon at top right */}
              <Ionicons
                name="moon-outline"
                size={22}
                color={darkMode ? "#FFFFFF" : "#000000"}
                style={{ position: "absolute", top: 15, right: 15 }}
              />
              {/* Stacked text at bottom left */}
              <View style={{ position: "absolute", bottom: 15, left: 15 }}>
                <Animated.Text
                  style={{
                    fontSize: 20,
                    fontWeight: "normal",
                    textAlign: "left",
                    color: darkModeTextColor,
                    lineHeight: 24,
                  }}
                >
                  Dark{"\n"}Mode
                </Animated.Text>
              </View>
              {/* "On"/"Off" at bottom right */}
              <Animated.Text
                style={{
                  position: "absolute",
                  bottom: 15,
                  right: 15,
                  fontSize: 16,
                  fontWeight: "normal",
                  color: darkModeTextColor,
                }}
              >
                {darkMode ? "On" : "Off"}
              </Animated.Text>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ position: "absolute", bottom: 20, left: 15 }}>
        <TouchableOpacity
          onPress={onBackToConversation}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#000000",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 30,
          }}
        >
          <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 20,
              fontFamily: "Poppins",
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const performanceStyles = {
  performanceBlock: {
    backgroundColor: "#EAEAEA",
    borderRadius: 30,
    padding: 15,
    marginVertical: 5, // vertical spacing for the performance block itself
  },
  performanceBlockTitle: {
    fontSize: 20,
    fontWeight: "normal",
    textAlign: "left",
    color: "#000000",
    lineHeight: 24,
    marginBottom: 8,
  },
  performanceBlockDetail: {
    fontSize: 16,
    textAlign: "left",
    color: "#000000",
    marginBottom: 4,
  },
};
