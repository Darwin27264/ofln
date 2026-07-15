import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "../context/ThemeContext";

interface CircularProgressProps {
  progress: number; // Percentage (0–100)
  size?: number; // Size of the circle
  strokeWidth?: number; // Width of the progress stroke
  showCancelButton?: boolean; // Whether to show cancel button (handled by parent)
}

const CircularProgress: React.FC<CircularProgressProps> = ({ 
  progress, 
  size = 60,
  strokeWidth = 6,
}) => {
  const { theme } = useTheme();
  
  // Calculate circle properties
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progressOffset = circumference - (progress / 100) * circumference;
  const center = size / 2;
  
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/* Background circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.surface || theme.colors.border}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        {/* Progress circle */}
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={theme.colors.text}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: "center",
    alignItems: "center",
  },
});

export default CircularProgress;

