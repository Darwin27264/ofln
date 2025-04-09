// StagesScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Alert,
} from "react-native";
import RNFS from "react-native-fs";
import Ionicons from "react-native-vector-icons/Ionicons";
import { LineChart } from "react-native-chart-kit";
import { styles } from "../styles/styles";

// Define a type for a usage record (matching our UsageMetrics interface)
interface UsageRecord {
  timestamp: number;
  inferenceTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: "High" | "Medium" | "Low";
  model: string;
}

// Props include a list of downloaded models and a callback to go back.
interface Props {
  downloadedModels: string[];
  onBack: () => void;
}

export default function StagesScreen({ downloadedModels, onBack }: Props) {
  const [loading, setLoading] = useState(true);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(
    downloadedModels[0] || "unknown"
  );

  // Aggregated stats for the selected model
  const [aggregatedStats, setAggregatedStats] = useState<{
    totalInferences: number;
    avgInferenceTime: number;
    avgTokensPerSecond: number;
    latestPerformance: "High" | "Medium" | "Low";
  } | null>(null);

  // Chart data arrays for Tokens per Second (TPS) and Inference Time
  const [chartTPSData, setChartTPSData] = useState<number[]>([]);
  const [chartTimeData, setChartTimeData] = useState<number[]>([]);

  // Load usage data on mount
  useEffect(() => {
    const loadUsageData = async () => {
      try {
        const filePath = `${RNFS.DocumentDirectoryPath}/usage_log.json`;
        const exists = await RNFS.exists(filePath);
        if (exists) {
          const contents = await RNFS.readFile(filePath, "utf8");
          const lines = contents.split("\n").filter((line) => line.trim().length > 0);
          const records: UsageRecord[] = lines
            .map((line) => {
              try {
                return JSON.parse(line);
              } catch (error) {
                return null;
              }
            })
            .filter((record) => record !== null);
          setUsageRecords(records);
        }
      } catch (error) {
        console.error("Error loading usage data:", error);
      } finally {
        setLoading(false);
      }
    };
    loadUsageData();
  }, []);

  // Update aggregated stats and chart data when usageRecords or selectedModel changes.
  useEffect(() => {
    const filtered = usageRecords.filter((record) => record.model === selectedModel);
    if (filtered.length === 0) {
      setAggregatedStats(null);
      setChartTPSData([]);
      setChartTimeData([]);
      return;
    }
    const totalInferences = filtered.length;
    const avgInferenceTime =
      filtered.reduce((sum, r) => sum + r.inferenceTime, 0) / totalInferences;
    const avgTokensPerSecond =
      filtered.reduce((sum, r) => sum + r.tokensPerSecond, 0) / totalInferences;
    const latestPerformance = filtered[filtered.length - 1].performanceLevel;
    setAggregatedStats({
      totalInferences,
      avgInferenceTime,
      avgTokensPerSecond,
      latestPerformance,
    });

    // Store chart data. You can index these if needed (e.g., by session order)
    setChartTPSData(filtered.map((r) => r.tokensPerSecond));
    setChartTimeData(filtered.map((r) => r.inferenceTime));
  }, [usageRecords, selectedModel]);

  // Determine if there are usage logs for the selected model
  const noUsageLogs = aggregatedStats === null;

  // Compute dynamic suggestions based on the aggregated stats.
  const getSuggestions = (): string[] => {
    const suggestions: string[] = [];
    if (aggregatedStats) {
      if (aggregatedStats.avgInferenceTime > 100) {
        suggestions.push(
          "Your average inference time is high. Consider optimizing performance or trying a different model."
        );
      }
      if (aggregatedStats.avgTokensPerSecond < 20) {
        suggestions.push(
          "Tokens per second rate is low; switching models might yield better performance."
        );
      }
      if (aggregatedStats.totalInferences < 5) {
        suggestions.push(
          "Generate more inferences to gather sufficient data for deeper insights."
        );
      }
      if (suggestions.length === 0) {
        suggestions.push(
          "Great performance! Keep using your model to accumulate more insights."
        );
      }
    } else {
      suggestions.push(
        "No usage logs available. Start using the model to generate insightful data."
      );
    }
    return suggestions;
  };

  // Screen width for chart layout
  const screenWidth = Dimensions.get("window").width;

  // Updated chart configuration with a gray background matching the container,
  // a modern minimal blue line, and no dots.
  const chartConfig = {
    backgroundColor: "#F0F0F0",
    backgroundGradientFrom: "#F0F0F0",
    backgroundGradientTo: "#F0F0F0",
    color: (opacity = 1) => `rgba(37, 99, 235, ${opacity})`, // Blue line color
    labelColor: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    decimalPlaces: 2,
    propsForDots: {
      r: "0", // Remove dots
    },
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={[styles.container, { padding: 20 }]}
        contentContainerStyle={{ paddingBottom: 120 }} // Extra padding so content isn't hidden
      >
        <Text style={[styles.settingsTitle, { marginBottom: 20 }]}>
          Performance & Usage Stats
        </Text>

        {/* Model Selector with horizontal scrolling */}
        <ScrollView
          horizontal={true}
          showsHorizontalScrollIndicator={false}
          style={{ marginBottom: 20 }}
        >
          {downloadedModels.map((model) => (
            <TouchableOpacity
              key={model}
              onPress={() => setSelectedModel(model)}
              style={{
                padding: 10,
                backgroundColor: selectedModel === model ? "#2563EB" : "#ccc",
                borderRadius: 8,
                marginRight: 10,
              }}
            >
              <Text style={{ color: "#FFF", fontSize: 12 }}>{model}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Aggregated Stats Display */}
        <View
          style={{
            backgroundColor: "#EAEAEA",
            borderRadius: 10,
            padding: 15,
            marginBottom: 20,
          }}
        >
          {aggregatedStats ? (
            <>
              <Text>Total Inferences: {aggregatedStats.totalInferences}</Text>
              <Text>
                Avg. Inference Time:{" "}
                {aggregatedStats.avgInferenceTime.toFixed(2)} ms
              </Text>
              <Text>
                Avg. Tokens/Sec:{" "}
                {aggregatedStats.avgTokensPerSecond.toFixed(2)}
              </Text>
              <Text>
                Latest Performance: {aggregatedStats.latestPerformance}
              </Text>
            </>
          ) : (
            <Text>No usage data for the selected model.</Text>
          )}
        </View>

        {/* Tokens Per Second Chart in a gray rounded block */}
        <View
          style={{
            backgroundColor: "#F0F0F0",
            borderRadius: 10,
            padding: 15,
            marginBottom: 20,
            position: "relative",
          }}
        >
          <Text style={{ fontSize: 16, marginBottom: 10 }}>
            Tokens Per Second Over Sessions
          </Text>
          {chartTPSData.length > 0 ? (
            <LineChart
              data={{
                labels: chartTPSData.map((_, i) => String(i + 1)),
                datasets: [
                  {
                    data: chartTPSData,
                  },
                ],
              }}
              width={screenWidth - 60} // Adjusted for padding
              height={220}
              chartConfig={chartConfig}
              style={{ borderRadius: 10 }}
              bezier
              withDots={false}
              withInnerLines={false}
              withVerticalLines={false}
            />
          ) : (
            <ActivityIndicator size="small" color="#2563EB" />
          )}
          {noUsageLogs && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(128,128,128,0.5)",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#FFF", fontSize: 16 }}>No usage logs</Text>
            </View>
          )}
        </View>

        {/* Inference Time Chart in a gray rounded block */}
        <View
          style={{
            backgroundColor: "#F0F0F0",
            borderRadius: 10,
            padding: 15,
            marginBottom: 20,
            position: "relative",
          }}
        >
          <Text style={{ fontSize: 16, marginBottom: 10 }}>
            Inference Time Over Sessions (ms)
          </Text>
          {chartTimeData.length > 0 ? (
            <LineChart
              data={{
                labels: chartTimeData.map((_, i) => String(i + 1)),
                datasets: [
                  {
                    data: chartTimeData,
                  },
                ],
              }}
              width={screenWidth - 60}
              height={220}
              chartConfig={chartConfig}
              style={{ borderRadius: 10 }}
              bezier
              withDots={false}
              withInnerLines={false}
              withVerticalLines={false}
            />
          ) : (
            <ActivityIndicator size="small" color="#2563EB" />
          )}
          {noUsageLogs && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: "rgba(128,128,128,0.5)",
                justifyContent: "center",
                alignItems: "center",
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#FFF", fontSize: 16 }}>No usage logs</Text>
            </View>
          )}
        </View>

        {/* Dynamic Suggestions */}
        <View
          style={{
            backgroundColor: "#EAEAEA",
            borderRadius: 20,
            padding: 15,
          }}
        >
          <Text style={{ fontSize: 16, marginBottom: 10 }}>Suggestions</Text>
          {getSuggestions().map((suggestion, index) => (
            <Text key={index} style={{ marginBottom: 5 }}>
              {suggestion}
            </Text>
          ))}
        </View>
      </ScrollView>

      {/* Back Button (styled like in SettingsScreen) */}
      <View style={{ position: "absolute", bottom: 20, left: 15 }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#000000",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
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

      {/* Clear Button (no icon, with confirmation, balanced pill) */}
      <View style={{ position: "absolute", bottom: 20, right: 15 }}>
        <TouchableOpacity
          onPress={() => {
            Alert.alert(
              "Clear Usage Data",
              "Are you sure you want to clear usage logs?",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Clear",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      const filePath = `${RNFS.DocumentDirectoryPath}/usage_log.json`;
                      await RNFS.unlink(filePath);
                      setUsageRecords([]);
                    } catch (error) {
                      console.error("Error clearing usage data:", error);
                    }
                  },
                },
              ]
            );
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "#000000",
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
          }}
        >
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 20,
              fontFamily: "Poppins",
              textAlign: "center",
            }}
          >
            Clear
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
