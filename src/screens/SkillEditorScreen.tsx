/**
 * SkillEditorScreen Component
 * 
 * Screen for creating and editing Skills with block-based pipeline.
 * Allows users to build pipelines with Input, LLM, CodeLib, and Output blocks.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  Skill,
  SkillBlock,
  SkillBlockType,
  saveSkill,
  generateSkillId,
} from "../services/skillService";
import { getCodeLibFunctions, CodeLibFunction } from "../services/codelibService";

interface SkillEditorScreenProps {
  skill: Skill | null; // null = create mode
  onSave: (skill: Skill) => void;
  onCancel: () => void;
  onTest?: (skill: Skill) => void;
}

export default function SkillEditorScreen({
  skill: existingSkill,
  onSave,
  onCancel,
  onTest,
}: SkillEditorScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const isEditMode = existingSkill !== null;

  // Form state
  const [name, setName] = useState<string>(existingSkill?.name || "");
  const [description, setDescription] = useState<string>(existingSkill?.description || "");
  const [category, setCategory] = useState<string>(existingSkill?.category || "");
  const [iconKey, setIconKey] = useState<string>(existingSkill?.iconKey || "auto-awesome");
  const [isPinned, setIsPinned] = useState<boolean>(existingSkill?.isPinned || false);
  const [blocks, setBlocks] = useState<SkillBlock[]>(existingSkill?.blocks || []);
  const [defaultModelId, setDefaultModelId] = useState<string>(existingSkill?.defaultModelId || "");
  const [defaultPersonaId, setDefaultPersonaId] = useState<string>(existingSkill?.defaultPersonaId || "");

  // CodeLib selection state
  const [showCodeLibSelector, setShowCodeLibSelector] = useState<boolean>(false);
  const [codeLibFunctions, setCodeLibFunctions] = useState<CodeLibFunction[]>([]);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);

  // Load CodeLib functions
  useEffect(() => {
    const loadCodeLibFunctions = async () => {
      const functions = await getCodeLibFunctions();
      setCodeLibFunctions(functions);
    };
    loadCodeLibFunctions();
  }, []);

  // Initialize from existing skill
  useEffect(() => {
    if (existingSkill) {
      setName(existingSkill.name);
      setDescription(existingSkill.description);
      setCategory(existingSkill.category || "");
      setIconKey(existingSkill.iconKey || "auto-awesome");
      setIsPinned(existingSkill.isPinned);
      setBlocks(existingSkill.blocks);
      setDefaultModelId(existingSkill.defaultModelId || "");
      setDefaultPersonaId(existingSkill.defaultPersonaId || "");
    }
  }, [existingSkill]);

  const handleAddBlock = useCallback(
    (type: SkillBlockType, insertAfter?: number) => {
      const newBlock: SkillBlock = {
        type,
        config: {
          ...(type === "input" ? { placeholder: "Enter input..." } : {}),
          ...(type === "llm" ? { prompt: "", maxTokens: 200 } : {}),
          ...(type === "codelib" ? { codelibId: "" } : {}),
          ...(type === "output" ? { format: "plain" } : {}),
        },
      };

      if (insertAfter !== undefined) {
        const newBlocks = [...blocks];
        newBlocks.splice(insertAfter + 1, 0, newBlock);
        setBlocks(newBlocks);
      } else {
        setBlocks([...blocks, newBlock]);
      }
    },
    [blocks]
  );

  const handleRemoveBlock = useCallback(
    (index: number) => {
      const newBlocks = blocks.filter((_, i) => i !== index);
      setBlocks(newBlocks);
    },
    [blocks]
  );

  const handleSelectCodeLib = useCallback(
    (codelibId: string) => {
      if (selectedBlockIndex !== null) {
        const newBlocks = [...blocks];
        newBlocks[selectedBlockIndex] = {
          ...newBlocks[selectedBlockIndex],
          config: {
            ...newBlocks[selectedBlockIndex].config,
            codelibId,
          },
        };
        setBlocks(newBlocks);
        setShowCodeLibSelector(false);
        setSelectedBlockIndex(null);
      }
    },
    [blocks, selectedBlockIndex]
  );

  const handleOpenCodeLibSelector = useCallback((index: number) => {
    setSelectedBlockIndex(index);
    setShowCodeLibSelector(true);
  }, []);

  const handleUpdateBlockConfig = useCallback(
    (index: number, key: string, value: any) => {
      const newBlocks = [...blocks];
      newBlocks[index] = {
        ...newBlocks[index],
        config: {
          ...newBlocks[index].config,
          [key]: value,
        },
      };
      setBlocks(newBlocks);
    },
    [blocks]
  );

  const validatePipeline = useCallback((): string | null => {
    const inputBlocks = blocks.filter((b) => b.type === "input");
    const llmBlocks = blocks.filter((b) => b.type === "llm");
    const outputBlocks = blocks.filter((b) => b.type === "output");

    if (inputBlocks.length !== 1) {
      return "Pipeline must have exactly one Input block";
    }
    if (llmBlocks.length < 1) {
      return "Pipeline must have at least one LLM block";
    }
    if (outputBlocks.length !== 1) {
      return "Pipeline must have exactly one Output block";
    }

    // Check order: Input should be first, Output should be last
    if (blocks[0].type !== "input") {
      return "Input block must be first";
    }
    if (blocks[blocks.length - 1].type !== "output") {
      return "Output block must be last";
    }

    // Check that CodeLib blocks have a selected function
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].type === "codelib" && !blocks[i].config.codelibId) {
        return `CodeLib block at position ${i + 1} must have a function selected`;
      }
    }

    return null;
  }, [blocks]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showAlert("Name Required", "Please enter a skill name.", [{ text: "OK" }]);
      return;
    }

    if (!description.trim()) {
      showAlert("Description Required", "Please enter a description.", [{ text: "OK" }]);
      return;
    }

    const validationError = validatePipeline();
    if (validationError) {
      showAlert("Invalid Pipeline", validationError, [{ text: "OK" }]);
      return;
    }

    const skill: Skill = {
      id: existingSkill?.id || generateSkillId(),
      name: name.trim(),
      description: description.trim(),
      category: category.trim() || undefined,
      iconKey: iconKey || undefined,
      isPinned,
      isBuiltIn: existingSkill?.isBuiltIn || false,
      blocks,
      defaultModelId: defaultModelId.trim() || undefined,
      defaultPersonaId: defaultPersonaId.trim() || undefined,
      createdAt: existingSkill?.createdAt || Date.now(),
      lastUsed: existingSkill?.lastUsed,
    };

    onSave(skill);
  }, [
    name,
    description,
    category,
    iconKey,
    isPinned,
    blocks,
    defaultModelId,
    defaultPersonaId,
    existingSkill,
    validatePipeline,
    onSave,
  ]);

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

  const availableBlockTypes: SkillBlockType[] = ["input", "llm", "codelib", "output"];

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
          <TouchableOpacity onPress={onCancel} style={{ marginRight: 12, padding: 8 }}>
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
              {isEditMode ? "Edit Skill" : "Create Skill"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleSave}
            style={{
              backgroundColor: theme.colors.primary,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 20,
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

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 20 }}
        >
          {/* Basics */}
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
                fontSize: 18,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 16,
              }}
            >
              Basics
            </Text>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Name *
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                placeholder="Skill name"
                placeholderTextColor={theme.colors.textTertiary}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Description *
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                placeholder="What does this skill do?"
                placeholderTextColor={theme.colors.textTertiary}
                value={description}
                onChangeText={setDescription}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Category (optional)
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                placeholder="e.g., Productivity, Writing"
                placeholderTextColor={theme.colors.textTertiary}
                value={category}
                onChangeText={setCategory}
              />
            </View>

            <TouchableOpacity
              onPress={() => setIsPinned(!isPinned)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <View
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isPinned ? theme.colors.primary : theme.colors.surface,
                  padding: 2,
                  marginRight: 12,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: isPinned ? theme.colors.primaryText : theme.colors.border,
                    transform: [{ translateX: isPinned ? 20 : 0 }],
                  }}
                />
              </View>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Pin to Quick Actions
              </Text>
            </TouchableOpacity>
          </View>

          {/* Pipeline */}
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
                marginBottom: 16,
              }}
            >
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                }}
              >
                Pipeline
              </Text>
              <TouchableOpacity
                onPress={() => {
                  // Show block type selector
                  showAlert(
                    "Add Block",
                    "Select block type to add",
                    availableBlockTypes.map((type) => ({
                      text: getBlockName(type),
                      onPress: () => handleAddBlock(type),
                    }))
                  );
                }}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 20,
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <Icon name="add" size={18} color={theme.colors.primaryText} />
                <Text
                  style={{
                    color: theme.colors.primaryText,
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 4,
                  }}
                >
                  Add Block
                </Text>
              </TouchableOpacity>
            </View>

            {blocks.length === 0 ? (
              <View
                style={{
                  padding: 24,
                  alignItems: "center",
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                }}
              >
                <Icon name="auto-awesome" size={48} color={theme.colors.textTertiary} />
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginTop: 12,
                    textAlign: "center",
                  }}
                >
                  No blocks yet. Add blocks to build your pipeline.
                </Text>
              </View>
            ) : (
              <View>
                {blocks.map((block, index) => (
                  <View key={index} style={{ marginBottom: 12 }}>
                    <View
                      style={{
                        backgroundColor: theme.colors.surface,
                        borderRadius: 12,
                        padding: 12,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 12,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", flex: 1 }}>
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
                          <Text
                            style={{
                              fontSize: 16,
                              fontWeight: "600",
                              color: theme.colors.text,
                              fontFamily: "Poppins",
                            }}
                          >
                            {getBlockName(block.type)}
                          </Text>
                        </View>
                        {blocks.length > 1 && (
                          <TouchableOpacity
                            onPress={() => handleRemoveBlock(index)}
                            style={{ padding: 4 }}
                          >
                            <Icon name="delete" size={20} color={theme.colors.error} />
                          </TouchableOpacity>
                        )}
                      </View>

                      {/* Block-specific config */}
                      {block.type === "input" && (
                        <TextInput
                          style={{
                            backgroundColor: theme.colors.card,
                            borderRadius: 8,
                            padding: 10,
                            color: theme.colors.text,
                            fontFamily: "Poppins",
                            fontSize: 14,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                          }}
                          placeholder="Placeholder text"
                          placeholderTextColor={theme.colors.textTertiary}
                          value={block.config.placeholder || ""}
                          onChangeText={(text) =>
                            handleUpdateBlockConfig(index, "placeholder", text)
                          }
                        />
                      )}

                      {block.type === "llm" && (
                        <View>
                          <TextInput
                            style={{
                              backgroundColor: theme.colors.card,
                              borderRadius: 8,
                              padding: 10,
                              minHeight: 80,
                              color: theme.colors.text,
                              fontFamily: "Poppins",
                              fontSize: 14,
                              textAlignVertical: "top",
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                              marginBottom: 8,
                            }}
                            placeholder="Prompt template"
                            placeholderTextColor={theme.colors.textTertiary}
                            value={block.config.prompt || ""}
                            onChangeText={(text) =>
                              handleUpdateBlockConfig(index, "prompt", text)
                            }
                            multiline
                          />
                          <TextInput
                            style={{
                              backgroundColor: theme.colors.card,
                              borderRadius: 8,
                              padding: 10,
                              color: theme.colors.text,
                              fontFamily: "Poppins",
                              fontSize: 14,
                              borderWidth: 1,
                              borderColor: theme.colors.border,
                            }}
                            placeholder="Max tokens (e.g., 200)"
                            placeholderTextColor={theme.colors.textTertiary}
                            value={block.config.maxTokens?.toString() || ""}
                            onChangeText={(text) => {
                              const num = parseInt(text, 10);
                              if (!isNaN(num) || text === "") {
                                handleUpdateBlockConfig(index, "maxTokens", text === "" ? undefined : num);
                              }
                            }}
                            keyboardType="numeric"
                          />
                        </View>
                      )}

                      {block.type === "codelib" && (
                        <TouchableOpacity
                          onPress={() => handleOpenCodeLibSelector(index)}
                          style={{
                            backgroundColor: theme.colors.card,
                            borderRadius: 8,
                            padding: 12,
                            borderWidth: 1,
                            borderColor: theme.colors.border,
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 14,
                              color: block.config.codelibId
                                ? theme.colors.text
                                : theme.colors.textTertiary,
                              fontFamily: "Poppins",
                            }}
                          >
                            {block.config.codelibId
                              ? codeLibFunctions.find((f) => f.id === block.config.codelibId)?.name ||
                                block.config.codelibId
                              : "Select CodeLib function"}
                          </Text>
                          <Icon name="arrow-forward" size={20} color={theme.colors.textSecondary} />
                        </TouchableOpacity>
                      )}

                      {block.type === "output" && (
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                          {(["plain", "bullets", "checklist", "json"] as const).map((format) => (
                            <TouchableOpacity
                              key={format}
                              onPress={() => handleUpdateBlockConfig(index, "format", format)}
                              style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 20,
                                backgroundColor:
                                  block.config.format === format
                                    ? theme.colors.primary
                                    : theme.colors.surface,
                                borderWidth: 1,
                                borderColor:
                                  block.config.format === format
                                    ? theme.colors.primary
                                    : theme.colors.border,
                              }}
                            >
                              <Text
                                style={{
                                  color:
                                    block.config.format === format
                                      ? theme.colors.primaryText
                                      : theme.colors.text,
                                  fontSize: 12,
                                  fontWeight: block.config.format === format ? "600" : "500",
                                  fontFamily: "Poppins",
                                  textTransform: "capitalize",
                                }}
                              >
                                {format}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {index < blocks.length - 1 && (
                        <View
                          style={{
                            alignItems: "center",
                            marginTop: 8,
                          }}
                        >
                          <Icon name="arrow-downward" size={24} color={theme.colors.textTertiary} />
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>

          {/* Test button */}
          {onTest && blocks.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                const validationError = validatePipeline();
                if (validationError) {
                  showAlert("Invalid Pipeline", validationError, [{ text: "OK" }]);
                  return;
                }
                const skill: Skill = {
                  id: generateSkillId(),
                  name: name.trim() || "Test Skill",
                  description: description.trim() || "",
                  category: category.trim() || undefined,
                  iconKey: iconKey || undefined,
                  isPinned: false,
                  isBuiltIn: false,
                  blocks,
                  defaultModelId: defaultModelId.trim() || undefined,
                  defaultPersonaId: defaultPersonaId.trim() || undefined,
                  createdAt: Date.now(),
                };
                onTest(skill);
              }}
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 24,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Icon name="play-arrow" size={24} color="#fff" />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                  marginLeft: 8,
                }}
              >
                Test Skill
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* CodeLib Selector Modal */}
      <Modal
        visible={showCodeLibSelector}
        transparent={true}
        animationType="slide"
        onRequestClose={() => {
          setShowCodeLibSelector(false);
          setSelectedBlockIndex(null);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: theme.colors.card,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              padding: 20,
              maxHeight: "80%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
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
                Select CodeLib Function
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setShowCodeLibSelector(false);
                  setSelectedBlockIndex(null);
                }}
              >
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView>
              {codeLibFunctions.map((func) => (
                <TouchableOpacity
                  key={func.id}
                  onPress={() => handleSelectCodeLib(func.id)}
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
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
                      marginBottom: 4,
                    }}
                  >
                    {func.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                    }}
                  >
                    {func.description}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

