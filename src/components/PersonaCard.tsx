/**
 * PersonaCard Component
 * 
 * Displays a single persona card with edit, duplicate, and delete actions.
 * Handles animations on mount and expand/collapse interactions.
 * 
 * Performance optimizations:
 * - Memoized to prevent unnecessary re-renders
 * - Animation values are refs to avoid re-creation
 * - Only animates on initial mount (controlled by parent)
 */

import React, { useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Easing,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTheme } from "../context/ThemeContext";
import { Persona } from "../services/personaService";

interface PersonaCardProps {
  persona: Persona;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  // Animation control from parent
  isInitialAnimationPhase: boolean;
  animatedPersonaIds: React.MutableRefObject<Set<string>>;
}

/**
 * Format last used timestamp to readable string
 */
function formatLastUsed(timestamp?: number): string | null {
  if (!timestamp) return null;
  
  const now = Date.now();
  const diff = now - timestamp;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
}

/**
 * PersonaCard Component
 * 
 * Displays persona information with expandable details and action buttons.
 * Handles animations on initial mount and expand/collapse interactions.
 */
export const PersonaCard: React.FC<PersonaCardProps> = React.memo(({ 
  persona, 
  index,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDuplicate,
  onDelete,
  isInitialAnimationPhase,
  animatedPersonaIds,
}) => {
  const { theme } = useTheme();
  
  // Helper function to convert hex to rgba for better cross-platform support
  const hexToRgba = (hex: string, alpha: number): string => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };
  
  // Animation values - use refs to avoid re-creation on re-renders
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(20)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-20)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;

  // Track if this specific card has been initialized (prevents re-triggering)
  const hasInitializedRef = useRef(false);
  
  /**
   * Initialize and trigger card animation only once per persona on initial mount
   * Only animates if still in initial animation phase (controlled by parent)
   */
  useEffect(() => {
    // Skip if this persona has already animated (prevents re-animation)
    if (animatedPersonaIds.current.has(persona.id)) {
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
      return;
    }
    
    // Skip if this card instance has already been initialized
    if (hasInitializedRef.current) {
      return;
    }
    
    hasInitializedRef.current = true;
    
    // Only animate if we're still in the initial animation phase
    if (isInitialAnimationPhase) {
      // Mark this persona as animated
      animatedPersonaIds.current.add(persona.id);
      
      // Start animation with index-based delay for staggered effect
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 200,
          delay: Math.min(index * 25, 200), // Capped at 200ms max delay
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 200,
          delay: Math.min(index * 25, 200),
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animation phase has passed - set final values immediately
      animatedPersonaIds.current.add(persona.id);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [persona.id, index, isInitialAnimationPhase, animatedPersonaIds, cardOpacity, cardTranslateY]);

  /**
   * Animate dropdown when expanded state changes
   */
  useEffect(() => {
    if (isExpanded) {
      Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 150,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 120,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: -20,
          duration: 120,
          easing: Easing.bezier(0.4, 0.0, 1, 1),
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 100,
          easing: Easing.bezier(0.4, 0.0, 1, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isExpanded, dropdownTranslateY, dropdownOpacity]);

  // Memoize last used formatting
  const formattedLastUsed = useMemo(() => formatLastUsed(persona.lastUsed), [persona.lastUsed]);

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
        {/* Main card content */}
        <TouchableOpacity
          style={{
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
          onPress={onToggleExpand}
          activeOpacity={0.7}
        >
          {/* Persona icon */}
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
              name="person" 
              size={28} 
              color={theme.colors.text} 
            />
          </View>

          {/* Persona info */}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 2,
              }}
              numberOfLines={1}
            >
              {persona.name}
            </Text>
            {persona.tagline && (
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 4,
                }}
                numberOfLines={1}
              >
                {persona.tagline}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {persona.tags && persona.tags.length > 0 && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Icon name="label" size={12} color={theme.colors.textTertiary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                    }}
                  >
                    {persona.tags.slice(0, 2).join(", ")}
                  </Text>
                </View>
              )}
              {formattedLastUsed && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.surface,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Icon name="schedule" size={12} color={theme.colors.textTertiary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                    }}
                  >
                    {formattedLastUsed}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Expand indicator */}
          <Icon 
            name={isExpanded ? "expand-less" : "expand-more"} 
            size={24} 
            color={theme.colors.textSecondary} 
          />
        </TouchableOpacity>

        {/* Dropdown menu */}
        {isExpanded && (
          <Animated.View
            style={{
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              padding: 12,
              backgroundColor: theme.colors.surface,
              opacity: dropdownOpacity,
              transform: [
                {
                  translateY: dropdownTranslateY,
                },
              ],
            }}
          >
            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={onEdit}
                style={{
                  flex: 1,
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
              <TouchableOpacity
                onPress={onDuplicate}
                style={{
                  flex: 1,
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
              <TouchableOpacity
                onPress={onDelete}
                style={{
                  flex: 1,
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
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  return (
    prevProps.persona.id === nextProps.persona.id &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.index === nextProps.index &&
    prevProps.isInitialAnimationPhase === nextProps.isInitialAnimationPhase
  );
});

PersonaCard.displayName = "PersonaCard";

