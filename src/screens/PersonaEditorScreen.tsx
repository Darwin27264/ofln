/**
 * PersonaEditorScreen Component
 * 
 * Screen for creating and editing personas with structured sections.
 * Handles validation, saving, and cancellation.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Switch,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  savePersona,
  generatePersonaId,
  Persona,
  updatePersonaLastUsed,
} from "../services/personaService";

interface PersonaEditorScreenProps {
  persona?: Persona | null; // If provided, edit mode; otherwise, create mode
  onSave: (persona: Persona) => void;
  onCancel: () => void;
}

export default function PersonaEditorScreen({
  persona,
  onSave,
  onCancel,
}: PersonaEditorScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const isEditMode = !!persona;

  // Form state
  const [name, setName] = useState<string>("");
  const [tagline, setTagline] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  
  // Roleplay Definition
  const [identity, setIdentity] = useState<string>("");
  const [backstory, setBackstory] = useState<string>("");
  const [speakingStyle, setSpeakingStyle] = useState<string>("");
  
  // Boundaries
  const [boundaries, setBoundaries] = useState<string>("");
  const [breakCharacterEnabled, setBreakCharacterEnabled] = useState<boolean>(false);
  const [breakCharacterWhen, setBreakCharacterWhen] = useState<string>("");
  
  // Examples
  const [examples, setExamples] = useState<Array<{ user: string; persona: string }>>([]);
  
  // Model settings
  const [personaStrength, setPersonaStrength] = useState<"low" | "medium" | "high">("medium");

  // Load persona data if editing
  useEffect(() => {
    if (persona) {
      setName(persona.name || "");
      setTagline(persona.tagline || "");
      setTags(persona.tags?.join(", ") || "");
      setAvatar(persona.avatar || "");
      setIdentity(persona.identity || "");
      setBackstory(persona.backstory || "");
      setSpeakingStyle(persona.speakingStyle || "");
      setBoundaries(persona.boundaries || "");
      setBreakCharacterWhen(persona.breakCharacterWhen || "");
      setBreakCharacterEnabled(!!persona.breakCharacterWhen);
      setExamples(persona.examples || []);
      setPersonaStrength(persona.personaStrength || "medium");
    }
  }, [persona]);

  const handleAddExample = useCallback(() => {
    setExamples([...examples, { user: "", persona: "" }]);
  }, [examples]);

  const handleRemoveExample = useCallback(
    (index: number) => {
      setExamples(examples.filter((_, i) => i !== index));
    },
    [examples]
  );

  const handleUpdateExample = useCallback(
    (index: number, field: "user" | "persona", value: string) => {
      const updated = [...examples];
      updated[index] = { ...updated[index], [field]: value };
      setExamples(updated);
    },
    [examples]
  );

  const handleSave = useCallback(() => {
    // Validation
    if (!name.trim()) {
      showAlert("Validation Error", "Name is required.", [{ text: "OK" }]);
      return;
    }

    // Parse tags
    const parsedTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    // Create persona object
    const personaData: Persona = {
      id: persona?.id || generatePersonaId(),
      name: name.trim(),
      tagline: tagline.trim(),
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      avatar: avatar.trim() || undefined,
      identity: identity.trim() || undefined,
      backstory: backstory.trim() || undefined,
      speakingStyle: speakingStyle.trim() || undefined,
      boundaries: boundaries.trim() || undefined,
      breakCharacterWhen: breakCharacterEnabled && breakCharacterWhen.trim() ? breakCharacterWhen.trim() : undefined,
      examples: examples.filter((ex) => ex.user.trim() || ex.persona.trim()).length > 0
        ? examples.filter((ex) => ex.user.trim() || ex.persona.trim())
        : undefined,
      personaStrength,
      createdAt: persona?.createdAt || Date.now(),
      lastUsed: persona?.lastUsed,
    };

    // Save to storage
    savePersona(personaData)
      .then(() => {
        onSave(personaData);
      })
      .catch((error) => {
        console.error("Error saving persona:", error);
        showAlert("Error", "Failed to save persona.", [{ text: "OK" }]);
      });
  }, [
    name,
    tagline,
    tags,
    avatar,
    identity,
    backstory,
    speakingStyle,
    boundaries,
    breakCharacterEnabled,
    breakCharacterWhen,
    examples,
    personaStrength,
    persona,
    onSave,
  ]);

  const renderSection = (
    title: string,
    children: React.ReactNode,
    icon?: string
  ) => (
    <View style={{ marginBottom: 24 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        {icon && (
          <Icon
            name={icon}
            size={20}
            color={theme.colors.text}
            style={{ marginRight: 8 }}
          />
        )}
        <Text
          style={{
            fontSize: 18,
            fontWeight: "600",
            color: theme.colors.text,
            fontFamily: "Poppins",
          }}
        >
          {title}
        </Text>
      </View>
      {children}
    </View>
  );

  return (
    <View style={[styles.container, { flex: 1, backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 20,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
        }}
      >
        <TouchableOpacity onPress={onCancel} style={{ padding: 8 }}>
          <Ionicons name="close" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <Text
          style={{
            fontSize: 20,
            fontWeight: "600",
            color: theme.colors.text,
            fontFamily: "Poppins",
          }}
        >
          {isEditMode ? "Edit Persona" : "Create Persona"}
        </Text>
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

      {/* Content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={true}
      >
        {/* Basics Section */}
        {renderSection("Basics", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Name <Text style={{ color: theme.colors.error }}>*</Text>
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
                value={name}
                onChangeText={setName}
                placeholder="Enter persona name..."
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Tagline
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
                value={tagline}
                onChangeText={setTagline}
                placeholder="Short one-liner description..."
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Tags
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
                value={tags}
                onChangeText={setTags}
                placeholder="Comma-separated tags (e.g., Cozy, RPG, Formal)"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Avatar (Icon name)
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
                value={avatar}
                onChangeText={setAvatar}
                placeholder="Optional: icon name (e.g., person, star)"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>
          </>
        ), "info")}

        {/* Roleplay Definition Section */}
        {renderSection("Roleplay Definition", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Identity / Role
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  minHeight: 80,
                  textAlignVertical: "top",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                value={identity}
                onChangeText={setIdentity}
                placeholder="Who is this persona? What is their role?"
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Backstory / Context
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
                value={backstory}
                onChangeText={setBackstory}
                placeholder="Background information, history, context..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Speaking Style
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
                value={speakingStyle}
                onChangeText={setSpeakingStyle}
                placeholder="How does this persona speak? Tone, vocabulary, style..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>
          </>
        ), "face")}

        {/* Boundaries Section */}
        {renderSection("Boundaries", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: "500",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 8,
                }}
              >
                Won't Do
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                  minHeight: 80,
                  textAlignVertical: "top",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
                value={boundaries}
                onChangeText={setBoundaries}
                placeholder="What this persona won't do or discuss..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: "500",
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                  }}
                >
                  Break Character When...
                </Text>
                <Switch
                  value={breakCharacterEnabled}
                  onValueChange={setBreakCharacterEnabled}
                  trackColor={{
                    false: theme.colors.surface,
                    true: theme.colors.primary,
                  }}
                  thumbColor={theme.colors.primaryText}
                />
              </View>
              {breakCharacterEnabled && (
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
                  value={breakCharacterWhen}
                  onChangeText={setBreakCharacterWhen}
                  placeholder="When should the persona break character?"
                  placeholderTextColor={theme.colors.textTertiary}
                />
              )}
            </View>
          </>
        ), "block")}

        {/* Examples Section */}
        {renderSection("Examples (Few-shot)", (
          <>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Add example conversations to guide the persona's responses.
            </Text>
            {examples.map((example, index) => (
              <View
                key={index}
                style={{
                  backgroundColor: theme.colors.surface,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 12,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                    }}
                  >
                    Example {index + 1}
                  </Text>
                  <TouchableOpacity onPress={() => handleRemoveExample(index)}>
                    <Icon name="delete" size={20} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: 8,
                    padding: 10,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    marginBottom: 8,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  value={example.user}
                  onChangeText={(text) => handleUpdateExample(index, "user", text)}
                  placeholder="User message..."
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <TextInput
                  style={{
                    backgroundColor: theme.colors.card,
                    borderRadius: 8,
                    padding: 10,
                    color: theme.colors.text,
                    fontFamily: "Poppins",
                    fontSize: 14,
                    minHeight: 60,
                    textAlignVertical: "top",
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                  value={example.persona}
                  onChangeText={(text) => handleUpdateExample(index, "persona", text)}
                  placeholder="Persona reply..."
                  placeholderTextColor={theme.colors.textTertiary}
                  multiline
                />
              </View>
            ))}
            <TouchableOpacity
              onPress={handleAddExample}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 12,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderStyle: "dashed",
              }}
            >
              <Icon name="add" size={20} color={theme.colors.textSecondary} />
              <Text
                style={{
                  color: theme.colors.textSecondary,
                  fontSize: 14,
                  fontFamily: "Poppins",
                  marginLeft: 8,
                }}
              >
                Add Example
              </Text>
            </TouchableOpacity>
          </>
        ), "format-list-bulleted")}

        {/* Model Settings Section */}
        {renderSection("Model Settings", (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: "500",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Persona Strength
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["low", "medium", "high"] as const).map((strength) => (
                <TouchableOpacity
                  key={strength}
                  onPress={() => setPersonaStrength(strength)}
                  style={{
                    flex: 1,
                    backgroundColor:
                      personaStrength === strength
                        ? theme.colors.primary
                        : theme.colors.surface,
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    alignItems: "center",
                    borderWidth: 1,
                    borderColor:
                      personaStrength === strength
                        ? theme.colors.primary
                        : theme.colors.border,
                  }}
                >
                  <Text
                    style={{
                      color:
                        personaStrength === strength
                          ? theme.colors.primaryText
                          : theme.colors.text,
                      fontSize: 14,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                      textTransform: "capitalize",
                    }}
                  >
                    {strength}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                marginTop: 8,
              }}
            >
              Low: style only | Medium: style + identity + boundaries | High: includes examples
            </Text>
          </View>
        ), "tune")}
      </ScrollView>
    </View>
  );
}

