/**
 * PersonaCard Component
 * Displays a persona card with expandable actions and animations.
 */

import React, { useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  InteractionManager,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTheme } from "../context/ThemeContext";
import { Persona } from "../services/personaService";
import { PersonaAvatar } from "./PersonaAvatar";
import { ANIMATION_CONFIG, EASING, getStaggeredDelay } from "../utils/animationConfig";

interface PersonaCardProps {
  persona: Persona;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onUse?: () => void;
  isInitialAnimationPhase: boolean;
  animatedPersonaIds: React.MutableRefObject<Set<string>>;
}

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

export const PersonaCard: React.FC<PersonaCardProps> = React.memo(({ 
  persona, 
  index,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDuplicate,
  onDelete,
  onUse,
  isInitialAnimationPhase,
  animatedPersonaIds,
}) => {
  const { theme } = useTheme();
  
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(20)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-20)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;

  const hasInitializedRef = useRef(false);
  const cardAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const dropdownAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  
  useEffect(() => {
    if (animatedPersonaIds.current.has(persona.id)) {
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
      return;
    }
    
    if (hasInitializedRef.current) {
      return;
    }
    
    hasInitializedRef.current = true;
    
    if (isInitialAnimationPhase) {
      animatedPersonaIds.current.add(persona.id);
      
      if (cardAnimationRef.current) {
        cardAnimationRef.current.stop();
        cardAnimationRef.current = null;
      }
      
      cardOpacity.setValue(0);
      cardTranslateY.setValue(20);
      
      const interaction = InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
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
          cardAnimationRef.current = animation;
          animation.start((finished) => {
            if (finished) {
              cardOpacity.setValue(1);
              cardTranslateY.setValue(0);
            }
            cardAnimationRef.current = null;
          });
        });
      });
      
      return () => {
        interaction.cancel();
        if (cardAnimationRef.current) {
          cardAnimationRef.current.stop();
          cardAnimationRef.current = null;
        }
      };
    } else {
      animatedPersonaIds.current.add(persona.id);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [persona.id, index, isInitialAnimationPhase, animatedPersonaIds, cardOpacity, cardTranslateY]);

  useEffect(() => {
    if (dropdownAnimationRef.current) {
      dropdownAnimationRef.current.stop();
      dropdownAnimationRef.current = null;
    }

    if (isExpanded) {
      dropdownTranslateY.setValue(-20);
      dropdownOpacity.setValue(0);
      
      const animation = Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          duration: 200,
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: 180,
          easing: EASING.STANDARD,
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
          easing: EASING.ACCELERATE,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: 120,
          easing: EASING.ACCELERATE,
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
        <TouchableOpacity
          style={{
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
          onPress={onToggleExpand}
          activeOpacity={0.7}
        >
          <View style={{ marginRight: 12 }}>
            <PersonaAvatar
              persona={persona}
              size={60}
              borderRadius={12}
              backgroundColor={theme.colors.surface}
              iconColor={theme.colors.text}
            />
          </View>

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
              transform: [
                {
                  translateY: dropdownTranslateY,
                },
              ],
            }}
          >
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {onUse && (
                <TouchableOpacity
                  onPress={onUse}
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
                  <Icon name="check-circle" size={18} color="#fff" />
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 14,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                      marginLeft: 6,
                    }}
                  >
                    Use
                  </Text>
                </TouchableOpacity>
              )}
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
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.persona.id === nextProps.persona.id &&
    prevProps.persona.name === nextProps.persona.name &&
    prevProps.persona.tagline === nextProps.persona.tagline &&
    prevProps.persona.tags?.join(',') === nextProps.persona.tags?.join(',') &&
    prevProps.persona.lastUsed === nextProps.persona.lastUsed &&
    prevProps.persona.avatar === nextProps.persona.avatar &&
    prevProps.persona.avatarUri === nextProps.persona.avatarUri &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.index === nextProps.index &&
    prevProps.isInitialAnimationPhase === nextProps.isInitialAnimationPhase &&
    !!prevProps.onUse === !!nextProps.onUse
  );
});

PersonaCard.displayName = "PersonaCard";

