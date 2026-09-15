/**
 * PersonasLibraryScreen Component
 * Main screen for managing personas with listing, creation, editing, duplication, and deletion.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  InteractionManager,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { PersonaCard } from "../components/PersonaCard";
import { FloatingBackButton } from "../components/FloatingBackButton";
import { BottomSheet } from "../components/BottomSheet";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import {
  getPersonas,
  ensureSamplePersonas,
  savePersona,
  removePersona,
  generatePersonaId,
  persistPersonaAvatar,
  Persona,
} from "../services/personaService";

interface PersonasLibraryScreenProps {
  onBack: () => void;
  onEditPersona?: (persona: Persona | null) => void; // null = create mode, Persona = edit mode
  onUsePersona?: (persona: Persona) => void; // Handler for "Use" button
  onBrowsePersonaModels?: () => void;
}

export default function PersonasLibraryScreen({
  onBack,
  onEditPersona,
  onUsePersona,
  onBrowsePersonaModels,
}: PersonasLibraryScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [infoOpen, setInfoOpen] = useState(false);

  const isInitialAnimationPhase = useRef(true);
  const animatedPersonaIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    isInitialAnimationPhase.current = true;
    animatedPersonaIds.current.clear();

    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        isInitialAnimationPhase.current = false;
      }, 800);
    });

    return () => {
      interaction.cancel();
      isInitialAnimationPhase.current = true;
      animatedPersonaIds.current.clear();
    };
  }, []);

  const loadPersonas = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedPersonas = await getPersonas();
      setPersonas(loadedPersonas);
    } catch (error) {
      console.error("Error loading personas:", error);
      showAlert("Error", "Failed to load personas.", [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const initializePersonas = async () => {
      await ensureSamplePersonas();
      await loadPersonas();
    };
    void initializePersonas();
  }, [loadPersonas]);

  const sortedPersonas = useMemo(() => {
    return [...personas].sort((a, b) => {
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed - a.lastUsed;
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [personas]);

  const handleAddPersona = useCallback(() => {
    if (onEditPersona) {
      onEditPersona(null);
    }
  }, [onEditPersona]);

  const handleEditPersona = useCallback(
    (persona: Persona) => {
      if (onEditPersona) {
        onEditPersona(persona);
      }
    },
    [onEditPersona]
  );

  const handleDuplicatePersona = useCallback(
    async (persona: Persona) => {
      try {
        const newId = generatePersonaId();
        let avatarUri = persona.avatarUri;
        if (avatarUri) {
          try {
            avatarUri = await persistPersonaAvatar(newId, avatarUri);
          } catch {
            avatarUri = undefined;
          }
        }
        const duplicated: Persona = {
          ...persona,
          id: newId,
          name: `${persona.name} (Copy)`,
          createdAt: Date.now(),
          lastUsed: undefined,
          avatarUri,
        };
        await savePersona(duplicated);
        loadPersonas();
      } catch (error) {
        console.error("Error duplicating persona:", error);
        showAlert("Error", "Failed to duplicate persona.", [{ text: "OK" }]);
      }
    },
    [loadPersonas]
  );

  const handleDeletePersona = useCallback(
    (persona: Persona) => {
      showAlert(
        "Delete Persona",
        `Are you sure you want to delete "${persona.name}"? This action cannot be undone.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await removePersona(persona.id);
                loadPersonas();
                if (expandedPersonaId === persona.id) {
                  setExpandedPersonaId(null);
                }
              } catch (error) {
                console.error("Error deleting persona:", error);
                showAlert("Error", "Failed to delete persona.", [{ text: "OK" }]);
              }
            },
          },
        ]
      );
    },
    [loadPersonas, expandedPersonaId]
  );

  const handleToggleExpand = useCallback((personaId: string) => {
    setExpandedPersonaId((current) => (current === personaId ? null : personaId));
  }, []);

  const renderPersonaCard = useCallback(
    (persona: Persona, index: number) => {
      const isExpanded = expandedPersonaId === persona.id;

      return (
        <PersonaCard
          key={persona.id}
          persona={persona}
          index={index}
          isExpanded={isExpanded}
          onToggleExpand={() => handleToggleExpand(persona.id)}
          onEdit={() => handleEditPersona(persona)}
          onDuplicate={() => handleDuplicatePersona(persona)}
          onDelete={() => handleDeletePersona(persona)}
          onUse={onUsePersona ? () => onUsePersona(persona) : undefined}
          isInitialAnimationPhase={isInitialAnimationPhase.current}
          animatedPersonaIds={animatedPersonaIds}
        />
      );
    },
    [expandedPersonaId, handleEditPersona, handleDuplicatePersona, handleDeletePersona, handleToggleExpand, onUsePersona]
  );

  const emptyStateContainerStyle = {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    paddingVertical: 60,
  };

  const emptyStateTitleStyle = {
    fontSize: 20,
    fontWeight: "600" as const,
    color: theme.colors.text,
    fontFamily: "Poppins",
    marginTop: 16,
    marginBottom: 8,
  };

  const emptyStateTextStyle = {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: "Poppins",
    textAlign: "center" as const,
    marginBottom: 24,
    paddingHorizontal: 40,
  };

  const emptyStateButtonStyle = {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 20,
  };

  const emptyStateButtonTextStyle = {
    color: theme.colors.primaryText,
    fontSize: 16,
    fontWeight: "600" as const,
    fontFamily: "Poppins",
  };

  const fixedBtnStyle = {
    position: "absolute" as const,
    bottom: backBottom,
    backgroundColor: "transparent" as const,
  };

  const handleShowPersonaInfo = useCallback(() => {
    setInfoOpen(true);
  }, []);

  const handleBrowsePersonaModels = useCallback(() => {
    setInfoOpen(false);
    onBrowsePersonaModels?.();
  }, [onBrowsePersonaModels]);

  const pillButtonStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  };

  const iconPillStyle = {
    ...pillButtonStyle,
    paddingHorizontal: 12,
    minWidth: 42,
    minHeight: 42,
  };

  return (
      <View style={[styles.container, { padding: 20, flex: 1, backgroundColor: theme.colors.background }]}>
      <Text style={styles.settingsTitle}>Personas</Text>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
      >
        {!isLoading && sortedPersonas.length === 0 && (
          <View style={emptyStateContainerStyle}>
            <Icon name="person-outline" size={64} color={theme.colors.textTertiary} />
            <Text style={emptyStateTitleStyle}>No personas yet</Text>
            <Text style={emptyStateTextStyle}>
              Personas change how the model roleplays in chat.
            </Text>
            <TouchableOpacity onPress={handleAddPersona} style={emptyStateButtonStyle}>
              <Text style={emptyStateButtonTextStyle}>Create a persona</Text>
            </TouchableOpacity>
          </View>
        )}

        {sortedPersonas.length > 0 && (
          <View>
            {sortedPersonas.map((persona, index) => renderPersonaCard(persona, index))}
          </View>
        )}
      </ScrollView>

      <View style={[fixedBtnStyle, { left: 15 }]}>
        <FloatingBackButton onPress={onBack} />
      </View>

      <View
        style={[
          fixedBtnStyle,
          {
            right: 15,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleShowPersonaInfo}
          style={iconPillStyle}
          accessibilityLabel="How personas work"
          accessibilityHint="Explains personas and links to recommended models"
        >
          <Ionicons
            name="information"
            size={24}
            color={theme.colors.primaryText}
          />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleAddPersona}
          style={iconPillStyle}
          accessibilityLabel="Add persona"
        >
          <Ionicons name="add-outline" size={23} color={theme.colors.primaryText} />
        </TouchableOpacity>
      </View>

      <BottomSheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title="How personas work"
        subtitle="Character prompts for chat"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
            marginBottom: 16,
          }}
        >
          Sets identity, style, and boundaries in the system prompt. Tap Use here or
          in the chat model sheet. Strength controls how much detail is added.
        </Text>

        <TouchableOpacity
          onPress={handleBrowsePersonaModels}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 12,
            paddingVertical: 13,
            paddingHorizontal: 14,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
          }}
          accessibilityLabel="Browse persona models"
          accessibilityHint="Opens Models with the Personas tab selected"
        >
          <Ionicons
            name="arrow-forward-circle-outline"
            size={20}
            color={theme.colors.primaryText}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 15,
              fontWeight: "600",
              fontFamily: "Poppins",
            }}
          >
            Browse persona models
          </Text>
        </TouchableOpacity>
      </BottomSheet>
    </View>
  );
}

