/**
 * PersonasLibraryScreen Component
 * 
 * Main screen for managing personas.
 * Handles persona listing, creation, editing, duplication, and deletion.
 * 
 * Performance optimizations:
 * - Memoized components and callbacks
 * - Efficient filtering with useMemo
 * - Optimized animations
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  InteractionManager,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { PersonaCard } from "../components/PersonaCard";
import {
  getPersonas,
  savePersona,
  removePersona,
  generatePersonaId,
  Persona,
} from "../services/personaService";

interface PersonasLibraryScreenProps {
  onBack: () => void;
  onEditPersona?: (persona: Persona | null) => void; // null = create mode, Persona = edit mode
  onUsePersona?: (persona: Persona) => void; // Handler for "Use" button
}

export default function PersonasLibraryScreen({
  onBack,
  onEditPersona,
  onUsePersona,
}: PersonasLibraryScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedPersonaId, setExpandedPersonaId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Animation state - tracks whether we're in the initial animation phase
  const isInitialAnimationPhase = useRef(true);
  const animatedPersonaIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Reset animation state when component mounts
    isInitialAnimationPhase.current = true;
    animatedPersonaIds.current.clear();

    // Use InteractionManager to ensure animations start after initial render
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

  // Load personas on mount and seed with sample data if empty or incomplete
  useEffect(() => {
    const initializePersonas = async () => {
      await loadPersonas();
      // Seed with sample personas if none exist or if they're incomplete
      // This will run every time the screen opens to ensure personas are populated
      await seedSamplePersonas();
    };
    initializePersonas();
  }, [seedSamplePersonas]);

  const seedSamplePersonas = useCallback(async () => {
    try {
      const existingPersonas = await getPersonas();
      
      // Check if we already have the sample personas by name and if they have complete data
      const noirDetective = existingPersonas.find(p => p.name === "Noir Detective");
      const cozyLibrarian = existingPersonas.find(p => p.name === "Cozy Librarian");
      const socraticTutor = existingPersonas.find(p => p.name === "Socratic Tutor");
      
      // Check if any are missing or incomplete (missing identity or examples)
      // Also check for empty strings, not just undefined
      const needsSeeding = 
        !noirDetective || !noirDetective.identity || !noirDetective.identity.trim() || !noirDetective.examples || !noirDetective.examples.length ||
        !cozyLibrarian || !cozyLibrarian.identity || !cozyLibrarian.identity.trim() || !cozyLibrarian.examples || !cozyLibrarian.examples.length ||
        !socraticTutor || !socraticTutor.identity || !socraticTutor.identity.trim() || !socraticTutor.examples || !socraticTutor.examples.length;
      
      // Only seed if we don't have all three sample personas or they're incomplete
      if (needsSeeding) {
        const samplePersonas: Persona[] = [
          {
            id: generatePersonaId(),
            name: "Noir Detective",
            tagline: "A hard-boiled detective from the 1940s",
            tags: ["Mystery", "Noir", "Detective"],
            createdAt: Date.now() - 86400000 * 2, // 2 days ago
            lastUsed: Date.now() - 3600000, // 1 hour ago
            identity: "You are a hard-boiled private detective working in 1940s Los Angeles. You've seen it all—corruption, betrayal, and the dark underbelly of the city. You speak in clipped, cynical sentences and have a dry sense of humor.",
            backstory: "You've been a PI for 15 years, working the mean streets. You've got a small office above a diner, a .38 in your desk drawer, and a reputation for getting results—even if your methods aren't always by the book. You've lost friends, made enemies, but you always find the truth.",
            speakingStyle: "Speak in short, punchy sentences. Use noir slang and metaphors. Be cynical but not cruel. Reference the city, the rain, the shadows. Use phrases like 'dame', 'gumshoe', 'the long goodbye'. Keep it atmospheric and moody.",
            boundaries: "Won't break the law for clients. Won't work for organized crime. Won't harm innocent people, even if the money's good.",
            breakCharacterWhen: "If the user explicitly asks me to break character or discuss modern topics that don't fit the 1940s setting.",
            examples: [
              {
                user: "I need you to find my missing sister.",
                persona: "Alright, I'll take the case. But I need the whole story—when did you last see her? Any enemies? Any debts? The more you tell me now, the faster I can find her. My rate's fifty bucks a day, plus expenses."
              },
              {
                user: "What do you think about this case?",
                persona: "Something doesn't add up. Too many coincidences, too many people looking the other way. In my line of work, that usually means someone's pulling strings. I'll dig deeper, see what the shadows are hiding."
              }
            ],
            personaStrength: "high",
            avatar: "detective",
          },
          {
            id: generatePersonaId(),
            name: "Cozy Librarian",
            tagline: "A warm, book-loving librarian",
            tags: ["Cozy", "Friendly", "Books"],
            createdAt: Date.now() - 86400000, // 1 day ago
            lastUsed: Date.now() - 7200000, // 2 hours ago
            identity: "You are a friendly, knowledgeable librarian who loves books and helping people discover new stories. You work in a cozy neighborhood library and have read thousands of books across all genres.",
            backstory: "You've been a librarian for 20 years at the same community library. You know every book on the shelves, remember every patron's reading preferences, and have a talent for recommending the perfect book. You love quiet mornings with a cup of tea and a good novel.",
            speakingStyle: "Speak warmly and enthusiastically about books. Use gentle, encouraging language. Reference book titles, authors, and literary themes naturally. Be helpful and patient. Use phrases like 'Oh, you'd love...', 'That reminds me of...', 'Have you tried...'",
            boundaries: "Won't recommend books with content that might be harmful. Won't judge anyone's reading preferences. Always respects that reading is personal.",
            breakCharacterWhen: "If asked about non-book topics that require breaking character, or if the user explicitly asks me to stop being a librarian.",
            examples: [
              {
                user: "I'm looking for a good mystery novel.",
                persona: "Oh, wonderful! Have you tried Agatha Christie's 'And Then There Were None'? It's a classic locked-room mystery that will keep you guessing until the very end. Or if you prefer something more modern, Tana French's 'In the Woods' is absolutely gripping!"
              },
              {
                user: "I'm feeling sad and need something uplifting.",
                persona: "I completely understand. When you need comfort, I always recommend 'The House in the Cerulean Sea' by TJ Klune—it's like a warm hug in book form. Or 'A Man Called Ove' by Fredrik Backman, which will make you laugh and cry in the best way."
              }
            ],
            personaStrength: "high",
            avatar: "menu-book",
          },
          {
            id: generatePersonaId(),
            name: "Socratic Tutor",
            tagline: "A thoughtful teacher who asks probing questions",
            tags: ["Educational", "Philosophy", "Teaching"],
            createdAt: Date.now(),
            identity: "You are a Socratic tutor who believes in teaching through questions rather than answers. You guide students to discover knowledge themselves by asking thoughtful, probing questions that lead them to deeper understanding.",
            backstory: "You've been teaching for 25 years, using the Socratic method to help students think critically. You believe that true learning comes from questioning assumptions and exploring ideas deeply. You're patient, curious, and genuinely interested in how people think.",
            speakingStyle: "Ask questions rather than give direct answers. Use phrases like 'What do you think about...?', 'Have you considered...?', 'What if we looked at it this way...?'. Be encouraging and guide gently. Help students discover answers through their own reasoning.",
            boundaries: "Won't give direct answers when the student should discover it themselves. Won't be condescending or dismissive. Always respects the student's thinking process, even if they're wrong.",
            breakCharacterWhen: "If the student explicitly asks for direct answers or if the topic requires factual information that can't be discovered through questioning.",
            examples: [
              {
                user: "I don't understand why 2+2 equals 4.",
                persona: "That's a great question! Let's think about it together. If you have 2 apples, and I give you 2 more apples, how many apples do you have in total? What happens when we count them? Can you see why we might call that result '4'?"
              },
              {
                user: "What is justice?",
                persona: "That's a profound question that philosophers have debated for thousands of years. Before we look at what others have said, what does justice mean to you? Can you think of an example of something that feels just? What makes it just? And can you think of something that feels unjust? What's the difference?"
              }
            ],
            personaStrength: "high",
            avatar: "school",
          },
        ];

        // Save all sample personas (this will update existing ones or create new ones)
        for (const personaTemplate of samplePersonas) {
          // Check if this persona already exists
          const existing = existingPersonas.find(p => p.name === personaTemplate.name);
          if (existing) {
            // Update existing persona with complete data, preserving ID and timestamps
            const updatedPersona: Persona = {
              ...personaTemplate,
              id: existing.id,
              createdAt: existing.createdAt,
              lastUsed: existing.lastUsed || personaTemplate.lastUsed,
            };
            await savePersona(updatedPersona);
          } else {
            // Create new persona
            await savePersona(personaTemplate);
          }
        }

        // Reload to show the new/updated personas
        await loadPersonas();
      }
    } catch (error) {
      console.error("Error seeding sample personas:", error);
    }
  }, [loadPersonas]);

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

  // Filter personas based on search query
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

  // Sort personas: recently used first, then by creation date
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
    // Navigate to editor in create mode
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
        const duplicated: Persona = {
          ...persona,
          id: generatePersonaId(),
          name: `${persona.name} (Copy)`,
          createdAt: Date.now(),
          lastUsed: undefined,
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

  const renderPersonaCard = useCallback(
    (persona: Persona, index: number) => {
      const isExpanded = expandedPersonaId === persona.id;

      return (
        <PersonaCard
          key={persona.id}
          persona={persona}
          index={index}
          isExpanded={isExpanded}
          onToggleExpand={() => setExpandedPersonaId(isExpanded ? null : persona.id)}
          onEdit={() => handleEditPersona(persona)}
          onDuplicate={() => handleDuplicatePersona(persona)}
          onDelete={() => handleDeletePersona(persona)}
          onUse={onUsePersona ? () => onUsePersona(persona) : undefined}
          isInitialAnimationPhase={isInitialAnimationPhase.current}
          animatedPersonaIds={animatedPersonaIds}
        />
      );
    },
    [expandedPersonaId, handleEditPersona, handleDuplicatePersona, handleDeletePersona]
  );

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
        <Text style={styles.settingsTitle}>Personas</Text>
        <TouchableOpacity
          onPress={handleAddPersona}
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: 20,
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Icon name="add" size={20} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 16,
              fontWeight: "600",
              fontFamily: "Poppins",
              marginLeft: 6,
            }}
          >
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{
          marginTop: 55,
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Search input */}
        {personas.length > 0 && (
          <View style={{ marginBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: theme.colors.surface,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Icon name="search" size={20} color={theme.colors.textSecondary} />
              <TextInput
                style={{
                  flex: 1,
                  marginLeft: 8,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  fontSize: 16,
                }}
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

        {/* Empty state */}
        {!isLoading && sortedPersonas.length === 0 && (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 60,
            }}
          >
            <Icon name="person-outline" size={64} color={theme.colors.textTertiary} />
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginTop: 16,
                marginBottom: 8,
              }}
            >
              {searchQuery ? "No personas found" : "No personas yet"}
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                textAlign: "center",
                marginBottom: 24,
                paddingHorizontal: 40,
              }}
            >
              {searchQuery
                ? "Try adjusting your search query."
                : "Personas change how the model roleplays in chat."}
            </Text>
            {!searchQuery && (
              <TouchableOpacity
                onPress={handleAddPersona}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingHorizontal: 24,
                  paddingVertical: 12,
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
                  Create a persona
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Personas list */}
        {sortedPersonas.length > 0 && (
          <View>
            {sortedPersonas.map((persona, index) => renderPersonaCard(persona, index))}
          </View>
        )}
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
    </View>
  );
}

