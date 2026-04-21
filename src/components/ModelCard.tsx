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
 * - Uses centralized animation configuration
 */

import React, { useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  InteractionManager,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialIcons";
import { useTheme } from "../context/ThemeContext";
import CircularProgress from "./CircularProgress";
import { ANIMATION_CONFIG, EASING, getStaggeredDelay } from "../utils/animationConfig";

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
 * Extract quantization from a GGUF file name, e.g. "Q4_K_M", "Q5_K_S", "Q4_0".
 * Results are cached to avoid repeated regex work.
 *
 * Keep in sync with `src/utils/modelUtils.ts#extractQuantization` and
 * `src/services/modelInfoService.ts#detectQuantFromFilename`.
 */
function extractQuantization(fileName: string): string | null {
  if (quantizationCache.has(fileName)) {
    return quantizationCache.get(fileName) || null;
  }

  const patterns: RegExp[] = [
    /q[0-9]_k_[msl]/i,
    /q[0-9]_k/i,
    /q[0-9]_[01]/i,
  ];
  let result: string | null = null;
  for (const pattern of patterns) {
    const match = fileName.match(pattern);
    if (match) {
      result = match[0].toUpperCase();
      break;
    }
  }
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
 * Determine if a model supports a "thinking" / chain-of-thought mode.
 *
 * Keep this in sync with the canonical implementation in
 * `src/utils/modelUtils.ts#isThinkingModel`. The duplication exists
 * because ModelCard is memoized on its own props and depends on the
 * model object reference — importing the util would pull in the cache
 * Map which we do not want to share across screens.
 */
function isThinkingModel(model: ModelInfo): boolean {
  const modelId = model.id.toLowerCase();
  const fileName = (model.fileName || '').toLowerCase();
  const description = (model.description || '').toLowerCase();
  const tags = (model.tags || []).map((t) => t.toLowerCase());
  const haystack = `${modelId} ${fileName}`;

  const thinkingFamilyPatterns: RegExp[] = [
    /\br1\b/,
    /\br1d\b/,
    /deepseek-r1/,
    /qwen3(?![a-z])/,
    /qwq/,
    /smollm3/,
  ];

  if (thinkingFamilyPatterns.some((p) => p.test(haystack))) {
    return true;
  }

  if (tags.includes('thinking') || tags.includes('reasoning')) {
    return true;
  }

  const thinkingDescriptionKeywords = [
    'distilled reasoning',
    'reasoning (slower',
    'chain-of-thought',
  ];
  if (thinkingDescriptionKeywords.some((k) => description.includes(k))) {
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

  // Create a unique model key for tracking
  const modelKey = `${model.id}:${model.fileName}`;
  
  // Track if this specific card has been initialized (prevents re-triggering)
  const hasInitializedRef = useRef(false);
  const cardAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  
  /**
   * Initialize and trigger card animation only once per model on initial mount
   * Only animates if still in initial animation phase (controlled by parent)
   * 
   * Improvements:
   * - Explicit initial values set before animation
   * - Proper animation cleanup to prevent conflicts
   * - Uses InteractionManager to ensure layout is complete
   * - Consistent with other card implementations
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
      // Mark this model as animated immediately to prevent race conditions
      animatedModelIds.current.add(modelKey);
      
      // Cancel any existing animation to prevent conflicts
      if (cardAnimationRef.current) {
        cardAnimationRef.current.stop();
        cardAnimationRef.current = null;
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
          
          cardAnimationRef.current = animation;
          animation.start((finished) => {
            if (finished) {
              // Ensure final values are exactly correct after animation
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
      // Animation phase has passed - set final values immediately
      animatedModelIds.current.add(modelKey);
      cardOpacity.setValue(1);
      cardTranslateY.setValue(0);
    }
  }, [modelKey, index, isInitialAnimationPhase, animatedModelIds, cardOpacity, cardTranslateY]);

  /**
   * Animate dropdown when expanded state changes
   * Only animates if not downloading or loading
   * Optimized: Faster animations for better mobile responsiveness
   */
  useEffect(() => {
    if (isExpanded && !isDownloading && !isLoading) {
      Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: 0,
          ...ANIMATION_CONFIG.menu,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 1,
          duration: ANIMATION_CONFIG.menu.duration - 30, // Slightly faster for opacity
          easing: EASING.STANDARD,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(dropdownTranslateY, {
          toValue: -20,
          duration: ANIMATION_CONFIG.menu.duration - 30,
          easing: EASING.ACCELERATE,
          useNativeDriver: true,
        }),
        Animated.timing(dropdownOpacity, {
          toValue: 0,
          duration: ANIMATION_CONFIG.menu.duration - 50,
          easing: EASING.ACCELERATE,
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
            backgroundColor: hexToRgba(theme.colors.success, 0.06),
            borderWidth: 0,
            borderColor: 'transparent',
            shadowOpacity: 0,
            elevation: 0,
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
                    backgroundColor: hexToRgba(theme.colors.success, 0.12),
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
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <View style={{ position: "relative", width: 42, height: 42 }}>
                  <CircularProgress progress={progress} size={42} strokeWidth={4} />
                  <TouchableOpacity
                    onPress={(e) => {
                      e.stopPropagation();
                      onCancel();
                    }}
                    style={{
                      position: "absolute",
                      width: 42,
                      height: 42,
                      justifyContent: "center",
                      alignItems: "center",
                      borderRadius: 21,
                    }}
                    activeOpacity={0.7}
                  >
                    <Icon name="cancel" size={22} color={theme.colors.error} />
                  </TouchableOpacity>
                </View>
                <Text
                  style={{
                    fontSize: 10,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                    fontWeight: "600",
                    marginTop: 4,
                  }}
                >
                  {progress}%
                </Text>
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
              borderTopWidth: isDownloaded ? 0 : 1,
              borderTopColor: theme.colors.border,
              padding: 12,
              backgroundColor: isDownloaded ? hexToRgba(theme.colors.success, 0.06) : theme.colors.surface,
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

