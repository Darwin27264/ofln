/* SettingsScreen.tsx */
import React from "react";
import { View, Text, Switch, TouchableOpacity } from "react-native";
import { styles } from "../styles/styles";

interface Props {
  assistantDisplayMode: "bubble" | "direct";
  setAssistantDisplayMode: React.Dispatch<
    React.SetStateAction<"bubble" | "direct">
  >;
  onBackToConversation: () => void;
}

export default function SettingsScreen({
  assistantDisplayMode,
  setAssistantDisplayMode,
  onBackToConversation,
}: Props) {
  const isDirectMode = assistantDisplayMode === "direct";

  const toggleMode = () => {
    setAssistantDisplayMode(isDirectMode ? "bubble" : "direct");
  };

  return (
    <View style={[styles.container, { padding: 20 }]}>
      <Text style={styles.settingsTitle}>Settings</Text>
      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>Assistant Display Mode</Text>
        <Switch
          onValueChange={toggleMode}
          value={isDirectMode}
          trackColor={{ false: "#767577", true: "#81b0ff" }}
          thumbColor={isDirectMode ? "#2563EB" : "#f4f3f4"}
        />
      </View>

      <TouchableOpacity style={styles.settingsBackButton} onPress={onBackToConversation}>
        <Text style={styles.settingsBackButtonText}>Back to Chat</Text>
      </TouchableOpacity>
    </View>
  );
}
