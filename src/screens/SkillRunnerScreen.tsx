/**
 * SkillRunnerScreen Component
 * 
 * Screen for running skills with input/output panels.
 * Handles skill execution, model/persona selection, and output actions.
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Modal,
  Pressable,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import Clipboard from "@react-native-clipboard/clipboard";
import RNFS from "react-native-fs";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  Skill,
  saveRunRecord,
  generateRunRecordId,
  RunRecord,
} from "../services/skillService";
import { Persona } from "../services/personaService";
import { executeSkill } from "../services/skillExecutionService";
import { prettifyModelName } from "../utils/modelUtils";
import { ANIMATION_DURATIONS, EASING } from "../utils/animationConfig";

interface SkillRunnerScreenProps {
  skill: Skill;
  onBack: () => void;
  selectedModelId?: string;
  selectedPersona?: Persona | null;
  onModelSelect?: () => void;
  onPersonaSelect?: () => void;
  context?: any; // Llama context for inference
  downloadedModels?: string[]; // List of downloaded model file names
  loadModel?: (filePath: string, currentContext: any, setContext: (ctx: any) => void) => Promise<boolean>;
  setSelectedGGUF?: (fileName: string | null) => void;
  setContext?: (ctx: any) => void;
  availablePersonas?: Persona[]; // List of available personas
  setSelectedPersona?: (persona: Persona | null) => void;
}

/**
 * AnimatedCheckmark Component
 * 
 * Displays a checkmark icon with fade-in animation.
 * Always renders to maintain layout, but fades in/out based on visibility.
 */
