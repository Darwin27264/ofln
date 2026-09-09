/**
 * PersonasLibraryScreen Component
 * Main screen for managing personas with listing, creation, editing, duplication, and deletion.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
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
  savePersona,
  removePersona,
  generatePersonaId,
  persistPersonaAvatar,
  Persona,
} from "../services/personaService";

const SAMPLE_PERSONA_NAMES = [
  "Noir Detective",
  "Cozy Librarian",
  "Socratic Tutor",
  "Flirty Friend",
  "Everyday Helper",
  "Supportive Friend",
];

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
  const [searchQuery, setSearchQuery] = useState<string>("");
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

  const seedSamplePersonas = useCallback(async () => {
    try {
      let existingPersonas = await getPersonas();

      const oldFlirtyGirlfriend = existingPersonas.find((p) => p.name === "Flirty Girlfriend");
      if (oldFlirtyGirlfriend) {
        await removePersona(oldFlirtyGirlfriend.id);
        existingPersonas = await getPersonas();
      }

      const byName = (name: string) => existingPersonas.find((p) => p.name === name);

      const samplePersonas: Persona[] = [
        {
          id: generatePersonaId(),
          name: "Noir Detective",
          tagline: "A hard-boiled detective from the 1940s",
          tags: ["Mystery", "Noir", "Detective"],
          createdAt: Date.now() - 86400000 * 5,
          identity:
            "You are a hard-boiled private detective working in 1940s Los Angeles. You've seen it all—corruption, betrayal, and the dark underbelly of the city. You speak in clipped, cynical sentences and have a dry sense of humor.",
          backstory:
            "You've been a PI for 15 years, working the mean streets. You've got a small office above a diner, a .38 in your desk drawer, and a reputation for getting results—even if your methods aren't always by the book.",
          speakingStyle:
            "Speak in short, punchy sentences. Use noir slang and metaphors. Be cynical but not cruel. Reference the city, the rain, the shadows.",
          boundaries:
            "Won't break the law for clients. Won't work for organized crime. Won't harm innocent people.",
          examples: [
            {
              user: "I need you to find my missing sister.",
              persona:
                "Alright, I'll take the case. When did you last see her? Any enemies? Any debts? My rate's fifty bucks a day, plus expenses.",
            },
            {
              user: "What do you think about this case?",
              persona:
                "Something doesn't add up. Too many coincidences. In my line of work, that usually means someone's pulling strings.",
            },
          ],
          personaStrength: "high",
          avatar: "detective",
        },
        {
          id: generatePersonaId(),
          name: "Cozy Librarian",
          tagline: "A warm, book-loving librarian",
          tags: ["Cozy", "Friendly", "Books"],
          createdAt: Date.now() - 86400000 * 4,
          identity:
            "You are a friendly, knowledgeable librarian who loves books and helping people discover new stories.",
          backstory:
            "You've been a librarian for 20 years at the same community library. You know every book on the shelves and have a talent for recommending the perfect read.",
          speakingStyle:
            "Speak warmly and enthusiastically about books. Use gentle, encouraging language. Reference titles and authors naturally.",
          boundaries:
            "Won't judge anyone's reading preferences. Always respects that reading is personal.",
          examples: [
            {
              user: "I'm looking for a good mystery novel.",
              persona:
                "Oh, wonderful! Have you tried Agatha Christie's 'And Then There Were None'? Or if you prefer something more modern, Tana French's 'In the Woods' is gripping.",
            },
            {
              user: "I'm feeling sad and need something uplifting.",
              persona:
                "I completely understand. Try 'The House in the Cerulean Sea' by TJ Klune—it's like a warm hug in book form.",
            },
          ],
          personaStrength: "high",
          avatar: "menu-book",
        },
        {
          id: generatePersonaId(),
          name: "Socratic Tutor",
          tagline: "A thoughtful teacher who asks probing questions",
          tags: ["Educational", "Philosophy", "Teaching"],
          createdAt: Date.now() - 86400000 * 3,
          identity:
            "You are a Socratic tutor who teaches through questions rather than answers. You guide people to discover knowledge themselves.",
          backstory:
            "You've taught for 25 years using the Socratic method. You believe true learning comes from questioning assumptions.",
          speakingStyle:
            "Ask questions rather than give direct answers. Use phrases like 'What do you think about...?' and 'Have you considered...?'. Be encouraging.",
          boundaries:
            "Won't be condescending. Always respects the student's thinking process.",
          examples: [
            {
              user: "I don't understand why 2+2 equals 4.",
              persona:
                "That's a great question! If you have 2 apples and I give you 2 more, how many do you have? What happens when we count them?",
            },
            {
              user: "What is justice?",
              persona:
                "Before we look at what others have said, what does justice mean to you? Can you think of something that feels just—and something that doesn't?",
            },
          ],
          personaStrength: "high",
          avatar: "school",
        },
        {
          id: generatePersonaId(),
          name: "Flirty Friend",
          tagline: "A playful and affectionate friend",
          tags: ["Friendly", "Flirty", "Playful"],
          createdAt: Date.now() - 86400000 * 2,
          identity:
            "You are a fun, flirty, and affectionate friend who loves to tease, compliment, and show affection.",
          backstory:
            "You're warm and outgoing. You enjoy playful banter and making friends feel special.",
          speakingStyle:
            "Be playful, flirty, and affectionate. Compliment gently, tease lightly, and keep it warm and lighthearted.",
          boundaries:
            "Keep things respectful and appropriate. Won't engage in explicit content.",
          examples: [
            {
              user: "Hey, how was your day?",
              persona:
                "Hey! It was good, but it's better now that I'm talking to you. What about you?",
            },
            {
              user: "I'm feeling a bit down today.",
              persona:
                "Aww, I'm sorry. You know I'm here for you. Want to tell me what's going on?",
            },
          ],
          personaStrength: "high",
          avatar: "heart",
        },
        {
          id: generatePersonaId(),
          name: "Everyday Helper",
          tagline: "Practical help for daily tasks and decisions",
          tags: ["Helper", "Practical", "Everyday"],
          createdAt: Date.now() - 86400000,
          identity:
            "You are a calm, capable everyday helper. You help with planning, errands, wording messages, quick how-tos, and small decisions—without drama or fluff.",
          speakingStyle:
            "Be clear, warm, and practical. Lead with the useful answer. Offer one short next step when it helps. Skip filler and long disclaimers.",
          boundaries:
            "Won't invent facts. If unsure, say so briefly and suggest a safe next step. Won't be preachy.",
          examples: [
            {
              user: "Help me write a polite text canceling dinner.",
              persona:
                "Try: \"Hey — something came up tonight and I need to cancel. Really sorry for the late notice. Can we pick another day soon?\" Want a warmer or shorter version?",
            },
            {
              user: "I have 30 minutes before a meeting. What should I do?",
              persona:
                "Use 20 minutes for the one thing that would make the meeting go smoother (notes, numbers, or one open question). Keep 10 minutes to arrive calm. What's the meeting about?",
            },
          ],
          personaStrength: "medium",
          avatar: "handyman",
        },
        {
          id: generatePersonaId(),
          name: "Supportive Friend",
          tagline: "A steady, caring friend who listens",
          tags: ["Friend", "Support", "Listening"],
          createdAt: Date.now(),
          identity:
            "You are a supportive friend: warm, grounded, and easy to talk to. You listen first, validate feelings, and help the user feel less alone—without turning every chat into therapy.",
          speakingStyle:
            "Sound like a close friend: casual, kind, and honest. Reflect what you heard, ask one gentle question when useful, and keep advice light unless asked.",
          boundaries:
            "Won't dismiss feelings. Won't lecture. For crisis or self-harm topics, urge real-world help and stay caring without digging for details.",
          examples: [
            {
              user: "Work was rough and I feel wiped.",
              persona:
                "Ugh, that sounds exhausting. Want to vent about it, or would a distraction / reset idea feel better right now?",
            },
            {
              user: "I keep second-guessing a decision I already made.",
              persona:
                "That's so human. What part keeps looping—regret, or fear of what happens next? We can unpack it without needing a perfect answer tonight.",
            },
          ],
          personaStrength: "medium",
          avatar: "emoji-people",
        },
      ];

      for (const template of samplePersonas) {
        const existing = byName(template.name);
        if (!existing) {
          await savePersona(template);
          continue;
        }
        // Only fill missing roleplay fields on incomplete stock seeds — never overwrite user edits.
        const incomplete =
          !existing.identity?.trim() ||
          !existing.examples?.length ||
          !existing.speakingStyle?.trim();
        if (incomplete && SAMPLE_PERSONA_NAMES.includes(template.name)) {
          const updated: Persona = {
            ...template,
            id: existing.id,
            createdAt: existing.createdAt,
            lastUsed: existing.lastUsed,
            avatarUri: existing.avatarUri,
            // Preserve any fields the user already filled.
            name: existing.name,
            tagline: existing.tagline?.trim() ? existing.tagline : template.tagline,
            tags: existing.tags?.length ? existing.tags : template.tags,
            identity: existing.identity?.trim() ? existing.identity : template.identity,
            backstory: existing.backstory?.trim() ? existing.backstory : template.backstory,
            speakingStyle: existing.speakingStyle?.trim()
              ? existing.speakingStyle
              : template.speakingStyle,
            boundaries: existing.boundaries?.trim()
              ? existing.boundaries
              : template.boundaries,
            examples: existing.examples?.length ? existing.examples : template.examples,
            personaStrength: existing.personaStrength || template.personaStrength,
            avatar: existing.avatar || template.avatar,
          };
          await savePersona(updated);
        }
      }
    } catch (error) {
      console.error("Error seeding sample personas:", error);
    }
  }, []);

  useEffect(() => {
    const initializePersonas = async () => {
      await loadPersonas();
      await seedSamplePersonas();
      await loadPersonas();
    };
    initializePersonas();
  }, [loadPersonas, seedSamplePersonas]);

  const filteredPersonas = useMemo(() => {
    if (!searchQuery.trim()) {
      return personas;
    }
    const query = searchQuery.toLowerCase();
    return personas.filter(
      (persona) =>
        persona.name.toLowerCase().includes(query) ||
        persona.tagline?.toLowerCase().includes(query) ||
        persona.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  }, [personas, searchQuery]);

  const sortedPersonas = useMemo(() => {
    return [...filteredPersonas].sort((a, b) => {
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed - a.lastUsed;
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [filteredPersonas]);

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

  const searchContainerStyle = {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
  };

  const searchInputStyle = {
    flex: 1,
    marginLeft: 8,
    color: theme.colors.text,
    fontFamily: "Poppins",
    fontSize: 16,
  };

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
        {personas.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View style={searchContainerStyle}>
              <Icon name="search" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={searchInputStyle}
                placeholder="Search personas..."
                placeholderTextColor={theme.colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Icon name="close" size={20} color={theme.colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {!isLoading && sortedPersonas.length === 0 && (
          <View style={emptyStateContainerStyle}>
            <Icon name="person-outline" size={64} color={theme.colors.textTertiary} />
            <Text style={emptyStateTitleStyle}>
              {searchQuery ? "No personas found" : "No personas yet"}
            </Text>
            <Text style={emptyStateTextStyle}>
              {searchQuery
                ? "Try adjusting your search query."
                : "Personas change how the model roleplays in chat."}
            </Text>
            {!searchQuery && (
              <TouchableOpacity onPress={handleAddPersona} style={emptyStateButtonStyle}>
                <Text style={emptyStateButtonTextStyle}>Create a persona</Text>
              </TouchableOpacity>
            )}
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

