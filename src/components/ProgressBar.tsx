import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";

interface ProgressBarProps {
  progress: number; // Percentage (0–100)
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress }) => {
  const { theme } = useTheme();
  
  return (
    <View style={[styles.container, { backgroundColor: theme.colors.secondary }]}>
      <View style={[styles.bar, { width: `${progress}%`, backgroundColor: theme.colors.accent }]} />
      <Text style={[styles.text, { color: theme.colors.text }]}>{progress}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
    width: "100%",
  },
  bar: {
    height: "100%",
  },
  text: {
    position: "absolute",
    alignSelf: "center",
    fontSize: 10,
    fontWeight: "bold",
  },
});

export default ProgressBar;