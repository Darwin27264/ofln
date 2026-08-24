/**
 * PersonaEditorScreen Component
 * 
 * Screen for creating and editing personas with structured sections.
 * Handles validation, saving, and cancellation.
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { launchImageLibrary } from "react-native-image-picker";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { useScrollPadForFloatingBack } from "../utils/layoutInsets";
import {
  savePersona,
  generatePersonaId,
  persistPersonaAvatar,
  deletePersonaAvatar,
  Persona,
} from "../services/personaService";
import { IMAGE_PICKER_OPTIONS } from "../services/mediaNormalizeService";
import { PersonaAvatar } from "../components/PersonaAvatar";

interface PersonaEditorScreenProps {
  persona?: Persona | null;
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
  const scrollPadBottom = useScrollPadForFloatingBack();

  const isEditMode = !!persona;
  // Stable id so a newly picked photo can be persisted before first save.
  const [personaId] = useState(() => persona?.id || generatePersonaId());

  const [name, setName] = useState<string>("");
  const [tagline, setTagline] = useState<string>("");
  const [tags, setTags] = useState<string>("");
  const [avatar, setAvatar] = useState<string>("");
  const [avatarUri, setAvatarUri] = useState<string>("");
  const [identity, setIdentity] = useState<string>("");
  const [backstory, setBackstory] = useState<string>("");
  const [speakingStyle, setSpeakingStyle] = useState<string>("");
  const [boundaries, setBoundaries] = useState<string>("");
  const [breakCharacterEnabled, setBreakCharacterEnabled] = useState<boolean>(false);
  const [breakCharacterWhen, setBreakCharacterWhen] = useState<string>("");
  const [examples, setExamples] = useState<Array<{ user: string; persona: string }>>([]);
  const [personaStrength, setPersonaStrength] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (persona) {
      setName(persona.name || "");
      setTagline(persona.tagline || "");
      setTags(persona.tags?.join(", ") || "");
      setAvatar(persona.avatar || "");
      setAvatarUri(persona.avatarUri || "");
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

  const previewPersona = useMemo(
    () =>
      ({
        id: personaId,
        name: name || "Persona",
        tagline: tagline || "",
        createdAt: persona?.createdAt || Date.now(),
        avatar: avatar || undefined,
        avatarUri: avatarUri || undefined,
      }) as Persona,
    [personaId, name, tagline, persona?.createdAt, avatar, avatarUri]
  );

  const handlePickAvatar = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        ...IMAGE_PICKER_OPTIONS,
        maxWidth: 512,
        maxHeight: 512,
      });
      if (result.didCancel || !result.assets?.[0]?.uri) return;
      const uri = result.assets[0].uri;
      const persisted = await persistPersonaAvatar(personaId, uri);
      setAvatarUri(persisted);
    } catch (error) {
      console.error("Error picking persona avatar:", error);
      showAlert("Photo Failed", "Could not use that image. Try another photo.", [
        { text: "OK" },
      ]);
    }
  }, [personaId]);

  const handleClearAvatar = useCallback(async () => {
    setAvatarUri("");
    try {
      await deletePersonaAvatar(personaId);
    } catch {
      // ignore
    }
  }, [personaId]);

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
    if (!name.trim()) {
      showAlert("Validation Error", "Name is required.", [{ text: "OK" }]);
      return;
    }

    const parsedTags = tags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    const personaData: Persona = {
      id: personaId,
      name: name.trim(),
      tagline: tagline.trim(),
      tags: parsedTags.length > 0 ? parsedTags : undefined,
      avatar: avatar.trim() || undefined,
      avatarUri: avatarUri.trim() || undefined,
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

    savePersona(personaData)
      .then(async () => {
        try {
          const { getPersonas } = await import("../services/personaService");
          const allPersonas = await getPersonas();
          const savedPersona = allPersonas.find(p => p.id === personaData.id);
          
          if (!savedPersona) {
            throw new Error("Persona was not found after saving");
          }
          
          onSave(personaData);
        } catch (verifyError) {
          console.error("Error verifying saved persona:", verifyError);
          onSave(personaData);
        }
      })
      .catch((error) => {
        console.error("Error saving persona:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        showAlert(
          "Save Failed", 
          `Failed to save persona: ${errorMessage}. Please try again.`, 
          [{ text: "OK" }]
        );
      });
  }, [
    name,
    tagline,
    tags,
    avatar,
    avatarUri,
    identity,
    backstory,
    speakingStyle,
    boundaries,
    breakCharacterEnabled,
    breakCharacterWhen,
    examples,
    personaStrength,
    persona,
    personaId,
    onSave,
  ]);

  const sectionContainerStyle = { marginBottom: 24 };
  const sectionHeaderStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 12,
  };
  const sectionTitleStyle = {
    fontSize: 18,
    fontWeight: "600" as const,
    color: theme.colors.text,
    fontFamily: "Poppins",
  };
  const fieldLabelStyle = {
    fontSize: 14,
    fontWeight: "500" as const,
    color: theme.colors.text,
    fontFamily: "Poppins",
    marginBottom: 8,
  };
  const inputBaseStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 12,
    color: theme.colors.text,
    fontFamily: "Poppins",
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };
  const multilineInputStyle = {
    ...inputBaseStyle,
    minHeight: 80,
    textAlignVertical: "top" as const,
  };
  const largeMultilineInputStyle = {
    ...inputBaseStyle,
    minHeight: 100,
    textAlignVertical: "top" as const,
  };

  const renderSection = (
    title: string,
    children: React.ReactNode,
    icon?: string
  ) => (
    <View style={sectionContainerStyle}>
      <View style={sectionHeaderStyle}>
        {icon && (
          <Icon
            name={icon}
            size={20}
            color={theme.colors.text}
            style={{ marginRight: 8 }}
          />
        )}
        <Text style={sectionTitleStyle}>{title}</Text>
      </View>
      {children}
    </View>
  );

  return (
    <View style={[styles.container, { flex: 1, backgroundColor: theme.colors.background }]}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 8,
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

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 20, paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={true}
      >
        {renderSection("Basics", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>
                Name <Text style={{ color: theme.colors.error }}>*</Text>
              </Text>
              <TextInput
                style={inputBaseStyle}
                value={name}
                onChangeText={setName}
                placeholder="Enter persona name..."
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Tagline</Text>
              <TextInput
                style={inputBaseStyle}
                value={tagline}
                onChangeText={setTagline}
                placeholder="Short one-liner description..."
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Tags</Text>
              <TextInput
                style={inputBaseStyle}
                value={tags}
                onChangeText={setTags}
                placeholder="Comma-separated tags (e.g., Cozy, RPG, Formal)"
                placeholderTextColor={theme.colors.textTertiary}
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Profile picture</Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <PersonaAvatar
                  persona={previewPersona}
                  size={72}
                  borderRadius={16}
                  backgroundColor={theme.colors.surface}
                  iconColor={theme.colors.text}
                />
                <View style={{ flex: 1, gap: 8 }}>
                  <TouchableOpacity
                    onPress={handlePickAvatar}
                    style={{
                      backgroundColor: theme.colors.primary,
                      paddingVertical: 10,
                      paddingHorizontal: 14,
                      borderRadius: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="photo-library" size={18} color={theme.colors.primaryText} />
                    <Text
                      style={{
                        color: theme.colors.primaryText,
                        fontSize: 14,
                        fontWeight: "600",
                        fontFamily: "Poppins",
                        marginLeft: 8,
                      }}
                    >
                      {avatarUri ? "Change photo" : "Choose photo"}
                    </Text>
                  </TouchableOpacity>
                  {!!avatarUri && (
                    <TouchableOpacity
                      onPress={handleClearAvatar}
                      style={{
                        paddingVertical: 8,
                        paddingHorizontal: 14,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: theme.colors.border,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: theme.colors.textSecondary,
                          fontSize: 13,
                          fontFamily: "Poppins",
                        }}
                      >
                        Remove photo
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
              <Text
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  color: theme.colors.textTertiary,
                  fontFamily: "Poppins",
                }}
              >
                Optional. Shown on cards and in the chat selector.
              </Text>
            </View>
          </>
        ), "info")}

        {renderSection("Roleplay Definition", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Identity / Role</Text>
              <TextInput
                style={multilineInputStyle}
                value={identity}
                onChangeText={setIdentity}
                placeholder="Who is this persona? What is their role?"
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Backstory / Context</Text>
              <TextInput
                style={largeMultilineInputStyle}
                value={backstory}
                onChangeText={setBackstory}
                placeholder="Background information, history, context..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>

            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Speaking Style</Text>
              <TextInput
                style={largeMultilineInputStyle}
                value={speakingStyle}
                onChangeText={setSpeakingStyle}
                placeholder="How does this persona speak? Tone, vocabulary, style..."
                placeholderTextColor={theme.colors.textTertiary}
                multiline
              />
            </View>
          </>
        ), "face")}

        {renderSection("Boundaries", (
          <>
            <View style={{ marginBottom: 16 }}>
              <Text style={fieldLabelStyle}>Won't Do</Text>
              <TextInput
                style={multilineInputStyle}
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
                  flexDirection: "row" as const,
                  alignItems: "center" as const,
                  justifyContent: "space-between" as const,
                  marginBottom: 8,
                }}
              >
                <Text style={fieldLabelStyle}>Break Character When...</Text>
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
                  style={inputBaseStyle}
                  value={breakCharacterWhen}
                  onChangeText={setBreakCharacterWhen}
                  placeholder="When should the persona break character?"
                  placeholderTextColor={theme.colors.textTertiary}
                />
              )}
            </View>
          </>
        ), "block")}

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
              Add examples to guide how this persona replies.
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

        {renderSection("Model Settings", (
          <View style={{ marginBottom: 16 }}>
            <Text style={fieldLabelStyle}>Persona Strength</Text>
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
              Low: style only | Medium: + identity + boundaries | High: + backstory + examples
            </Text>
          </View>
        ), "tune")}
      </ScrollView>
    </View>
  );
}

