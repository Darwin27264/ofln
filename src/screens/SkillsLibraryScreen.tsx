/**
 * SkillsLibraryScreen Component
 * 
 * Main screen for managing skills.
 * Handles skill listing, running, pinning, and deletion.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  InteractionManager,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Icon from "react-native-vector-icons/MaterialIcons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import {
  getSkills,
  saveSkill,
  removeSkill,
  generateSkillId,
  toggleSkillPin,
  updateSkillLastUsed,
  Skill,
  seedBuiltInSkills,
} from "../services/skillService";
import { ANIMATION_CONFIG, getStaggeredDelay } from "../utils/animationConfig";

interface SkillsLibraryScreenProps {
  onBack: () => void;
  onRunSkill: (skill: Skill) => void;
  onEditSkill?: (skill: Skill | null) => void; // null = create mode, Skill = edit mode
  onGoToCodeLib?: () => void; // Navigate to CodeLib library
}

export default function SkillsLibraryScreen({
  onBack,
  onRunSkill,
  onEditSkill,
  onGoToCodeLib,
}: SkillsLibraryScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [skills, setSkills] = useState<Skill[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedSkillId, setExpandedSkillId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Animation state
  const isInitialAnimationPhase = useRef(true);
  const animatedSkillIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    isInitialAnimationPhase.current = true;
    animatedSkillIds.current.clear();

    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        isInitialAnimationPhase.current = false;
      }, 800);
    });

    return () => {
      interaction.cancel();
      isInitialAnimationPhase.current = true;
      animatedSkillIds.current.clear();
    };
  }, []);

  // Load skills on mount and seed if needed
  useEffect(() => {
    const initializeSkills = async () => {
      await loadSkills();
      await seedBuiltInSkills();
      await loadSkills(); // Reload after seeding
    };
    initializeSkills();
  }, []);

  const loadSkills = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedSkills = await getSkills();
      setSkills(loadedSkills);
    } catch (error) {
      console.error("Error loading skills:", error);
      showAlert("Error", "Failed to load skills.", [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter skills based on search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return skills;
    }
    const query = searchQuery.toLowerCase();
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.category?.toLowerCase().includes(query)
    );
  }, [skills, searchQuery]);

  // Sort skills: pinned first, then recently used, then by creation date
  const sortedSkills = useMemo(() => {
    return [...filteredSkills].sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      if (a.lastUsed && b.lastUsed) {
        return b.lastUsed - a.lastUsed;
      }
      if (a.lastUsed) return -1;
      if (b.lastUsed) return 1;
      return b.createdAt - a.createdAt;
    });
  }, [filteredSkills]);

  // Get pinned skills
  const pinnedSkills = useMemo(() => {
    return sortedSkills.filter((s) => s.isPinned);
  }, [sortedSkills]);

  // Get non-pinned skills
  const unpinnedSkills = useMemo(() => {
    return sortedSkills.filter((s) => !s.isPinned);
  }, [sortedSkills]);

  const handleRunSkill = useCallback(
    async (skill: Skill) => {
      await updateSkillLastUsed(skill.id);
      await loadSkills(); // Refresh to show updated lastUsed
      onRunSkill(skill);
    },
    [onRunSkill, loadSkills]
  );

  const handleTogglePin = useCallback(
    async (skill: Skill) => {
      try {
        await toggleSkillPin(skill.id);
        await loadSkills();
      } catch (error) {
        console.error("Error toggling pin:", error);
        showAlert("Error", "Failed to toggle pin.", [{ text: "OK" }]);
      }
    },
    [loadSkills]
  );

  const handleDeleteSkill = useCallback(
    (skill: Skill) => {
      if (skill.isBuiltIn) {
        showAlert("Info", "Built-in skills cannot be deleted.", [{ text: "OK" }]);
        return;
      }

      showAlert(
        "Delete Skill",
        `Are you sure you want to delete "${skill.name}"? This action cannot be undone.`,
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
                await removeSkill(skill.id);
                loadSkills();
                if (expandedSkillId === skill.id) {
                  setExpandedSkillId(null);
                }
              } catch (error) {
                console.error("Error deleting skill:", error);
                showAlert("Error", "Failed to delete skill.", [{ text: "OK" }]);
              }
            },
          },
        ]
      );
    },
    [loadSkills, expandedSkillId]
  );

  const handleEditSkill = useCallback(
    (skill: Skill) => {
      if (onEditSkill) {
        // If it's a built-in skill, duplicate it first
        if (skill.isBuiltIn) {
          const duplicated: Skill = {
            ...skill,
            id: generateSkillId(),
            name: `${skill.name} (Custom)`,
            isPinned: false,
            isBuiltIn: false,
            createdAt: Date.now(),
            lastUsed: undefined,
          };
          onEditSkill(duplicated);
        } else {
          onEditSkill(skill);
        }
      }
    },
    [onEditSkill]
  );

  const handleDuplicateSkill = useCallback(
    async (skill: Skill) => {
      try {
        const duplicated: Skill = {
          ...skill,
          id: generateSkillId(),
          name: `${skill.name} (Copy)`,
          isPinned: false,
          isBuiltIn: false,
          createdAt: Date.now(),
          lastUsed: undefined,
        };
        await saveSkill(duplicated);
        loadSkills();
      } catch (error) {
        console.error("Error duplicating skill:", error);
        showAlert("Error", "Failed to duplicate skill.", [{ text: "OK" }]);
      }
    },
    [loadSkills]
  );

  const renderSkillCard = useCallback(
    (skill: Skill, index: number) => {
      const isExpanded = expandedSkillId === skill.id;
      const blockTypes = skill.blocks.map((b) => b.type);

      return (
        <SkillCard
          key={skill.id}
          skill={skill}
          index={index}
          isExpanded={isExpanded}
          blockTypes={blockTypes}
          onToggleExpand={() => setExpandedSkillId(isExpanded ? null : skill.id)}
          onRun={() => handleRunSkill(skill)}
          onEdit={() => handleEditSkill(skill)}
          onDuplicate={() => handleDuplicateSkill(skill)}
          onDelete={() => handleDeleteSkill(skill)}
          onTogglePin={() => handleTogglePin(skill)}
          isInitialAnimationPhase={isInitialAnimationPhase.current}
          animatedSkillIds={animatedSkillIds}
        />
      );
    },
    [
      expandedSkillId,
      handleRunSkill,
      handleEditSkill,
      handleDuplicateSkill,
      handleDeleteSkill,
      handleTogglePin,
    ]
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
          paddingTop: 20,
          paddingBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text style={styles.settingsTitle}>Skills</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onGoToCodeLib && (
            <TouchableOpacity
              onPress={onGoToCodeLib}
              style={{
                backgroundColor: theme.colors.accent,
                borderRadius: 20,
                paddingHorizontal: 16,
                paddingVertical: 8,
                flexDirection: "row",
                alignItems: "center",
              }}
            >
              <Icon name="code" size={20} color="#fff" />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "600",
                  fontFamily: "Poppins",
                  marginLeft: 6,
                }}
              >
                CodeLib
              </Text>
            </TouchableOpacity>
          )}
          {onEditSkill && (
            <TouchableOpacity
              onPress={() => onEditSkill(null)}
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
          )}
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{
          marginTop: 70,
          flex: 1,
        }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Search input */}
        {skills.length > 0 && (
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
                placeholder="Search skills..."
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
        {!isLoading && sortedSkills.length === 0 && (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 60,
            }}
          >
            <Icon name="auto-awesome" size={64} color={theme.colors.textTertiary} />
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
              {searchQuery ? "No skills found" : "No skills yet"}
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
                : "Skills are reusable workflows that combine LLM and CodeLib blocks."}
            </Text>
            {!searchQuery && onEditSkill && (
              <TouchableOpacity
                onPress={() => onEditSkill(null)}
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
                  Create a Skill
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Pinned Skills Section */}
        {pinnedSkills.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 12,
              }}
            >
              Quick Actions
            </Text>
            {pinnedSkills.map((skill, index) => renderSkillCard(skill, index))}
          </View>
        )}

        {/* All Skills Section */}
        {unpinnedSkills.length > 0 && (
          <View>
            {pinnedSkills.length > 0 && (
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 12,
                }}
              >
                All Skills
              </Text>
            )}
            {unpinnedSkills.map((skill, index) =>
              renderSkillCard(skill, pinnedSkills.length + index)
            )}
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

