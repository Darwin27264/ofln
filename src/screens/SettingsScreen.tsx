// SettingsScreen.tsx
import React, { useRef, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Animated } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { BottomSheet } from "../components/BottomSheet";
import { useFloatingBackBottom } from "../utils/layoutInsets";
import { EASING } from "../utils/animationConfig";

interface Props {
  assistantDisplayMode: "bubble" | "direct";
  setAssistantDisplayMode: React.Dispatch<React.SetStateAction<"bubble" | "direct">>;
  onBackToConversation: () => void;
  onGoToModelSelection: () => void;
  onOpenStats: () => void;
  onGoToPersonas: () => void;
  onGoToPerspectives: () => void;
  onGoToInfo: () => void;
  onGoToDiagnostics: () => void;
  onGoToStorage: () => void;
}

export default function SettingsScreen({
  assistantDisplayMode,
  setAssistantDisplayMode,
  onBackToConversation,
  onGoToModelSelection,
  onOpenStats,
  onGoToPersonas,
  onGoToPerspectives,
  onGoToInfo,
  onGoToDiagnostics,
  onGoToStorage,
}: Props) {
  const { theme, toggleTheme, isDark, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const [chatModeInfoOpen, setChatModeInfoOpen] = useState(false);

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
    outputRange: [theme.colors.secondary, theme.colors.primary],
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
    outputRange: [theme.colors.secondary, theme.colors.primary],
  });
  const darkModeTextColor = darkModeAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.text, theme.colors.primaryText],
  });

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
      <Text style={[styles.settingsTitle, { marginBottom: 40 }]}>Settings</Text>
      <View style={{ marginBottom: 0 }}>
        <View style={{ flexDirection: "row", marginBottom: 10, height: 128 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={onOpenStats} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="speedometer-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Performance</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToModelSelection} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="cube-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Models</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", height: 128 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={onGoToDiagnostics} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="pulse-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Diagnostics</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToPersonas} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="person-circle-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Personas</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", height: 128, marginTop: 10 }}>
          <TouchableOpacity style={{ flex: 1, marginRight: 5 }} onPress={onGoToStorage} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="folder-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Storage</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
          <TouchableOpacity style={{ flex: 1, marginLeft: 5 }} onPress={onGoToPerspectives} activeOpacity={0.85}>
            <Animated.View style={styles.settingsBlock}>
              <Ionicons name="git-compare-outline" size={21} color={theme.colors.text} style={styles.blockIcon}/>
              <View style={styles.blockTextContainer}>
                <Text style={styles.blockText}>Perspective</Text>
              </View>
            </Animated.View>
          </TouchableOpacity>
        </View>
      </View>
      <View style={{height: 2.5, backgroundColor: theme.colors.border, marginVertical: 12, width: '30%', alignSelf: 'center'}}/>
      <View style={{ flexDirection: "row", height: 108, justifyContent: "space-between" }}>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleChatMode} activeOpacity={0.85}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: chatModeBackground }]}>
            <Ionicons name="chatbubble-outline" size={21} color={bubblesMode ? theme.colors.primaryText : theme.colors.text} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: chatModeTextColor }]}>Chat Mode</Animated.Text>
            </View>
            <TouchableOpacity
              style={styles.blockInfoIcon}
              onPress={() => setChatModeInfoOpen(true)}
              activeOpacity={0.85}
              accessibilityLabel="Chat mode info"
              accessibilityHint="Explains bubble vs transcript display"
            >
              <Ionicons name="information-circle-outline" size={19} color={bubblesMode ? theme.colors.primaryText : theme.colors.text}/>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1, maxWidth: "48.5%" }} onPress={toggleTheme} activeOpacity={0.85}>
          <Animated.View style={[styles.settingsBlock, { backgroundColor: darkModeBackground }]}>
            <Ionicons name={isDark ? "moon" : "moon-outline"} size={21} color={isDark ? theme.colors.primaryText : theme.colors.text} style={styles.blockIcon}/>
            <View style={styles.blockTextContainer}>
              <Animated.Text style={[styles.blockText, { color: darkModeTextColor }]}>Dark Mode</Animated.Text>
            </View>
            <Animated.Text style={[styles.blockToggleText, { color: darkModeTextColor }]}>{isDark ? "On" : "Off"}</Animated.Text>
          </Animated.View>
        </TouchableOpacity>
      </View>

      <View style={{ position: "absolute", bottom: backBottom, left: 15, right: 15, backgroundColor: "transparent", flexDirection: "row", justifyContent: "space-between" }}>
        <TouchableOpacity activeOpacity={0.85} onPress={onBackToConversation} style={{
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
        <TouchableOpacity
          onPress={onGoToInfo}
          activeOpacity={0.85}
          accessibilityLabel="About"
          accessibilityHint="Opens about the app and how-to tips"
          style={{
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
