/**
 * ModelCard Component
 * 
 * Displays a single model card with download, delete, and settings actions.
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
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTheme } from "../context/ThemeContext";
import ProgressBar from "./ProgressBar";

// Types
export interface ModelInfo {
  id: string;
  name: string;
  repoId: string;
  fileName: string;
  size?: string;
  description?: string;
  author?: string;
  availableQuants?: Array<{
    fileName: string;
    size: number;
    quantization: string;
  }>;
  downloads?: number;
  tags?: string[];
  publishedDate?: string;
}

interface ModelCardProps {
  model: ModelInfo;
  isDownloaded: boolean;
  index: number;
  isDownloading: boolean;
  progress: number;
  isLoading: boolean;
  onDownload: () => void;
  onDelete: () => void;
  onCancel: () => void;
  onSettings: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  // Animation control from parent
  isInitialAnimationPhase: boolean;
  animatedModelIds: React.MutableRefObject<Set<string>>;
}

// Cache for quantization extraction to avoid repeated regex operations
const quantizationCache = new Map<string, string | null>();

/**
 * Extract quantization from fileName (e.g., "Q4_K_M", "Q5_K_M")
 * Uses caching to avoid repeated regex operations
 */
function extractQuantization(fileName: string): string | null {
  if (quantizationCache.has(fileName)) {
    return quantizationCache.get(fileName) || null;
  }
  
  const quantMatch = fileName.match(/(q[0-9]_[km]|q[0-9]_[0-9]|q[0-9]k_[ms]|q[0-9]k_m|q[0-9]k_s|q[0-9]_0)/i);
  const result = quantMatch ? quantMatch[0].toUpperCase() : null;
  quantizationCache.set(fileName, result);
  return result;
}

// Cache for date formatting
const dateFormatCache = new Map<string, string>();

/**
 * Format published date to readable string
 * Uses caching to avoid repeated date parsing
 */
function formatPublishedDate(dateString: string): string {
  if (dateFormatCache.has(dateString)) {
    return dateFormatCache.get(dateString) || dateString;
  }
  
  try {
    const formatted = new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
    dateFormatCache.set(dateString, formatted);
    return formatted;
  } catch {
    return dateString;
  }
}

/**
 * Determine if a model is a thinking/reasoning model
 * Thinking models show their reasoning process (e.g., DeepSeek R1)
 */
function isThinkingModel(model: ModelInfo): boolean {
  const modelId = model.id.toLowerCase();
  const description = (model.description || '').toLowerCase();
  
  const thinkingModelIds = ['r1', 'deepseek-r1', 'r1d'];
  const thinkingDescriptionKeywords = ['distilled reasoning', 'reasoning (slower'];
  
  if (thinkingModelIds.some(id => modelId.includes(id))) {
    return true;
  }
  
  if (thinkingDescriptionKeywords.some(keyword => description.includes(keyword))) {
    return true;
  }
  
  return false;
}

/**
 * ModelCard Component
 * 
 * Displays model information with expandable details and action buttons.
 * Handles animations on initial mount and expand/collapse interactions.
 */