// SkillCard component (similar to PersonaCard)
interface SkillCardProps {
  skill: Skill;
  index: number;
  isExpanded: boolean;
  blockTypes: string[];
  onToggleExpand: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  isInitialAnimationPhase: boolean;
  animatedSkillIds: React.MutableRefObject<Set<string>>;
}

const SkillCard: React.FC<SkillCardProps> = React.memo(({
  skill,
  index,
  isExpanded,
  blockTypes,
  onToggleExpand,
  onRun,
  onEdit,
  onDuplicate,
  onDelete,
  onTogglePin,
  isInitialAnimationPhase,
  animatedSkillIds,
}) => {
  const { theme } = useTheme();
  // Initialize with opacity 1 to prevent blacked out appearance
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTranslateY = useRef(new Animated.Value(0)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-20)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;
  const hasInitializedRef = useRef(false);
  const animationRef = useRef<Animated.CompositeAnimation | null>(null);
  const dropdownAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Cleanup function to ensure opacity is always 1 and cancel animations
  useEffect(() => {
    return () => {
      // Cancel any ongoing animations
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      if (dropdownAnimationRef.current) {
        dropdownAnimationRef.current.stop();
        dropdownAnimationRef.current = null;
      }
      // Ensure opacity is reset to 1 on unmount
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
      dropdownOpacity.setValue(0);
      dropdownTranslateY.setValue(-20);
    };
  }, [cardOpacity, cardTranslateY, dropdownOpacity, dropdownTranslateY]);

  useEffect(() => {
    if (animatedSkillIds.current.has(skill.id)) {
      // Already animated, ensure values are correct
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
      return;
    }
    if (hasInitializedRef.current) {
      return;
    }
    hasInitializedRef.current = true;

    if (isInitialAnimationPhase) {
      // Mark this skill as animated immediately to prevent race conditions
      animatedSkillIds.current.add(skill.id);
      
      // Cancel any existing animation
      if (animationRef.current) {
        animationRef.current.stop();
        animationRef.current = null;
      }
      
      // Ensure initial values are set explicitly before animation
      cardOpacity.setValue(0);
      cardTranslateY.setValue(20);
      
      // Use InteractionManager to ensure layout is complete before animating
      // This prevents glitches from animating before layout measurement
      const interaction = InteractionManager.runAfterInteractions(() => {
        // Use requestAnimationFrame for one more frame to ensure smooth start
        requestAnimationFrame(() => {
          // Start animation with index-based delay for staggered effect
          // Uses centralized configuration for consistency
          const delay = getStaggeredDelay(index);
          const animation = Animated.parallel([
            Animated.timing(cardOpacity, {
              toValue: 1,
              delay,
              ...ANIMATION_CONFIG.card,
            }),
            Animated.timing(cardTranslateY, {
              toValue: 0,
              delay,
              ...ANIMATION_CONFIG.card,
            }),
          ]);
          animationRef.current = animation;
          animation.start((finished) => {
            if (finished) {
              // Ensure final values are exactly correct after animation
              cardOpacity.setValue(1);
              cardTranslateY.setValue(0);
            }
            animationRef.current = null;
          });
        });
      });
      
      return () => {
        interaction.cancel();
        if (animationRef.current) {
          animationRef.current.stop();
          animationRef.current = null;
        }
      };
    } else {
      // Animation phase passed, just mark as animated
      animatedSkillIds.current.add(skill.id);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [skill.id, index, isInitialAnimationPhase, animatedSkillIds, cardOpacity, cardTranslateY]);

  useEffect(() => {
    // Cancel any ongoing dropdown animation
    if (dropdownAnimationRef.current) {
      dropdownAnimationRef.current.stop();
      dropdownAnimationRef.current = null;
    }

    if (isExpanded) {
      // Reset initial values before expanding
      dropdownTranslateY.setValue(-20);
      dropdownOpacity.setValue(0);
      
      const animation = Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 180,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]);
      dropdownAnimationRef.current = animation;
      animation.start((finished) => {
        if (finished) {
          dropdownTranslateY.setValue(0);
          dropdownOpacity.setValue(1);
        }
        dropdownAnimationRef.current = null;
      });
    } else {
      const animation = Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: -20,
          duration: 150,
          easing: Easing.bezier(0.4, 0.0, 1, 1),
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 120,
          easing: Easing.bezier(0.4, 0.0, 1, 1),
          useNativeDriver: true,
        }),
      ]);
      dropdownAnimationRef.current = animation;
      animation.start((finished) => {
        if (finished) {
          dropdownTranslateY.setValue(-20);
          dropdownOpacity.setValue(0);
        }
        dropdownAnimationRef.current = null;
      });
    }
  }, [isExpanded, dropdownTranslateY, dropdownOpacity]);

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

  return (
    <Animated.View
      style={{
        opacity: cardOpacity,
        transform: [{ translateY: cardTranslateY }],
      }}
    >
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 16,
          marginBottom: 12,
          borderWidth: 1,
          borderColor: theme.colors.border,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 2,
          overflow: "hidden",
        }}
      >
        <Pressable
          style={({ pressed }) => [
            {
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "transparent",
              opacity: pressed ? 0.7 : 1,
            },
          ]}
          onPress={onToggleExpand}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              backgroundColor: theme.colors.surface,
              marginRight: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon
              name={skill.iconKey || "auto-awesome"}
              size={28}
              color={theme.colors.text}
            />
          </View>

          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {skill.name}
              </Text>
              {skill.isPinned && (
                <Icon name="push-pin" size={16} color={theme.colors.accent} style={{ marginLeft: 8 }} />
              )}
            </View>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                marginBottom: 8,
              }}
              numberOfLines={2}
            >
              {skill.description}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {blockTypes.map((type, idx) => (
                <View
                  key={idx}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Icon
                    name={getBlockIcon(type)}
                    size={12}
                    color={theme.colors.textTertiary}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                      textTransform: "capitalize",
                    }}
                  >
                    {type}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Icon
            name={isExpanded ? "expand-less" : "expand-more"}
            size={24}
            color={theme.colors.textSecondary}
          />
        </Pressable>

        {isExpanded && (
          <Animated.View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              padding: 12,
              backgroundColor: theme.colors.surface,
              opacity: dropdownOpacity,
              transform: [{ translateY: dropdownTranslateY }],
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              <TouchableOpacity
                onPress={onRun}
                style={{
                  flex: 1,
                  minWidth: "45%",
                  backgroundColor: theme.colors.primary,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="play-arrow" size={18} color={theme.colors.primaryText} />
                <Text
                  style={{
                    color: theme.colors.primaryText,
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 6,
                  }}
                >
                  Run
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onTogglePin}
                style={{
                  flex: 1,
                  minWidth: "45%",
                  backgroundColor: skill.isPinned
                    ? theme.colors.accent
                    : theme.colors.surface,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <Icon
                  name={skill.isPinned ? "push-pin" : "push-pin"}
                  size={18}
                  color={skill.isPinned ? "#fff" : theme.colors.text}
                />
                <Text
                  style={{
                    color: skill.isPinned ? "#fff" : theme.colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 6,
                  }}
                >
                  {skill.isPinned ? "Unpin" : "Pin"}
                </Text>
              </TouchableOpacity>
              {onEdit && (
                <TouchableOpacity
                  onPress={onEdit}
                  style={{
                    flex: 1,
                    minWidth: "45%",
                    backgroundColor: theme.colors.surface,
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Icon name="edit" size={18} color={theme.colors.text} />
                  <Text
                    style={{
                      color: theme.colors.text,
                      fontSize: 14,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                      marginLeft: 6,
                    }}
                  >
                    Edit
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onDuplicate}
                style={{
                  flex: 1,
                  minWidth: "45%",
                  backgroundColor: theme.colors.accent,
                  paddingVertical: 10,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="content-copy" size={18} color="#fff" />
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 6,
                  }}
                >
                  Duplicate
                </Text>
              </TouchableOpacity>
              {!skill.isBuiltIn && (
                <TouchableOpacity
                  onPress={onDelete}
                  style={{
                    flex: 1,
                    minWidth: "45%",
                    backgroundColor: theme.colors.error + "20",
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="delete" size={18} color={theme.colors.error} />
                  <Text
                    style={{
                      color: theme.colors.error,
                      fontSize: 14,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                      marginLeft: 6,
                    }}
                  >
                    Delete
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
});

SkillCard.displayName = "SkillCard";

