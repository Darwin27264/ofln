// InfoScreen.tsx
import React from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
// Import package.json to get app version and name
// Using require instead of import to avoid TypeScript module resolution issues
const packageJson = require("../../package.json");

interface Props {
  onBack: () => void;
}

export default function InfoScreen({ onBack }: Props) {
  const { theme, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);

  const appName = packageJson.name || "ofln";
  const appVersion = packageJson.version || "0.0.1";
  const appPurpose = "A React Native mobile application for running Large Language Models (LLMs) offline on mobile devices. The app enables users to download, manage, and interact with AI models locally without requiring an internet connection after initial setup.";

  return (
    <View 
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
      <Text style={[styles.settingsTitle, { marginBottom: 40 }]}>About</Text>
      
      <ScrollView 
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{
          fontSize: 36,
          fontWeight: "600",
          color: theme.colors.text,
          marginBottom: 16,
          fontFamily: "Poppins",
        }}>{appName}</Text>

        <Text style={{
          fontSize: 18,
          color: theme.colors.text,
          lineHeight: 26,
          marginBottom: 30,
          fontFamily: "Poppins",
        }}>{appPurpose}</Text>

        <View style={{
          backgroundColor: theme.colors.glass,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: 16,
          alignSelf: "flex-start",
        }}>
          <Text style={{
            fontSize: 18,
            color: theme.colors.text,
            fontFamily: "Poppins",
            fontWeight: "500",
          }}>v{appVersion}</Text>
        </View>
      </ScrollView>

      <View style={{ position: "absolute", bottom: 20, left: 15, backgroundColor: "transparent" }}>
        <TouchableOpacity onPress={onBack} style={{
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
      </View>
    </View>
  );
}
