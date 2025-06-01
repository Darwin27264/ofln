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
      <View style={{ marginBottom: 15 }}>
        <View style={{ flexDirection: "row", marginBottom: 10, height: 145 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={onOpenStats}>
            <View style={styles.settingsBlock}>
              <Ionicons name="speedometer-outline" size={22} color="#000000" style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Performance</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToModelSelection}>
            <View style={styles.settingsBlock}>
              <Ionicons name="grid-outline" size={22} color="#000000" style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Models</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", height: 145 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }}>
            <View style={styles.settingsBlock}>
              <Ionicons name="code-slash-outline" size={22} color="#000000" style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>CodeLib</Text>
              </View>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }}>
            <View style={styles.settingsBlock}>
              <Ionicons name="person-circle-outline" size={22} color="#000000" style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Personas</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{height: 2.5, backgroundColor: '#DDDDDD', marginVertical: 12, width: '30%', alignSelf: 'center'}}/>
      <View style={{ flexDirection: "row", height: 120, justifyContent: "space-between" }}>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleChatMode}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: chatModeBackground }]}>
            <Ionicons name="chatbubble-outline" size={22} color={bubblesMode ? "#FFFFFF" : "#000000"} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: chatModeTextColor }]}>Chat Mode</Animated.Text>
            </View>
            <TouchableOpacity style={styles.blockInfoIcon} onPress={showChatModeInfo}>
              <Ionicons name="information-circle-outline" size={20} color={bubblesMode ? "#FFFFFF" : "#000000"}/>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleDarkMode}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: darkModeBackground }]}>
            <Ionicons name="moon-outline" size={22} color={darkMode ? "#FFFFFF" : "#000000"} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: darkModeTextColor }]}>Dark Mode</Animated.Text>
            </View>
            <Animated.Text style={[styles.blockToggleText, { color: darkModeTextColor }]}>{darkMode ? "On" : "Off"}</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </View>
      <View style={{ position: "absolute", bottom: 20, left: 15 }}>
        <TouchableOpacity onPress={onBackToConversation} style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#000000",
          paddingHorizontal: 16,
          paddingVertical: 8,
          borderRadius: 30,
        }}>
          <Ionicons name="arrow-back" size={24} color="#FFFFFF"/>
          <Text style={{
            color: "#FFFFFF",
            fontSize: 20,
            fontFamily: "Poppins",
            marginLeft: 8,
            marginBottom: 2,
          }}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Performance styles moved to StagesScreen where the detailed stats are shown
