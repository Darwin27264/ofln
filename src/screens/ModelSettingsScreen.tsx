/**
 * ModelSettingsScreen Component
 * 
 * Full-page screen for editing model settings.
 * Similar structure to PersonasLibraryScreen.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  getModelSettings,
  saveModelSettings,
  ModelSettings,
  DEFAULT_SETTINGS,
} from "../services/modelSettingsService";
import { ModelInfo } from "../components/ModelCard";

interface ModelSettingsScreenProps {
  model: ModelInfo;
  onBack: () => void;
}

// Metric explanations
const metricExplanations: { [key: string]: { title: string; explanation: string } } = {
  contextSize: {
    title: "Context Size (n_ctx)",
    explanation: "What it is:\nThe context size determines how many tokens (words/characters) the model can remember from the conversation history.\n\nEffects of tuning:\n• Higher values (4096-8192): Model remembers more conversation history, better for long conversations, but uses more memory\n• Lower values (512-1024): Uses less memory and is faster, but model forgets earlier parts of the conversation\n• Recommended: 2048-4096 for most use cases"
  },
  gpuLayers: {
    title: "GPU Layers (n_gpu_layers)",
    explanation: "What it is:\nControls how many layers of the neural network run on the GPU instead of CPU.\n\nEffects of tuning:\n• Higher values (4-8): Faster generation speed, but requires more GPU memory\n• Lower values (0-2): Uses less GPU memory, but generation is slower\n• 0: All processing on CPU (slowest but most compatible)\n• Recommended: Start with 1-2 and increase if you have GPU memory available"
  },
  temperature: {
    title: "Temperature",
    explanation: "What it is:\nControls the randomness and creativity of the model's responses.\n\nEffects of tuning:\n• Lower values (0.1-0.5): More focused, deterministic, and consistent responses. Better for factual tasks\n• Higher values (0.7-1.5): More creative, diverse, and unpredictable responses. Better for creative writing\n• Very high (1.5-2.0): May produce nonsensical or off-topic responses\n• Recommended: 0.7-0.9 for balanced responses"
  },
  topP: {
    title: "Top P (Nucleus Sampling)",
    explanation: "What it is:\nControls diversity by considering only tokens whose cumulative probability exceeds this threshold.\n\nEffects of tuning:\n• Lower values (0.1-0.5): More focused responses, considers fewer word choices\n• Higher values (0.7-0.95): More diverse responses, considers more word choices\n• Works together with temperature to control response quality\n• Recommended: 0.8-0.9 for most use cases"
  },
  topK: {
    title: "Top K",
    explanation: "What it is:\nLimits the model to consider only the top K most likely tokens when generating responses.\n\nEffects of tuning:\n• Lower values (1-10): More focused, predictable responses\n• Higher values (40-100): More diverse, creative responses\n• Setting too high may include unlikely tokens that reduce quality\n• Recommended: 40-60 for balanced quality and diversity"
  },
  repeatPenalty: {
    title: "Repeat Penalty",
    explanation: "What it is:\nPenalizes the model for repeating the same words or phrases.\n\nEffects of tuning:\n• Lower values (1.0-1.1): Model may repeat words or phrases more often\n• Higher values (1.2-1.5): Reduces repetition, but may make responses less natural if too high\n• Values above 1.5 may cause the model to avoid common words\n• Recommended: 1.1-1.2 for most use cases"
  },
  maxPredict: {
    title: "Max Predict Tokens (n_predict)",
    explanation: "What it is:\nThe maximum number of tokens the model will generate in a single response.\n\nEffects of tuning:\n• Lower values (128-512): Shorter responses, faster generation, less memory usage\n• Higher values (1024-4096): Longer responses, but slower and uses more memory\n• Setting too high may cause the model to ramble or go off-topic\n• Recommended: 512-2048 depending on your needs"
  }
};

export default function ModelSettingsScreen({
  model,
  onBack,
}: ModelSettingsScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [infoModalVisible, setInfoModalVisible] = useState<boolean>(false);
  const [infoModalContent, setInfoModalContent] = useState<{ title: string; explanation: string } | null>(null);

  // Load model settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getModelSettings(model.fileName);
        setModelSettings(settings);
      } catch (error) {
        console.error('Error loading model settings:', error);
        showAlert("Error", "Failed to load model settings.", [{ text: "OK" }]);
        setModelSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [model.fileName]);

  const handleSaveSettings = useCallback(async () => {
    if (!modelSettings) return;
    
    try {
      await saveModelSettings(model.fileName, modelSettings);
      showAlert("Success", "Model settings saved successfully.", [{ text: "OK" }]);
      onBack();
    } catch (error) {
      console.error('Error saving model settings:', error);
      showAlert("Error", "Failed to save model settings.", [{ text: "OK" }]);
    }
  }, [modelSettings, model.fileName, onBack]);

  const handleResetSettings = useCallback(() => {
    setModelSettings({ ...DEFAULT_SETTINGS });
  }, []);

  const showMetricInfo = useCallback((metricKey: string) => {
    const info = metricExplanations[metricKey];
    if (info) {
      setInfoModalContent(info);
      setInfoModalVisible(true);
    }
  }, []);

  if (isLoading || !modelSettings) {
    return (
      <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background, justifyContent: "center", alignItems: "center" }]}>
        <Text style={{ color: theme.colors.text, fontFamily: "Poppins" }}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.background,
          zIndex: 1,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.settingsTitle}>Model Settings</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              fontFamily: "Poppins",
              marginTop: 4,
            }}
          >
            {model.name}
          </Text>
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{
          marginTop: 70,
          flex: 1,
        }}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* System Prompt */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
              marginBottom: 8,
            }}
          >
            System Prompt
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 12,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              minHeight: 100,
              textAlignVertical: "top",
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.systemPrompt}
            onChangeText={(text) => setModelSettings({ ...modelSettings, systemPrompt: text })}
            multiline
            placeholder="Enter system prompt..."
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        {/* Context Size */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Context Size (n_ctx)
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("contextSize")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.n_ctx}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[512, 1024, 2048, 4096, 8192].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setModelSettings({ ...modelSettings, n_ctx: value })}
                style={{
                  flex: 1,
                  backgroundColor: modelSettings.n_ctx === value ? theme.colors.primary : theme.colors.surface,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: modelSettings.n_ctx === value ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: modelSettings.n_ctx === value ? theme.colors.primaryText : theme.colors.text,
                    fontFamily: "Poppins",
                  }}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* GPU Layers */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                GPU Layers (n_gpu_layers)
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("gpuLayers")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.n_gpu_layers}
            </Text>
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[0, 1, 2, 4, 8].map((value) => (
              <TouchableOpacity
                key={value}
                onPress={() => setModelSettings({ ...modelSettings, n_gpu_layers: value })}
                style={{
                  flex: 1,
                  backgroundColor: modelSettings.n_gpu_layers === value ? theme.colors.primary : theme.colors.surface,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: modelSettings.n_gpu_layers === value ? theme.colors.primary : theme.colors.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "600",
                    color: modelSettings.n_gpu_layers === value ? theme.colors.primaryText : theme.colors.text,
                    fontFamily: "Poppins",
                  }}
                >
                  {value}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Temperature */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Temperature
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("temperature")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.temperature.toFixed(1)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ fontSize: 14, color: theme.colors.textTertiary, fontFamily: "Poppins", minWidth: 30 }}>0.0</Text>
            <View style={{ flex: 1 }}>
              <View style={{ position: "relative", height: 40, justifyContent: "center" }}>
                <View
                  style={{
                    height: 4,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 2,
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    left: `${(modelSettings.temperature / 2.0) * 100}%`,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: theme.colors.primary,
                    transform: [{ translateX: -10 }],
                  }}
                />
              </View>
            </View>
            <Text style={{ fontSize: 14, color: theme.colors.textTertiary, fontFamily: "Poppins", minWidth: 30 }}>2.0</Text>
          </View>
          <TextInput
            style={{
              marginTop: 8,
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              padding: 10,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.temperature.toString()}
            onChangeText={(text) => {
              const value = parseFloat(text);
              if (!isNaN(value) && value >= 0 && value <= 2.0) {
                setModelSettings({ ...modelSettings, temperature: value });
              }
            }}
            keyboardType="numeric"
            placeholder="0.0 - 2.0"
          />
        </View>

        {/* Top P */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Top P
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("topP")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.top_p.toFixed(2)}
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              padding: 10,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.top_p.toString()}
            onChangeText={(text) => {
              const value = parseFloat(text);
              if (!isNaN(value) && value >= 0 && value <= 1.0) {
                setModelSettings({ ...modelSettings, top_p: value });
              }
            }}
            keyboardType="numeric"
            placeholder="0.0 - 1.0"
          />
        </View>

        {/* Top K */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Top K
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("topK")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.top_k}
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              padding: 10,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.top_k.toString()}
            onChangeText={(text) => {
              const value = parseInt(text);
              if (!isNaN(value) && value >= 1 && value <= 100) {
                setModelSettings({ ...modelSettings, top_k: value });
              }
            }}
            keyboardType="numeric"
            placeholder="1 - 100"
          />
        </View>

        {/* Repeat Penalty */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Repeat Penalty
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("repeatPenalty")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 16,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.repeat_penalty.toFixed(2)}
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              padding: 10,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.repeat_penalty.toString()}
            onChangeText={(text) => {
              const value = parseFloat(text);
              if (!isNaN(value) && value >= 0 && value <= 2.0) {
                setModelSettings({ ...modelSettings, repeat_penalty: value });
              }
            }}
            keyboardType="numeric"
            placeholder="0.0 - 2.0"
          />
        </View>

        {/* Max Predict Tokens */}
        <View style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Max Predict Tokens (n_predict)
              </Text>
              <TouchableOpacity
                onPress={() => showMetricInfo("maxPredict")}
                style={{ marginLeft: 8, padding: 4 }}
              >
                <Ionicons name="information-circle-outline" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelSettings.n_predict}
            </Text>
          </View>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 8,
              padding: 10,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.n_predict.toString()}
            onChangeText={(text) => {
              const value = parseInt(text);
              if (!isNaN(value) && value >= 1 && value <= 100000) {
                setModelSettings({ ...modelSettings, n_predict: value });
              }
            }}
            keyboardType="numeric"
            placeholder="1 - 100000"
          />
        </View>

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 24 }}>
          <TouchableOpacity
            onPress={handleResetSettings}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              minHeight: 44,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Reset
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSaveSettings}
            style={{
              flex: 1,
              backgroundColor: theme.colors.primary,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
            }}
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Back button */}
      <View style={{ position: "absolute", bottom: 20, left: 15, backgroundColor: "transparent" }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
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

      {/* Info Modal for Metric Explanations */}
      <Modal
        visible={infoModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setInfoModalVisible(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
          onPress={() => setInfoModalVisible(false)}
        >
          <Pressable
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 24,
              maxWidth: "90%",
              maxHeight: "80%",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            {infoModalContent && (
              <>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <Text
                    style={{
                      fontSize: 20,
                      fontWeight: "600",
                      color: theme.colors.text,
                      fontFamily: "Poppins",
                      flex: 1,
                    }}
                  >
                    {infoModalContent.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setInfoModalVisible(false)}
                    style={{ padding: 4, marginLeft: 12 }}
                  >
                    <Ionicons name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  style={{ maxHeight: 400 }}
                  showsVerticalScrollIndicator={true}
                >
                  <View>
                    {infoModalContent.explanation.split('\n').map((line, index) => {
                      if (line.startsWith('•')) {
                        return (
                          <Text key={index} style={{ 
                            fontSize: 15,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            lineHeight: 24,
                            marginLeft: 8,
                            marginBottom: 4,
                          }}>
                            {line}
                          </Text>
                        );
                      } else if (line.trim() === '') {
                        return <View key={index} style={{ height: 8 }} />;
                      } else {
                        return (
                          <Text key={index} style={{ 
                            fontSize: 15,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            lineHeight: 24,
                            fontWeight: line.includes(':') ? '600' : '400',
                            marginBottom: 4,
                          }}>
                            {line}
                          </Text>
                        );
                      }
                    })}
                  </View>
                </ScrollView>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

