/**
 * CodeLibEditorScreen Component
 * 
 * Screen for creating and editing CodeLib functions.
 * Includes test harness for testing transforms.
 */

import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  CodeLibFunction,
  CodeLibType,
  CodeLibContract,
  saveCodeLibFunction,
  generateCodeLibId,
  testCodeLibFunction,
} from "../services/codelibService";

interface CodeLibEditorScreenProps {
  function: CodeLibFunction | null; // null = create mode
  onSave: (func: CodeLibFunction) => void;
  onCancel: () => void;
}

export default function CodeLibEditorScreen({
  function: existingFunction,
  onSave,
  onCancel,
}: CodeLibEditorScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const isEditMode = existingFunction !== null;

  // Form state
  const [name, setName] = useState<string>(existingFunction?.name || "");
  const [description, setDescription] = useState<string>(existingFunction?.description || "");
  const [type, setType] = useState<CodeLibType>(existingFunction?.type || "utility");
  const [contract, setContract] = useState<CodeLibContract>(
    existingFunction?.contract || "text→text"
  );

  // Transform config state
  const [regexPattern, setRegexPattern] = useState<string>("");
  const [regexReplacement, setRegexReplacement] = useState<string>("");
  const [lineOperations, setLineOperations] = useState<Array<"trim" | "dedupe" | "sort">>([]);
  const [prefix, setPrefix] = useState<string>(existingFunction?.transform.config.prefix || "");
  const [suffix, setSuffix] = useState<string>(existingFunction?.transform.config.suffix || "");
  const [maxLength, setMaxLength] = useState<string>(
    existingFunction?.transform.config.maxLength?.toString() || ""
  );

  // Test harness state
  const [testInput, setTestInput] = useState<string>("Sample input text\nLine 2\nLine 3");
  const [testOutput, setTestOutput] = useState<string>("");
  const [testError, setTestError] = useState<string>("");
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Initialize from existing function
  useEffect(() => {
    if (existingFunction) {
      setName(existingFunction.name);
      setDescription(existingFunction.description);
      setType(existingFunction.type);
      setContract(existingFunction.contract);
      setPrefix(existingFunction.transform.config.prefix || "");
      setSuffix(existingFunction.transform.config.suffix || "");
      setMaxLength(existingFunction.transform.config.maxLength?.toString() || "");
      setLineOperations(existingFunction.transform.config.lineOperations || []);
      if (
        existingFunction.transform.config.regexReplacements &&
        existingFunction.transform.config.regexReplacements.length > 0
      ) {
        const first = existingFunction.transform.config.regexReplacements[0];
        setRegexPattern(first.pattern);
        setRegexReplacement(first.replacement);
      }
    }
  }, [existingFunction]);

  const handleToggleLineOperation = useCallback(
    (op: "trim" | "dedupe" | "sort") => {
      setLineOperations((prev) =>
        prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op]
      );
    },
    []
  );

  const handleTest = useCallback(() => {
    if (!testInput.trim()) {
      showAlert("Input Required", "Please enter test input.", [{ text: "OK" }]);
      return;
    }

    setIsTesting(true);
    setTestError("");
    setTestOutput("");

    try {
      // Create a temporary function for testing
      const testFunction: CodeLibFunction = {
        id: "test",
        name: name || "Test Function",
        description: description || "",
        type,
        contract,
        transform: {
          type: "template",
          config: {
            ...(regexPattern && regexReplacement
              ? {
                  regexReplacements: [
                    {
                      pattern: regexPattern,
                      replacement: regexReplacement,
                      flags: "g",
                    },
                  ],
                }
              : {}),
            ...(lineOperations.length > 0 ? { lineOperations } : {}),
            ...(prefix ? { prefix } : {}),
            ...(suffix ? { suffix } : {}),
            ...(maxLength ? { maxLength: parseInt(maxLength, 10) } : {}),
          },
        },
        isBuiltIn: false,
        createdAt: Date.now(),
      };

      const result = testCodeLibFunction(testFunction, testInput);
      if (result.error) {
        setTestError(result.error);
      } else {
        setTestOutput(result.output);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setTestError(errorMessage);
    } finally {
      setIsTesting(false);
    }
  }, [
    testInput,
    name,
    description,
    type,
    contract,
    regexPattern,
    regexReplacement,
    lineOperations,
    prefix,
    suffix,
    maxLength,
  ]);

  const handleSave = useCallback(() => {
    if (!name.trim()) {
      showAlert("Name Required", "Please enter a function name.", [{ text: "OK" }]);
      return;
    }

    if (!description.trim()) {
      showAlert("Description Required", "Please enter a description.", [{ text: "OK" }]);
      return;
    }

    const func: CodeLibFunction = {
      id: existingFunction?.id || generateCodeLibId(),
      name: name.trim(),
      description: description.trim(),
      type,
      contract,
      transform: {
        type: "template",
        config: {
          ...(regexPattern && regexReplacement
            ? {
                regexReplacements: [
                  {
                    pattern: regexPattern,
                    replacement: regexReplacement,
                    flags: "g",
                  },
                ],
              }
            : {}),
          ...(lineOperations.length > 0 ? { lineOperations } : {}),
          ...(prefix ? { prefix } : {}),
          ...(suffix ? { suffix } : {}),
          ...(maxLength ? { maxLength: parseInt(maxLength, 10) } : {}),
        },
      },
      isBuiltIn: existingFunction?.isBuiltIn || false,
      createdAt: existingFunction?.createdAt || Date.now(),
      lastUsed: existingFunction?.lastUsed,
    };

    onSave(func);
  }, [
    name,
    description,
    type,
    contract,
    regexPattern,
    regexReplacement,
    lineOperations,
    prefix,
    suffix,
    maxLength,
    existingFunction,
    onSave,
  ]);

  const typeOptions: CodeLibType[] = ["formatter", "utility", "validator", "extractor"];
  const contractOptions: CodeLibContract[] = ["text→text", "text→checklist", "text→json"];

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
              {isEditMode ? "Edit Function" : "Create Function"}
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
          {/* Basic Info */}
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
              Basic Info
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
                placeholder="Function name"
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
                placeholder="What does this function do?"
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
                Type
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {typeOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setType(option)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      backgroundColor: type === option ? theme.colors.primary : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: type === option ? theme.colors.primary : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: type === option ? theme.colors.primaryText : theme.colors.text,
                        fontSize: 14,
                        fontWeight: type === option ? "600" : "500",
                        fontFamily: "Poppins",
                        textTransform: "capitalize",
                      }}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Input → Output Contract
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {contractOptions.map((option) => (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setContract(option)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      backgroundColor:
                        contract === option ? theme.colors.accent : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: contract === option ? theme.colors.accent : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: contract === option ? "#fff" : theme.colors.text,
                        fontSize: 14,
                        fontWeight: contract === option ? "600" : "500",
                        fontFamily: "Poppins",
                      }}
                    >
                      {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Transform Config */}
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
              Transform Configuration
            </Text>

            {/* Line Operations */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Line Operations
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(["trim", "dedupe", "sort"] as const).map((op) => (
                  <TouchableOpacity
                    key={op}
                    onPress={() => handleToggleLineOperation(op)}
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderRadius: 20,
                      backgroundColor: lineOperations.includes(op)
                        ? theme.colors.primary
                        : theme.colors.surface,
                      borderWidth: 1,
                      borderColor: lineOperations.includes(op)
                        ? theme.colors.primary
                        : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: lineOperations.includes(op)
                          ? theme.colors.primaryText
                          : theme.colors.text,
                        fontSize: 14,
                        fontWeight: lineOperations.includes(op) ? "600" : "500",
                        fontFamily: "Poppins",
                        textTransform: "capitalize",
                      }}
                    >
                      {op}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Prefix/Suffix */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Prefix / Suffix
              </Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  placeholder="Prefix"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={prefix}
                  onChangeText={setPrefix}
                />
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  placeholder="Suffix"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={suffix}
                  onChangeText={setSuffix}
                />
              </View>
            </View>

            {/* Max Length */}
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Max Length (optional)
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
                placeholder="e.g., 500"
                placeholderTextColor={theme.colors.textTertiary}
                value={maxLength}
                onChangeText={setMaxLength}
                keyboardType="numeric"
              />
            </View>

            {/* Advanced Options */}
            <TouchableOpacity
              onPress={() => setShowAdvanced(!showAdvanced)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: showAdvanced ? 16 : 0,
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
                Advanced Options
              </Text>
              <Icon
                name={showAdvanced ? "expand-less" : "expand-more"}
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>

            {showAdvanced && (
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginBottom: 8,
                  }}
                >
                  Regex Find/Replace
                </Text>
                <TextInput
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    marginBottom: 8,
                  }}
                  placeholder="Pattern (regex)"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={regexPattern}
                  onChangeText={setRegexPattern}
                />
                <TextInput
                  style={{
                    backgroundColor: theme.colors.surface,
                    borderRadius: 12,
                    padding: 12,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  placeholder="Replacement"
                  placeholderTextColor={theme.colors.textTertiary}
                  value={regexReplacement}
                  onChangeText={setRegexReplacement}
                />
              </View>
            )}
          </View>

          {/* Test Harness */}
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
              Test Harness
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
                Sample Input
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 100,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 14,
                  textAlignVertical: "top",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                placeholder="Enter test input..."
                placeholderTextColor={theme.colors.textTertiary}
                value={testInput}
                onChangeText={setTestInput}
                multiline
              />
            </View>

            <TouchableOpacity
              onPress={handleTest}
              disabled={isTesting || !testInput.trim()}
              style={{
                backgroundColor: isTesting || !testInput.trim() ? theme.colors.surface : theme.colors.accent,
                borderRadius: 12,
                paddingVertical: 14,
                paddingHorizontal: 24,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
                opacity: isTesting || !testInput.trim() ? 0.6 : 1,
              }}
            >
              {isTesting ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.text} style={{ marginRight: 8 }} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 16,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                    }}
                  >
                    Testing...
                  </Text>
                </>
              ) : (
                <>
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
                    Run Test
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {testError && (
              <View
                style={{
                  backgroundColor: theme.colors.error + "20",
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  borderWidth: 1,
                  borderColor: theme.colors.error,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.error,
                    fontSize: 14,
                    fontFamily: "Poppins",
                  }}
                >
                  Error: {testError}
                </Text>
              </View>
            )}

            {testOutput && (
              <View>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginBottom: 8,
                  }}
                >
                  Output
                </Text>
                <ScrollView
                  style={{
                    maxHeight: 200,
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
                      fontSize: 14,
                      lineHeight: 20,
                    }}
                  >
                    {testOutput}
                  </Text>
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

