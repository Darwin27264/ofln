/**
 * CodeLibLibraryScreen Component
 * 
 * Main screen for managing CodeLib functions.
 * Handles function listing, testing, editing, and deletion.
 */

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
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
  getCodeLibFunctions,
  saveCodeLibFunction,
  removeCodeLibFunction,
  generateCodeLibId,
  testCodeLibFunction,
  seedBuiltInCodeLibFunctions,
  CodeLibFunction,
} from "../services/codelibService";
import { ANIMATION_CONFIG, getStaggeredDelay } from "../utils/animationConfig";

interface CodeLibLibraryScreenProps {
  onBack: () => void;
  onEditFunction?: (func: CodeLibFunction | null) => void;
  onTestFunction?: (func: CodeLibFunction) => void;
}

export default function CodeLibLibraryScreen({
  onBack,
  onEditFunction,
  onTestFunction,
}: CodeLibLibraryScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);

  const [functions, setFunctions] = useState<CodeLibFunction[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [expandedFunctionId, setExpandedFunctionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Animation state
  const isInitialAnimationPhase = useRef(true);
  const animatedFunctionIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    isInitialAnimationPhase.current = true;
    animatedFunctionIds.current.clear();

    const interaction = InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        isInitialAnimationPhase.current = false;
      }, 800);
    });

    return () => {
      interaction.cancel();
      isInitialAnimationPhase.current = true;
      animatedFunctionIds.current.clear();
    };
  }, []);

  // Load functions on mount and seed if needed
  useEffect(() => {
    const initializeFunctions = async () => {
      await loadFunctions();
      await seedBuiltInCodeLibFunctions();
      await loadFunctions(); // Reload after seeding
    };
    initializeFunctions();
  }, []);

  const loadFunctions = useCallback(async () => {
    try {
      setIsLoading(true);
      const loadedFunctions = await getCodeLibFunctions();
      setFunctions(loadedFunctions);
    } catch (error) {
      console.error("Error loading CodeLib functions:", error);
      showAlert("Error", "Failed to load CodeLib functions.", [{ text: "OK" }]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Filter functions based on search query
  const filteredFunctions = useMemo(() => {
    if (!searchQuery.trim()) {
      return functions;
    }
    const query = searchQuery.toLowerCase();
    return functions.filter(
      (func) =>
        func.name.toLowerCase().includes(query) ||
        func.description.toLowerCase().includes(query) ||
        func.type.toLowerCase().includes(query)
    );
  }, [functions, searchQuery]);

  // Sort functions: by type, then by name
  const sortedFunctions = useMemo(() => {
    return [...filteredFunctions].sort((a, b) => {
      if (a.type !== b.type) {
        const typeOrder = { formatter: 0, utility: 1, validator: 2, extractor: 3 };
        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
      }
      return a.name.localeCompare(b.name);
    });
  }, [filteredFunctions]);

  const handleTestFunction = useCallback(
    (func: CodeLibFunction) => {
      if (onTestFunction) {
        onTestFunction(func);
      } else {
        // Quick test with sample input
        const sampleInput = "Sample input text\nLine 2\nLine 3";
        const result = testCodeLibFunction(func, sampleInput);
        if (result.error) {
          showAlert("Test Error", result.error, [{ text: "OK" }]);
        } else {
          showAlert("Test Result", `Output:\n\n${result.output}`, [{ text: "OK" }]);
        }
      }
    },
    [onTestFunction]
  );

  const handleEditFunction = useCallback(
    (func: CodeLibFunction) => {
      if (onEditFunction) {
        onEditFunction(func);
      }
    },
    [onEditFunction]
  );

  const handleDuplicateFunction = useCallback(
    async (func: CodeLibFunction) => {
      try {
        const duplicated: CodeLibFunction = {
          ...func,
          id: generateCodeLibId(),
          name: `${func.name} (Copy)`,
          isBuiltIn: false,
          createdAt: Date.now(),
          lastUsed: undefined,
        };
        await saveCodeLibFunction(duplicated);
        loadFunctions();
      } catch (error) {
        console.error("Error duplicating function:", error);
        showAlert("Error", "Failed to duplicate function.", [{ text: "OK" }]);
      }
    },
    [loadFunctions]
  );

  const handleDeleteFunction = useCallback(
    (func: CodeLibFunction) => {
      if (func.isBuiltIn) {
        showAlert("Info", "Built-in functions cannot be deleted.", [{ text: "OK" }]);
        return;
      }

      showAlert(
        "Delete Function",
        `Are you sure you want to delete "${func.name}"? This action cannot be undone.`,
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
                await removeCodeLibFunction(func.id);
                loadFunctions();
                if (expandedFunctionId === func.id) {
                  setExpandedFunctionId(null);
                }
              } catch (error) {
                console.error("Error deleting function:", error);
                showAlert("Error", "Failed to delete function.", [{ text: "OK" }]);
              }
            },
          },
        ]
      );
    },
    [loadFunctions, expandedFunctionId]
  );

  const getTypeColor = (type: string) => {
    switch (type) {
      case "formatter":
        return theme.colors.accent;
      case "utility":
        return theme.colors.primary;
      case "validator":
        return theme.colors.warning;
      case "extractor":
        return theme.colors.success;
      default:
        return theme.colors.textSecondary;
    }
  };

  const renderFunctionCard = useCallback(
    (func: CodeLibFunction, index: number) => {
      const isExpanded = expandedFunctionId === func.id;

      return (
        <CodeLibFunctionCard
          key={func.id}
          func={func}
          index={index}
          isExpanded={isExpanded}
          onToggleExpand={() => setExpandedFunctionId(isExpanded ? null : func.id)}
          onTest={() => handleTestFunction(func)}
          onEdit={() => handleEditFunction(func)}
          onDuplicate={() => handleDuplicateFunction(func)}
          onDelete={() => handleDeleteFunction(func)}
          typeColor={getTypeColor(func.type)}
          isInitialAnimationPhase={isInitialAnimationPhase.current}
          animatedFunctionIds={animatedFunctionIds}
        />
      );
    },
    [
      expandedFunctionId,
      handleTestFunction,
      handleEditFunction,
      handleDuplicateFunction,
      handleDeleteFunction,
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
        <Text style={styles.settingsTitle}>CodeLib</Text>
        {onEditFunction && (
          <TouchableOpacity
            onPress={() => onEditFunction(null)}
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
        {functions.length > 0 && (
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
                placeholder="Search functions..."
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
        {!isLoading && sortedFunctions.length === 0 && (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
              paddingVertical: 60,
            }}
          >
            <Icon name="code" size={64} color={theme.colors.textTertiary} />
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
              {searchQuery ? "No functions found" : "No functions yet"}
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
                : "CodeLib functions are deterministic transforms for Skills pipelines."}
            </Text>
            {!searchQuery && onEditFunction && (
              <TouchableOpacity
                onPress={() => onEditFunction(null)}
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
                  Create a Function
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Functions list */}
        {sortedFunctions.length > 0 && (
          <View>
            {sortedFunctions.map((func, index) => renderFunctionCard(func, index))}
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

// CodeLibFunctionCard component
interface CodeLibFunctionCardProps {
  func: CodeLibFunction;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  typeColor: string;
  isInitialAnimationPhase: boolean;
  animatedFunctionIds: React.MutableRefObject<Set<string>>;
}

const CodeLibFunctionCard: React.FC<CodeLibFunctionCardProps> = React.memo(({
  func,
  index,
  isExpanded,
  onToggleExpand,
  onTest,
  onEdit,
  onDuplicate,
  onDelete,
  typeColor,
  isInitialAnimationPhase,
  animatedFunctionIds,
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
    if (animatedFunctionIds.current.has(func.id)) {
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
      // Mark this function as animated immediately to prevent race conditions
      animatedFunctionIds.current.add(func.id);
      
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
      animatedFunctionIds.current.add(func.id);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [func.id, index, isInitialAnimationPhase, animatedFunctionIds, cardOpacity, cardTranslateY]);

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
        <TouchableOpacity
          style={{
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: "transparent",
          }}
          onPress={onToggleExpand}
          activeOpacity={0.7}
        >
          <View
            style={{
              width: 60,
              height: 60,
              borderRadius: 12,
              backgroundColor: typeColor + "20",
              marginRight: 12,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="code" size={28} color={typeColor} />
          </View>

          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 4,
              }}
              numberOfLines={1}
            >
              {func.name}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textSecondary,
                fontFamily: "Poppins",
                marginBottom: 8,
              }}
              numberOfLines={2}
            >
              {func.description}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              <View
                style={{
                  backgroundColor: typeColor + "20",
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: typeColor,
                    fontFamily: "Poppins",
                    fontWeight: "600",
                    textTransform: "capitalize",
                  }}
                >
                  {func.type}
                </Text>
              </View>
              <View
                style={{
                  backgroundColor: theme.colors.surface,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 4,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                  }}
                >
                  {func.contract}
                </Text>
              </View>
            </View>
          </View>

          <Icon
            name={isExpanded ? "expand-less" : "expand-more"}
            size={24}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>

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
                onPress={onTest}
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
                <Icon name="play-arrow" size={18} color="#fff" />
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 6,
                  }}
                >
                  Test
                </Text>
              </TouchableOpacity>
              {onEdit && (
                <TouchableOpacity
                  onPress={onEdit}
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
                  <Icon name="edit" size={18} color={theme.colors.primaryText} />
                  <Text
                    style={{
                      color: theme.colors.primaryText,
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
                <Icon name="content-copy" size={18} color={theme.colors.text} />
                <Text
                  style={{
                    color: theme.colors.text,
                    fontSize: 14,
                    fontWeight: "600",
                    fontFamily: "Poppins",
                    marginLeft: 6,
                  }}
                >
                  Duplicate
                </Text>
              </TouchableOpacity>
              {!func.isBuiltIn && (
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

CodeLibFunctionCard.displayName = "CodeLibFunctionCard";