const AnimatedCheckmark: React.FC<{
  visible: boolean;
  size?: number;
  color: string;
}> = React.memo(({ visible, size = 24, color }) => {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: ANIMATION_DURATIONS.STANDARD,
      easing: EASING.STANDARD,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View 
      style={{ 
        opacity,
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      pointerEvents="none"
    >
      <Icon 
        name="check-circle" 
        size={size} 
        color={color}
      />
    </Animated.View>
  );
});

AnimatedCheckmark.displayName = 'AnimatedCheckmark';

export default function SkillRunnerScreen({
  skill,
  onBack,
  selectedModelId,
  selectedPersona,
  onModelSelect,
  onPersonaSelect,
  context,
  downloadedModels = [],
  loadModel,
  setSelectedGGUF,
  setContext,
  availablePersonas = [],
  setSelectedPersona,
}: SkillRunnerScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [input, setInput] = useState<string>("");
  const [output, setOutput] = useState<string>("");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [speedMode, setSpeedMode] = useState<boolean>(false);
  const [showPipeline, setShowPipeline] = useState<boolean>(false);
  const [runHistory, setRunHistory] = useState<RunRecord[]>([]);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState<boolean>(false);
  const [isPersonaDropdownOpen, setIsPersonaDropdownOpen] = useState<boolean>(false);
  const [isLoadingModel, setIsLoadingModel] = useState<boolean>(false);
  const startTimeRef = useRef<number>(0);
  const speedModeAnim = useRef(new Animated.Value(speedMode ? 1 : 0)).current;
  const cancellationTokenRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  
  // Modal animations
  const modelModalOpacity = useRef(new Animated.Value(0)).current;
  const modelModalTranslateY = useRef(new Animated.Value(300)).current;
  const personaModalOpacity = useRef(new Animated.Value(0)).current;
  const personaModalTranslateY = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.timing(speedModeAnim, {
      toValue: speedMode ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  }, [speedMode, speedModeAnim]);

  // Model modal animations - using spring for smooth, native feel
  useEffect(() => {
    if (isModelDropdownOpen) {
      modelModalOpacity.setValue(0);
      modelModalTranslateY.setValue(300);
      Animated.parallel([
        Animated.timing(modelModalOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(modelModalTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 14,
          overshootClamping: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(modelModalOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(modelModalTranslateY, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isModelDropdownOpen, modelModalOpacity, modelModalTranslateY]);

  // Persona modal animations - using spring for smooth, native feel
  useEffect(() => {
    if (isPersonaDropdownOpen) {
      personaModalOpacity.setValue(0);
      personaModalTranslateY.setValue(300);
      Animated.parallel([
        Animated.timing(personaModalOpacity, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.spring(personaModalTranslateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 14,
          overshootClamping: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(personaModalOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(personaModalTranslateY, {
          toValue: 300,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isPersonaDropdownOpen, personaModalOpacity, personaModalTranslateY]);

  // Get input placeholder from skill blocks
  const inputPlaceholder = skill.blocks.find((b) => b.type === "input")?.config
    .placeholder || "Enter input...";

  const handleRun = useCallback(async () => {
    if (!input.trim()) {
      showAlert("Input Required", "Please enter some input text.", [{ text: "OK" }]);
      return;
    }

    if (!context) {
      showAlert("Model Required", "Please select a model first.", [{ text: "OK" }]);
      return;
    }

    if (!selectedModelId) {
      showAlert("Model Required", "Please select a model first.", [{ text: "OK" }]);
      return;
    }

    setIsRunning(true);
    setOutput("");
    startTimeRef.current = Date.now();
    cancellationTokenRef.current = { cancelled: false };

    try {
      // Execute skill with real inference
      const result = await executeSkill({
        context,
        skill,
        input: input.trim(),
        modelFileName: selectedModelId,
        persona: selectedPersona,
        speedMode,
        onProgress: (progressOutput) => {
          setOutput(progressOutput);
        },
        cancellationToken: cancellationTokenRef.current,
      });

      setOutput(result.output);

      // Create run record with full metrics
      const record: RunRecord = {
        id: generateRunRecordId(),
        skillId: skill.id,
        timestamp: Date.now(),
        inputPreview: input.substring(0, 100),
        outputPreview: result.output.substring(0, 100),
        modelId: selectedModelId,
        personaId: selectedPersona?.id,
        duration: result.duration,
        tokenCount: result.tokenCount,
        tokensPerSecond: result.tokensPerSecond,
        error: result.error,
      };

      await saveRunRecord(record);
      setRunHistory((prev) => [record, ...prev].slice(0, 5)); // Keep last 5 in memory

      if (result.error) {
        showAlert("Execution Error", result.error, [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Error running skill:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setOutput(`Error: ${errorMessage}`);
      
      // Save error record
      const duration = Date.now() - startTimeRef.current;
      const record: RunRecord = {
        id: generateRunRecordId(),
        skillId: skill.id,
        timestamp: Date.now(),
        inputPreview: input.substring(0, 100),
        outputPreview: "",
        modelId: selectedModelId,
        personaId: selectedPersona?.id,
        duration,
        error: errorMessage,
      };
      await saveRunRecord(record);
      showAlert("Execution Error", errorMessage, [{ text: "OK" }]);
    } finally {
      setIsRunning(false);
    }
  }, [input, skill, selectedModelId, selectedPersona, context, speedMode]);

  const handleCancel = useCallback(() => {
    if (isRunning) {
      cancellationTokenRef.current.cancelled = true;
      setIsRunning(false);
      setOutput((prev) => prev + "\n\n*Generation cancelled*");
    }
  }, [isRunning]);

  const handleCopy = useCallback(async () => {
    if (!output.trim()) {
      showAlert("Nothing to Copy", "No output to copy.", [{ text: "OK" }]);
      return;
    }

    try {
      await Clipboard.setString(output);
      showAlert("Copied", "Output copied to clipboard.", [{ text: "OK" }]);
    } catch (error) {
      console.error("Error copying to clipboard:", error);
      showAlert("Error", "Failed to copy to clipboard.", [{ text: "OK" }]);
    }
  }, [output]);

  const handleShare = useCallback(() => {
    // TODO: Implement share in Step 4
    showAlert("Share", "Share functionality will be implemented in Step 4.", [{ text: "OK" }]);
  }, []);

  const handleSave = useCallback(() => {
    // TODO: Implement save in Step 4
    showAlert("Save", "Save functionality will be implemented in Step 4.", [{ text: "OK" }]);
  }, []);

  const handleCreateChat = useCallback(() => {
    // TODO: Implement create chat in Step 4
    showAlert("Create Chat", "Create chat functionality will be implemented in Step 4.", [{ text: "OK" }]);
  }, []);

  const getBlockIcon = (type: string) => {
    switch (type) {
      case "input":
        return "input";
      case "llm":
        return "psychology";
      case "codelib":
        return "code";
      case "output":
        return "output";
      default:
        return "circle";
    }
  };

  const getBlockName = (type: string) => {
    switch (type) {
      case "input":
        return "Input";
      case "llm":
        return "LLM";
      case "codelib":
        return "CodeLib";
      case "output":
        return "Output";
      default:
        return type;
    }
  };

  const handleModelSelect = useCallback(async (modelFileName: string) => {
    if (!loadModel || !setContext || !setSelectedGGUF) {
      // Fallback to navigation if props not provided
      if (onModelSelect) {
        onModelSelect();
      }
      return;
    }

    if (modelFileName === selectedModelId) {
      setIsModelDropdownOpen(false);
      return;
    }

    setIsLoadingModel(true);
    setIsModelDropdownOpen(false);

    try {
      const filePath = `${RNFS.DocumentDirectoryPath}/${modelFileName}`;
      const success = await loadModel(filePath, context, setContext);
      
      if (success) {
        setSelectedGGUF(modelFileName);
      } else {
        showAlert("Error", "Failed to load model. Please try again.", [{ text: "OK" }]);
      }
    } catch (error) {
      console.error("Error loading model:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      showAlert("Error", `Failed to load model: ${errorMessage}`, [{ text: "OK" }]);
    } finally {
      setIsLoadingModel(false);
    }
  }, [selectedModelId, loadModel, setContext, setSelectedGGUF, context, onModelSelect]);

  const handlePersonaSelect = useCallback((persona: Persona | null) => {
    if (setSelectedPersona) {
      setSelectedPersona(persona);
      setIsPersonaDropdownOpen(false);
    } else if (onPersonaSelect) {
      // Fallback to navigation if props not provided
      onPersonaSelect();
    }
  }, [setSelectedPersona, onPersonaSelect]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View style={[styles.container, { flex: 1, padding: 20 }]}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 20,
            paddingTop: 10,
          }}
        >
          <TouchableOpacity
            onPress={onBack}
            style={{
              marginRight: 12,
              padding: 8,
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 24,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
              }}
            >
              {skill.name}
            </Text>
            {skill.description && (
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                {skill.description}
              </Text>
            )}
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Model / Persona / Preset selector */}
          <View
            style={{
              flexDirection: "row",
              gap: 8,
              marginBottom: 16,
            }}
          >
            {(onModelSelect || (downloadedModels.length > 0 && loadModel)) && (
              <Pressable
                onPress={() => {
                  if (downloadedModels.length > 0 && loadModel) {
                    setIsModelDropdownOpen(true);
                  } else if (onModelSelect) {
                    onModelSelect();
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.surface,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Icon name="smart-toy" size={18} color={theme.colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginLeft: 6,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {selectedModelId ? prettifyModelName(selectedModelId) : "Select Model"}
                </Text>
                {downloadedModels.length > 0 && loadModel && (
                  <Icon 
                    name={isModelDropdownOpen ? "expand-less" : "expand-more"} 
                    size={20} 
                    color={theme.colors.textSecondary} 
                  />
                )}
              </Pressable>
            )}
            {(onPersonaSelect || (availablePersonas.length > 0 && setSelectedPersona)) && (
              <Pressable
                onPress={() => {
                  if (availablePersonas.length > 0 && setSelectedPersona) {
                    setIsPersonaDropdownOpen(true);
                  } else if (onPersonaSelect) {
                    onPersonaSelect();
                  }
                }}
                style={{
                  flex: 1,
                  backgroundColor: theme.colors.surface,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Icon name="person" size={18} color={theme.colors.textSecondary} />
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginLeft: 6,
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {selectedPersona?.name || "No Persona"}
                </Text>
                {availablePersonas.length > 0 && setSelectedPersona && (
                  <Icon 
                    name={isPersonaDropdownOpen ? "expand-less" : "expand-more"} 
                    size={20} 
                    color={theme.colors.textSecondary} 
                  />
                )}
              </Pressable>
            )}
          </View>

          {/* Speed Mode toggle */}
          <TouchableOpacity
            onPress={() => setSpeedMode(!speedMode)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 16,
              paddingVertical: 8,
            }}
          >
            <Animated.View
              style={{
                width: 44,
                height: 24,
                borderRadius: 12,
                backgroundColor: speedModeAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [theme.colors.surface, theme.colors.primary],
                }),
                padding: 2,
                marginRight: 8,
              }}
            >
              <Animated.View
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  backgroundColor: speedModeAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [theme.colors.border, theme.colors.primaryText],
                  }),
                  transform: [
                    {
                      translateX: speedModeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, 20],
                      }),
                    },
                  ],
                }}
              />
            </Animated.View>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.text,
                fontFamily: "Poppins",
              }}
            >
              Speed Mode
            </Text>
          </TouchableOpacity>

          {/* Input panel */}
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 16,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Input
            </Text>
            <TextInput
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 12,
                minHeight: 120,
                color: theme.colors.text,
                fontFamily: "Poppins",
                fontSize: 16,
                textAlignVertical: "top",
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
              placeholder={inputPlaceholder}
              placeholderTextColor={theme.colors.textTertiary}
              value={input}
              onChangeText={setInput}
              multiline
              editable={!isRunning}
            />
          </View>

          {/* Run/Cancel button */}
          <TouchableOpacity
            onPress={isRunning ? handleCancel : handleRun}
            disabled={!isRunning && (!input.trim() || !context || !selectedModelId)}
            style={{
              backgroundColor: isRunning
                ? theme.colors.error
                : !input.trim() || !context || !selectedModelId
                ? theme.colors.surface
                : theme.colors.primary,
              borderRadius: 12,
              paddingVertical: 16,
              paddingHorizontal: 24,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
              opacity: !isRunning && (!input.trim() || !context || !selectedModelId) ? 0.6 : 1,
            }}
          >
            {isRunning ? (
              <>
                <Icon name="stop" size={24} color="#fff" />
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 16,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 8,
                  }}
                >
                  Cancel
                </Text>
              </>
            ) : (
              <>
                <Icon name="play-arrow" size={24} color={theme.colors.primaryText} />
                <Text
                  style={{
                    color: theme.colors.primaryText,
                    fontSize: 16,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 8,
                  }}
                >
                  Run
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Output panel */}
          {output && (
            <View
              style={{
                backgroundColor: theme.colors.card,
                borderRadius: 16,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "600",
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                  }}
                >
                  Output
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity onPress={handleCopy} style={{ padding: 4 }}>
                    <Icon name="content-copy" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleShare} style={{ padding: 4 }}>
                    <Icon name="share" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleSave} style={{ padding: 4 }}>
                    <Icon name="save" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleCreateChat} style={{ padding: 4 }}>
                    <Icon name="chat" size={20} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              </View>
              <ScrollView
                style={{
                  maxHeight: 300,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {output}
                </Text>
              </ScrollView>
            </View>
          )}

          {/* View pipeline */}
          <TouchableOpacity
            onPress={() => setShowPipeline(!showPipeline)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 12,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
              }}
            >
              View Pipeline
            </Text>
            <Icon
              name={showPipeline ? "expand-less" : "expand-more"}
              size={24}
              color={theme.colors.textSecondary}
            />
          </TouchableOpacity>

          {showPipeline && (
            <View
              style={{
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              {skill.blocks.map((block, index) => (
                <View
                  key={index}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: index < skill.blocks.length - 1 ? 12 : 0,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: theme.colors.card,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 12,
                    }}
                  >
                    <Icon
                      name={getBlockIcon(block.type)}
                      size={20}
                      color={theme.colors.text}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: theme.colors.text,
                        fontFamily: "Poppins",
                      }}
                    >
                      {getBlockName(block.type)}
                    </Text>
                    {block.type === "codelib" && block.config.codelibId && (
                      <Text
                        style={{
                          fontSize: 12,
                          color: theme.colors.textSecondary,
                          fontFamily: "Poppins",
                        }}
                      >
                        {block.config.codelibId}
                      </Text>
                    )}
                  </View>
                  {index < skill.blocks.length - 1 && (
                    <Icon
                      name="arrow-downward"
                      size={20}
                      color={theme.colors.textTertiary}
                      style={{ marginLeft: 8 }}
                    />
                  )}
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </View>

      {/* Model Selection Dropdown Modal */}
      <Modal
        visible={isModelDropdownOpen}
        transparent={true}
        animationType="none"
        onRequestClose={() => setIsModelDropdownOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
          onPress={() => setIsModelDropdownOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ flex: 1 }}
          >
            <Animated.View
              style={{
                backgroundColor: theme.colors.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingTop: 20,
                paddingBottom: 40,
                maxHeight: "70%",
                opacity: modelModalOpacity,
                transform: [{ translateY: modelModalTranslateY }],
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 20,
                  marginBottom: 16,
                }}
              >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Select Model
              </Text>
              <TouchableOpacity onPress={() => setIsModelDropdownOpen(false)}>
                <Icon name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {downloadedModels.length === 0 ? (
              <View
                style={{
                  padding: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="smart-toy" size={48} color={theme.colors.textTertiary} />
                <Text
                  style={{
                    fontSize: 16,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginTop: 16,
                    textAlign: "center",
                  }}
                >
                  No models downloaded
                </Text>
                {onModelSelect && (
                  <TouchableOpacity
                    onPress={() => {
                      setIsModelDropdownOpen(false);
                      onModelSelect();
                    }}
                    style={{
                      backgroundColor: theme.colors.primary,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 12,
                      marginTop: 20,
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
                      Go to Model Selection
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={true}
              >
                {downloadedModels.map((model, index) => {
                  const isSelected = selectedModelId === model;
                  const isCurrentlyLoading = isLoadingModel && selectedModelId !== model;
                  return (
                    <Pressable
                      key={index}
                      onPress={() => handleModelSelect(model)}
                      disabled={isLoadingModel}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 16,
                          paddingHorizontal: 20,
                          borderBottomWidth: index < downloadedModels.length - 1 ? 1 : 0,
                          borderBottomColor: theme.colors.border,
                          backgroundColor: isSelected
                            ? theme.colors.primary + "20"
                            : pressed
                            ? theme.colors.surface
                            : "transparent",
                          flexDirection: "row",
                          alignItems: "center",
                          opacity: isLoadingModel && !isSelected && !isCurrentlyLoading ? 0.5 : 1,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: isSelected ? "600" : "400",
                            color: isSelected ? theme.colors.primary : theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                          numberOfLines={2}
                        >
                          {prettifyModelName(model)}
                        </Text>
                      </View>
                      {/* Fixed-width container to prevent layout shift */}
                      <View style={{ 
                        width: 32, 
                        height: 24, 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        marginLeft: 12,
                        position: 'relative',
                      }}>
                        {isCurrentlyLoading && (
                          <View style={{
                            position: 'absolute',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            <ActivityIndicator
                              size="small"
                              color={theme.colors.primary}
                            />
                          </View>
                        )}
                        <AnimatedCheckmark
                          visible={isSelected && !isCurrentlyLoading}
                          size={24}
                          color={theme.colors.primary}
                        />
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Persona Selection Dropdown Modal */}
      <Modal
        visible={isPersonaDropdownOpen}
        transparent={true}
        animationType="none"
        onRequestClose={() => setIsPersonaDropdownOpen(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
          onPress={() => setIsPersonaDropdownOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{ flex: 1 }}
          >
            <Animated.View
              style={{
                backgroundColor: theme.colors.card,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                paddingTop: 20,
                paddingBottom: 40,
                maxHeight: "70%",
                opacity: personaModalOpacity,
                transform: [{ translateY: personaModalTranslateY }],
              }}
            >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: 20,
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Select Persona
              </Text>
              <TouchableOpacity onPress={() => setIsPersonaDropdownOpen(false)}>
                <Icon name="close" size={24} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {availablePersonas.length === 0 ? (
              <View
                style={{
                  padding: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="person" size={48} color={theme.colors.textTertiary} />
                <Text
                  style={{
                    fontSize: 16,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginTop: 16,
                    textAlign: "center",
                  }}
                >
                  No personas available
                </Text>
                {onPersonaSelect && (
                  <TouchableOpacity
                    onPress={() => {
                      setIsPersonaDropdownOpen(false);
                      onPersonaSelect();
                    }}
                    style={{
                      backgroundColor: theme.colors.primary,
                      paddingVertical: 12,
                      paddingHorizontal: 24,
                      borderRadius: 12,
                      marginTop: 20,
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
                      Go to Personas
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <ScrollView
                style={{ maxHeight: 400 }}
                showsVerticalScrollIndicator={true}
              >
                <Pressable
                  onPress={() => handlePersonaSelect(null)}
                  style={({ pressed }) => [
                    {
                      paddingVertical: 16,
                      paddingHorizontal: 20,
                      borderBottomWidth: 1,
                      borderBottomColor: theme.colors.border,
                      backgroundColor: !selectedPersona
                        ? theme.colors.primary + "20"
                        : pressed
                        ? theme.colors.surface
                        : "transparent",
                      flexDirection: "row",
                      alignItems: "center",
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: !selectedPersona ? "600" : "400",
                        color: !selectedPersona ? theme.colors.primary : theme.colors.text,
                        fontFamily: "Poppins",
                      }}
                    >
                      No Persona
                    </Text>
                  </View>
                  {!selectedPersona && (
                    <Icon
                      name="check-circle"
                      size={24}
                      color={theme.colors.primary}
                      style={{ marginLeft: 12 }}
                    />
                  )}
                </Pressable>
                {availablePersonas.map((persona, index) => {
                  const isSelected = selectedPersona?.id === persona.id;
                  return (
                    <Pressable
                      key={persona.id}
                      onPress={() => handlePersonaSelect(persona)}
                      style={({ pressed }) => [
                        {
                          paddingVertical: 16,
                          paddingHorizontal: 20,
                          borderBottomWidth: index < availablePersonas.length - 1 ? 1 : 0,
                          borderBottomColor: theme.colors.border,
                          backgroundColor: isSelected
                            ? theme.colors.primary + "20"
                            : pressed
                            ? theme.colors.surface
                            : "transparent",
                          flexDirection: "row",
                          alignItems: "center",
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: 16,
                            fontWeight: isSelected ? "600" : "400",
                            color: isSelected ? theme.colors.primary : theme.colors.text,
                            fontFamily: "Poppins",
                          }}
                          numberOfLines={1}
                        >
                          {persona.name}
                        </Text>
                        {persona.tagline && (
                          <Text
                            style={{
                              fontSize: 12,
                              color: isSelected ? theme.colors.primary : theme.colors.textSecondary,
                              fontFamily: "Poppins",
                              marginTop: 4,
                            }}
                            numberOfLines={1}
                          >
                            {persona.tagline}
                          </Text>
                        )}
                      </View>
                      {isSelected && (
                        <Icon
                          name="check-circle"
                          size={24}
                          color={theme.colors.primary}
                          style={{ marginLeft: 12 }}
                        />
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            </Animated.View>
          </Pressable>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