export const ModelCard: React.FC<ModelCardProps> = React.memo(({ 
  model, 
  isDownloaded, 
  index,
  isDownloading,
  progress,
  isLoading,
  onDownload,
  onDelete,
  onCancel,
  onSettings,
  isExpanded,
  onToggleExpand,
  isInitialAnimationPhase,
  animatedModelIds,
}) => {
  const { theme } = useTheme();
  
  // Animation values - use refs to avoid re-creation on re-renders
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const cardTranslateY = useRef(new Animated.Value(20)).current;
  const dropdownTranslateY = useRef(new Animated.Value(-20)).current;
  const dropdownOpacity = useRef(new Animated.Value(0)).current;

  // Create a unique model key for tracking
  const modelKey = `${model.id}:${model.fileName}`;
  
  // Track if this specific card has been initialized (prevents re-triggering)
  const hasInitializedRef = useRef(false);
  
  /**
   * Initialize and trigger card animation only once per model on initial mount
   * Only animates if still in initial animation phase (controlled by parent)
   */
  useEffect(() => {
    // Skip if this model has already animated (prevents re-animation)
    if (animatedModelIds.current.has(modelKey)) {
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
    // This ensures animations only play once when entering the page
    if (isInitialAnimationPhase) {
      // Mark this model as animated
      animatedModelIds.current.add(modelKey);
      
      // Start animation with index-based delay for staggered effect
      Animated.parallel([
        Animated.timing(cardOpacity, {
          toValue: 1,
          duration: 300,
          delay: index * 40,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
        Animated.timing(cardTranslateY, {
          toValue: 0,
          duration: 300,
          delay: index * 40,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1),
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animation phase has passed - set final values immediately
      animatedModelIds.current.add(modelKey);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [modelKey, index, isInitialAnimationPhase, animatedModelIds, cardOpacity, cardTranslateY]);

  /**
   * Animate dropdown when expanded state changes
   * Only animates if not downloading or loading
   */
  useEffect(() => {
    if (isExpanded && !isDownloading && !isLoading) {
      Animated.parallel([
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
      ]).start();
    } else {
      Animated.parallel([
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
      ]).start();
    }
  }, [isExpanded, isDownloading, isLoading, dropdownTranslateY, dropdownOpacity]);

  // Memoize quantization extraction and date formatting
  const modelQuantization = useMemo(() => extractQuantization(model.fileName), [model.fileName]);
  const formattedPublishedDate = useMemo(() => {
    return model.publishedDate ? formatPublishedDate(model.publishedDate) : null;
  }, [model.publishedDate]);

  return (
    <Animated.View
      style={{
        opacity: cardOpacity,
        transform: [{ translateY: cardTranslateY }],
      }}
    >
      <View
        style={[
          {
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
          },
          isDownloaded && {
            backgroundColor: theme.colors.success + "10",
            borderColor: theme.colors.success + "40",
          },
        ]}
      >
        {/* Main card content */}
        <TouchableOpacity
          style={{
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
          onPress={onToggleExpand}
          disabled={isDownloading || isLoading}
          activeOpacity={0.7}
        >
          {/* Model icon */}
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
              name={isThinkingModel(model) ? "psychology" : "chat"} 
              size={28} 
              color={theme.colors.text} 
            />
          </View>

          {/* Model info */}
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
              {model.name}
            </Text>
            {model.author && (
              <Text
                style={{
                  fontSize: 11,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  marginBottom: 4,
                }}
                numberOfLines={1}
              >
                by {model.author}
              </Text>
            )}
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
              {model.size && (
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
                  <Icon name="storage" size={12} color={theme.colors.textTertiary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                    }}
                  >
                    {model.size}
                  </Text>
                </View>
              )}
              {model.availableQuants && model.availableQuants.length > 0 && (
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
                  <Icon name="tune" size={12} color={theme.colors.textTertiary} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.textTertiary,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                    }}
                  >
                    {model.availableQuants.length} quants
                  </Text>
                </View>
              )}
              {isDownloaded && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: theme.colors.success + "20",
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                  }}
                >
                  <Icon name="check-circle" size={12} color={theme.colors.success} />
                  <Text
                    style={{
                      fontSize: 10,
                      color: theme.colors.success,
                      fontFamily: "Poppins",
                      marginLeft: 4,
                    }}
                  >
                    Downloaded
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Action indicator */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {isDownloading ? (
              <View style={{ alignItems: "center", width: 100 }}>
                <ProgressBar progress={progress} />
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                  style={{ marginTop: 4, padding: 4 }}
                >
                  <Icon name="cancel" size={18} color={theme.colors.error} />
                </TouchableOpacity>
              </View>
            ) : isLoading ? (
              <ActivityIndicator size="small" color={theme.colors.accent} />
            ) : (
              <Icon 
                name={isExpanded ? "expand-less" : "expand-more"} 
                size={24} 
                color={theme.colors.textSecondary} 
              />
            )}
          </View>
        </TouchableOpacity>

        {/* Dropdown menu */}
        {isExpanded && !isDownloading && !isLoading && (
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
            {/* Model details */}
            <View style={{ marginBottom: 12 }}>
              {model.description && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    marginBottom: 8,
                    lineHeight: 18,
                  }}
                >
                  {model.description}
                </Text>
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                {model.size && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.card,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Icon name="storage" size={14} color={theme.colors.textTertiary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        marginLeft: 4,
                      }}
                    >
                      {model.size}
                    </Text>
                  </View>
                )}
                {modelQuantization && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.card,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Icon name="tune" size={14} color={theme.colors.textTertiary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        marginLeft: 4,
                      }}
                    >
                      {modelQuantization}
                    </Text>
                  </View>
                )}
                {model.downloads && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.card,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Icon name="download" size={14} color={theme.colors.textTertiary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        marginLeft: 4,
                      }}
                    >
                      {model.downloads.toLocaleString()}
                    </Text>
                  </View>
                )}
                {formattedPublishedDate && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.card,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Icon name="calendar-today" size={14} color={theme.colors.textTertiary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        marginLeft: 4,
                      }}
                    >
                      {formattedPublishedDate}
                    </Text>
                  </View>
                )}
                {model.tags && model.tags.length > 0 && (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: theme.colors.card,
                      paddingHorizontal: 8,
                      paddingVertical: 4,
                      borderRadius: 6,
                    }}
                  >
                    <Icon name="label" size={14} color={theme.colors.textTertiary} />
                    <Text
                      style={{
                        fontSize: 11,
                        color: theme.colors.textTertiary,
                        fontFamily: "Poppins",
                        marginLeft: 4,
                      }}
                    >
                      {model.tags.slice(0, 2).join(", ")}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Action buttons */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              {isDownloaded ? (
                <>
                  <TouchableOpacity
                    onPress={onSettings}
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
                    <Icon name="settings" size={18} color={theme.colors.primaryText} />
                    <Text
                      style={{
                        color: theme.colors.primaryText,
                        fontSize: 14,
                        fontWeight: "600",
                        fontFamily: "Poppins",
                        marginLeft: 6,
                      }}
                    >
                      Settings
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
                  <TouchableOpacity
                    onPress={onDownload}
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
                    <Icon name="play-circle-filled" size={18} color="#fff" />
                    <Text
                      style={{
                        color: "#fff",
                        fontSize: 14,
                        fontWeight: "600",
                        fontFamily: "Poppins",
                        marginLeft: 6,
                      }}
                    >
                      Load
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  onPress={onDownload}
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
                  <Icon name="download" size={18} color={theme.colors.primaryText} />
                  <Text
                    style={{
                      color: theme.colors.primaryText,
                      fontSize: 14,
                      fontWeight: "600",
                      fontFamily: "Poppins",
                      marginLeft: 6,
                    }}
                  >
                    Download
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for better memoization
  // Only re-render if props actually changed
  return (
    prevProps.model.id === nextProps.model.id &&
    prevProps.model.fileName === nextProps.model.fileName &&
    prevProps.isDownloaded === nextProps.isDownloaded &&
    prevProps.isDownloading === nextProps.isDownloading &&
    prevProps.progress === nextProps.progress &&
    prevProps.isLoading === nextProps.isLoading &&
    prevProps.isExpanded === nextProps.isExpanded &&
    prevProps.index === nextProps.index &&
    prevProps.isInitialAnimationPhase === nextProps.isInitialAnimationPhase
  );
});

ModelCard.displayName = "ModelCard";

