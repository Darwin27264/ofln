// StagesScreen.tsx
import React, { useState, useEffect, useMemo, useRef, useCallback, FC } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Modal,
  Animated,
  StyleSheet,
  PanResponder,
} from 'react-native';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LineChart } from 'react-native-chart-kit';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../components/CustomAlert';

/* ──────────────────────────────────── constants ──────────────────────────────────── */
const RADIUS = 30;
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_WIDTH = (SCREEN_WIDTH - 50) / 2;
const GRAPH_HEIGHT = 120;
const GRAPH_SHIFT = 18;
const STAT_CARD_HEIGHT = GRAPH_HEIGHT + 30;
const USAGE_LOG_PATH = `${RNFS.DocumentDirectoryPath}/usage_log.json`;

// COLORS removed - now using theme

/* ────────────────────────────────────── types ────────────────────────────────────── */
interface UsageRecord {
  timestamp: number;
  inferenceTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: 'High' | 'Medium' | 'Low' | 'Very Low';
  model: string;
}

interface ModelStats {
  total: number;
  avgTime: number;
  avgTps: number;
  perf: 'High' | 'Medium' | 'Low' | 'Very Low';
  tpsData: number[];
  timeData: number[];
}

interface Props {
  downloadedModels: string[];
  onBack: () => void;
}

/* ──────────────────────────────── hooks and utils ──────────────────────────────── */
const useUsageData = () => {
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsageData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      if (await RNFS.exists(USAGE_LOG_PATH)) {
        const content = await RNFS.readFile(USAGE_LOG_PATH, 'utf8');
        const records: UsageRecord[] = content
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            try {
              const record = JSON.parse(line);
              if (!validateUsageRecord(record)) {
                throw new Error('Invalid record format');
              }
              return record;
            } catch {
              return null;
            }
          })
          .filter((record): record is UsageRecord => record !== null);
        
        setUsageRecords(records);
      } else {
        setUsageRecords([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage data');
      setUsageRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearUsageData = async () => {
    try {
      await RNFS.unlink(USAGE_LOG_PATH);
      setUsageRecords([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear usage data');
    }
  };

  useEffect(() => {
    loadUsageData();
  }, []);

  return { usageRecords, isLoading, error, clearUsageData };
};

const useModelStats = (usageRecords: UsageRecord[], selectedModel: string | null) => {
  return useMemo((): ModelStats | null => {
    if (!selectedModel) return null;

    const filtered = usageRecords.filter(r => r.model === selectedModel);
    if (!filtered.length) return null;

    const total = filtered.length;
    const avgTime = filtered.reduce((sum, r) => sum + r.inferenceTime, 0) / total;
    const avgTps = filtered.reduce((sum, r) => sum + r.tokensPerSecond, 0) / total;
    const perf = filtered.at(-1)!.performanceLevel;
    const tpsData = filtered.map(r => r.tokensPerSecond);
    const timeData = filtered.map(r => r.inferenceTime);

    return { total, avgTime, avgTps, perf, tpsData, timeData };
  }, [usageRecords, selectedModel]);
};

const useChartAnimations = (data: number[] | undefined) => {
  const anim = useRef(new Animated.Value(0)).current;

  const runAnimation = () => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: GRAPH_WIDTH,
      duration: 900,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    if (data?.length) runAnimation();
  }, [data]);

  return anim;
};

/* ───────────────────────────── validation ───────────────────────────── */
const validateUsageRecord = (record: any): record is UsageRecord => {
  return (
    typeof record === 'object' &&
    typeof record.timestamp === 'number' &&
    typeof record.inferenceTime === 'number' &&
    typeof record.tokenCount === 'number' &&
    typeof record.tokensPerSecond === 'number' &&
    ['High', 'Medium', 'Low', 'Very Low'].includes(record.performanceLevel) &&
    typeof record.model === 'string'
  );
};

/* ───────────────────────────── utils ───────────────────────────── */
// Remove file extensions from model names for display
const stripFileExtension = (modelName: string): string => {
  if (!modelName) return modelName;
  // Remove common file extensions
  return modelName.replace(/\.(gguf|bin|safetensors|pt|pth|onnx|h5)$/i, '').trim();
};

/* ──────────────────────────────────── component ──────────────────────────────────── */
const StagesScreen: FC<Props> = ({ downloadedModels, onBack }) => {
  const { theme } = useTheme();
  const shared = createStyles(theme.colors);
  const { usageRecords, isLoading, error, clearUsageData } = useUsageData();
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [graphType, setGraphType] = useState<'tps' | 'inf' | null>(null);
  const userTouchedRef = useRef(false);

  // Models sorting and selection
  const sortedModels = useMemo(() => {
    return downloadedModels
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => {
        const countA = usageRecords.filter(r => r.model === a.m).length;
        const countB = usageRecords.filter(r => r.model === b.m).length;
        return countB !== countA ? countB - countA : a.idx - b.idx;
      })
      .map(o => o.m);
  }, [downloadedModels, usageRecords]);

  useEffect(() => {
    if (!userTouchedRef.current && sortedModels.length) {
      setSelectedModel(sortedModels[0]);
    }
  }, [sortedModels]);

  // Calculate current model index and navigation availability
  const currentModelIndex = useMemo(() => {
    if (!selectedModel || sortedModels.length === 0) return -1;
    return sortedModels.indexOf(selectedModel);
  }, [selectedModel, sortedModels]);

  const hasPreviousModel = useMemo(() => {
    return currentModelIndex > 0;
  }, [currentModelIndex]);

  const hasNextModel = useMemo(() => {
    return currentModelIndex >= 0 && currentModelIndex < sortedModels.length - 1;
  }, [currentModelIndex, sortedModels.length]);

  // Helper to stop current animation
  const stopCurrentAnimation = useCallback(() => {
    if (currentAnimation.current) {
      currentAnimation.current.stop();
      currentAnimation.current = null;
    }
    isAnimating.current = false;
  }, []);

  // Navigation functions with animation
  const navigateToPrevious = useCallback(() => {
    if (!hasPreviousModel || sortedModels.length === 0 || isAnimating.current || !isMountedRef.current) return;
    
    // Stop any ongoing animation
    stopCurrentAnimation();
    
    const prevIndex = currentModelIndex - 1;
    const prevModel = sortedModels[prevIndex];
    if (prevIndex >= 0 && prevModel && prevModel !== selectedModel) {
      isAnimating.current = true;
      userTouchedRef.current = true;
      
      // Animate out to right
      const outAnimation = Animated.parallel([
        Animated.timing(pillTranslateX, {
          toValue: SCREEN_WIDTH * 0.2,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: 0.3,
          duration: 120,
          useNativeDriver: true,
        }),
      ]);
      
      currentAnimation.current = outAnimation;
      outAnimation.start((finished) => {
        if (!finished || !isMountedRef.current) {
          isAnimating.current = false;
          currentAnimation.current = null;
          return;
        }
        
        // Verify model is still valid before changing
        const currentIndex = sortedModels.indexOf(selectedModel);
        const newPrevIndex = currentIndex - 1;
        const newPrevModel = newPrevIndex >= 0 ? sortedModels[newPrevIndex] : null;
        
        if (newPrevModel && newPrevModel !== selectedModel) {
          // Change model
          setSelectedModel(newPrevModel);
          // Reset position from left
          pillTranslateX.setValue(-SCREEN_WIDTH * 0.2);
          
          // Animate in from left
          const inAnimation = Animated.parallel([
            Animated.timing(pillTranslateX, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(pillOpacity, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]);
          
          currentAnimation.current = inAnimation;
          inAnimation.start((finished) => {
            if (finished && isMountedRef.current) {
              isAnimating.current = false;
            }
            currentAnimation.current = null;
          });
        } else {
          // Model changed or invalid, reset animation state
          pillTranslateX.setValue(0);
          pillOpacity.setValue(1);
          isAnimating.current = false;
          currentAnimation.current = null;
        }
      });
    }
  }, [hasPreviousModel, currentModelIndex, sortedModels, selectedModel, stopCurrentAnimation]);

  const navigateToNext = useCallback(() => {
    if (!hasNextModel || sortedModels.length === 0 || isAnimating.current || !isMountedRef.current) return;
    
    // Stop any ongoing animation
    stopCurrentAnimation();
    
    const nextIndex = currentModelIndex + 1;
    const nextModel = sortedModels[nextIndex];
    if (nextIndex < sortedModels.length && nextModel && nextModel !== selectedModel) {
      isAnimating.current = true;
      userTouchedRef.current = true;
      
      // Animate out to left
      const outAnimation = Animated.parallel([
        Animated.timing(pillTranslateX, {
          toValue: -SCREEN_WIDTH * 0.2,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: 0.3,
          duration: 120,
          useNativeDriver: true,
        }),
      ]);
      
      currentAnimation.current = outAnimation;
      outAnimation.start((finished) => {
        if (!finished || !isMountedRef.current) {
          isAnimating.current = false;
          currentAnimation.current = null;
          return;
        }
        
        // Verify model is still valid before changing
        const currentIndex = sortedModels.indexOf(selectedModel);
        const newNextIndex = currentIndex + 1;
        const newNextModel = newNextIndex < sortedModels.length ? sortedModels[newNextIndex] : null;
        
        if (newNextModel && newNextModel !== selectedModel) {
          // Change model
          setSelectedModel(newNextModel);
          // Reset position from right
          pillTranslateX.setValue(SCREEN_WIDTH * 0.2);
          
          // Animate in from right
          const inAnimation = Animated.parallel([
            Animated.timing(pillTranslateX, {
              toValue: 0,
              duration: 220,
              useNativeDriver: true,
            }),
            Animated.timing(pillOpacity, {
              toValue: 1,
              duration: 220,
              useNativeDriver: true,
            }),
          ]);
          
          currentAnimation.current = inAnimation;
          inAnimation.start((finished) => {
            if (finished && isMountedRef.current) {
              isAnimating.current = false;
            }
            currentAnimation.current = null;
          });
        } else {
          // Model changed or invalid, reset animation state
          pillTranslateX.setValue(0);
          pillOpacity.setValue(1);
          isAnimating.current = false;
          currentAnimation.current = null;
        }
      });
    }
  }, [hasNextModel, currentModelIndex, sortedModels, selectedModel, stopCurrentAnimation]);

  // Animation refs for pill swipe
  const pillTranslateX = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const isAnimating = useRef(false);
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Stop any ongoing animations
      if (currentAnimation.current) {
        currentAnimation.current.stop();
        currentAnimation.current = null;
      }
      isAnimating.current = false;
    };
  }, []);

  // PanResponder for swipe gestures
  const panResponder = useMemo(
    () => PanResponder.create({
      onStartShouldSetPanResponder: () => {
        return sortedModels.length > 1 && !isAnimating.current;
      },
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (sortedModels.length <= 1 || isAnimating.current) return false;
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderGrant: () => {
        if (isAnimating.current) return;
        pillTranslateX.setValue(0);
        pillOpacity.setValue(1);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isAnimating.current) return;
        const resistance = 0.5;
        const maxDrag = 60;
        const dragAmount = Math.max(-maxDrag, Math.min(maxDrag, gestureState.dx * resistance));
        pillTranslateX.setValue(dragAmount);
        const opacityChange = 1 - Math.abs(dragAmount) / maxDrag * 0.1;
        pillOpacity.setValue(Math.max(0.9, opacityChange));
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isAnimating.current || sortedModels.length <= 1 || !isMountedRef.current) {
          return;
        }

        const swipeThreshold = 50;
        const velocity = gestureState.vx || 0;
        const dx = gestureState.dx || 0;

        if (dx > swipeThreshold || velocity > 0.3) {
          // Swipe right - go to previous
          if (hasPreviousModel) {
            navigateToPrevious();
          } else {
            // Snap back if no previous model
            stopCurrentAnimation();
            isAnimating.current = true;
            const snapBack = Animated.parallel([
              Animated.timing(pillTranslateX, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(pillOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]);
            currentAnimation.current = snapBack;
            snapBack.start((finished) => {
              if (finished && isMountedRef.current) {
                isAnimating.current = false;
              }
              currentAnimation.current = null;
            });
          }
        } else if (dx < -swipeThreshold || velocity < -0.3) {
          // Swipe left - go to next
          if (hasNextModel) {
            navigateToNext();
          } else {
            // Snap back if no next model
            stopCurrentAnimation();
            isAnimating.current = true;
            const snapBack = Animated.parallel([
              Animated.timing(pillTranslateX, {
                toValue: 0,
                duration: 200,
                useNativeDriver: true,
              }),
              Animated.timing(pillOpacity, {
                toValue: 1,
                duration: 200,
                useNativeDriver: true,
              }),
            ]);
            currentAnimation.current = snapBack;
            snapBack.start((finished) => {
              if (finished && isMountedRef.current) {
                isAnimating.current = false;
              }
              currentAnimation.current = null;
            });
          }
        } else {
          // Snap back to center if swipe wasn't strong enough
          stopCurrentAnimation();
          isAnimating.current = true;
          const snapBack = Animated.parallel([
            Animated.timing(pillTranslateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(pillOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]);
          currentAnimation.current = snapBack;
          snapBack.start((finished) => {
            if (finished && isMountedRef.current) {
              isAnimating.current = false;
            }
            currentAnimation.current = null;
          });
        }
      },
      onPanResponderTerminate: () => {
        if (!isAnimating.current && isMountedRef.current) {
          stopCurrentAnimation();
          isAnimating.current = true;
          const snapBack = Animated.parallel([
            Animated.timing(pillTranslateX, {
              toValue: 0,
              duration: 200,
              useNativeDriver: true,
            }),
            Animated.timing(pillOpacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]);
          currentAnimation.current = snapBack;
          snapBack.start((finished) => {
            if (finished && isMountedRef.current) {
              isAnimating.current = false;
            }
            currentAnimation.current = null;
          });
        }
      },
    }),
    [sortedModels.length, hasPreviousModel, hasNextModel, navigateToPrevious, navigateToNext, stopCurrentAnimation]
  );

  // Stats calculation
  const stats = useModelStats(usageRecords, selectedModel);

  // Animations
  const tpsAnim = useChartAnimations(stats?.tpsData);
  const infAnim = useChartAnimations(stats?.timeData);
  const modalAnim = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    if (modalVisible) {
      modalAnim.setValue(0.8);
      Animated.spring(modalAnim, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
  }, [modalVisible]);

  const stylesLocalWithTheme = createStylesLocal(theme.colors);
  
  const perfColor = (p?: 'High' | 'Medium' | 'Low' | 'Very Low') =>
    p === 'High'
      ? theme.colors.success
      : p === 'Medium'
      ? theme.colors.warning
      : p === 'Low'
      ? theme.colors.error
      : p === 'Very Low'
      ? theme.colors.error // Use error color for very low, maybe with different opacity
      : theme.colors.secondary;

  // Error handling
  if (error) {
    return (
      <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
        <Text style={{ marginBottom: 20, color: theme.colors.text }}>Error: {error}</Text>
        <TouchableOpacity onPress={onBack} style={[stylesLocalWithTheme.btn, { backgroundColor: theme.colors.primary }]}>
          <Text style={stylesLocalWithTheme.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.accent} />
      </View>
    );
  }

  // Chart configs
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'transparent',
    backgroundGradientTo: 'transparent',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    color: (o = 1) => hexToRgba(theme.colors.accent, o),
    labelColor: () => 'transparent',
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForDots: { r: '0' },
    fillShadowGradient: theme.colors.accent,
    fillShadowGradientOpacity: 0.25,
  };

  const chartConfigDetailed = {
    ...chartConfig,
    labelColor: (o = 1) => hexToRgba(theme.colors.text, o),
  };

  // Chart components
  const Chart: FC<{ data: number[]; anim: Animated.Value }> = ({ data, anim }) => (
    <Animated.View
      style={{
        width: anim,
        height: GRAPH_HEIGHT + GRAPH_SHIFT,
        position: 'absolute',
        bottom: -GRAPH_SHIFT,
        left: 0,
        overflow: 'hidden',
      }}
    >
      <LineChart
        data={{ labels: data.map(() => ''), datasets: [{ data }] }}
        width={GRAPH_WIDTH}
        height={GRAPH_HEIGHT + GRAPH_SHIFT}
        chartConfig={chartConfig}
        bezier
        withDots={false}
        withInnerLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={false}
        withVerticalLines={false}
        withHorizontalLines={false}
        style={stylesChart.chart}
      />
    </Animated.View>
  );

  const getSuggestions = () => {
    if (!stats) return ['No usage logs available. Start using the model to gather insights.'];
    
    const suggestions: string[] = [];
    if (stats.avgTime > 100) suggestions.push('Average inference time is high—consider optimising.');
    if (stats.avgTps < 12) {
      if (stats.avgTps < 6) {
        suggestions.push('Performance is very low (< 6 tokens/s)—consider a smaller model or better device.');
      } else {
        suggestions.push('Performance is below good threshold (< 12 tokens/s)—try a smaller model.');
      }
    }
    if (stats.total < 5) suggestions.push('Generate more inferences for deeper insight.');
    if (!suggestions.length) {
      if (stats.avgTps >= 18) {
        suggestions.push('Great performance—keep going!');
      } else {
        suggestions.push('Good performance—consider optimizing for even better results.');
      }
    }
    
    return suggestions;
  };
  
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }]}>
      {/* Fixed header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 10, backgroundColor: theme.colors.background }}>
        <Text style={[shared.settingsTitle, stylesLocalWithTheme.title, { color: theme.colors.text }]}>Performance</Text>
      </View>
      
      <ScrollView
        style={[shared.container, stylesLocalWithTheme.scroll]}
        contentContainerStyle={stylesLocalWithTheme.scrollContent}
      >
        {selectedModel && stats && (
          <>
            {/* Stats cards */}
            <View style={stylesLocal.row}>
              <View style={[stylesLocalWithTheme.statCard, { marginRight: 10, backgroundColor: theme.colors.glass }]}>
                <View style={stylesLocalWithTheme.statInner}>
                  <Text style={[stylesLocalWithTheme.statValue, { color: theme.colors.text }]}>{stats.total}</Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: theme.colors.textSecondary }]}>total inferences</Text>
                </View>
              </View>

              <View style={[stylesLocalWithTheme.statCard, { backgroundColor: perfColor(stats.perf) }]}>
                <View style={stylesLocalWithTheme.statInner}>
                  <Text style={[stylesLocalWithTheme.perfValue, { color: (stats.perf === 'High' || stats.perf === 'Medium') ? theme.colors.primaryText : theme.colors.text }]}>
                    {stats.perf}
                  </Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: (stats.perf === 'High' || stats.perf === 'Medium') ? theme.colors.primaryText : theme.colors.text }]}>
                    Performance level
                  </Text>
                </View>
              </View>
            </View>

            {/* Graph cards */}
            <View style={stylesLocalWithTheme.row}>
              <TouchableOpacity
                onPress={() => { setGraphType('tps'); setModalVisible(true); }}
                style={{ marginRight: 10 }}
              >
                <View style={[stylesLocalWithTheme.graphCard, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTps.toFixed(0)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg tokens/sec</Text>
                  {stats.tpsData.length ? (
                    <Chart data={stats.tpsData.slice(-20)} anim={tpsAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.accent} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setGraphType('inf'); setModalVisible(true); }}
              >
                <View style={[stylesLocalWithTheme.graphCard, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTime.toFixed(0)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg ms/inference</Text>
                  {stats.timeData.length ? (
                    <Chart data={stats.timeData.slice(-20)} anim={infAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.accent} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Suggestions */}
        <View style={[stylesLocalWithTheme.suggestionCard, { backgroundColor: theme.colors.glass }]}>
          <View style={stylesLocalWithTheme.suggestionHeader}>
            <Text style={[stylesLocalWithTheme.suggestionTitle, { color: theme.colors.text }]}>Suggestions</Text>
            <Ionicons name="bulb-outline" size={22} color={theme.colors.text} />
          </View>
          {getSuggestions().map((msg, i) => (
            <Text key={i} style={[stylesLocalWithTheme.suggestionText, { color: theme.colors.textSecondary }]}>{msg}</Text>
          ))}
        </View>
      </ScrollView>

      {/* Model selector - centered pill with swipe and arrow buttons */}
      <View style={stylesLocalWithTheme.modelBar}>
        <View style={stylesLocalWithTheme.modelContainer}>
          {/* Left arrow button - absolutely positioned */}
          {hasPreviousModel && (
            <TouchableOpacity
              onPress={navigateToPrevious}
              style={[stylesLocalWithTheme.arrowButton, stylesLocalWithTheme.arrowButtonLeft, { backgroundColor: theme.colors.primary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={20} color={theme.colors.primaryText} />
            </TouchableOpacity>
          )}
          
          {/* Centered pill with swipe gesture */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              stylesLocalWithTheme.modelChip,
              {
                backgroundColor: theme.colors.primary,
                transform: [{ translateX: pillTranslateX }],
                opacity: pillOpacity,
              },
            ]}
          >
            <Text
              style={[stylesLocalWithTheme.modelText, { color: theme.colors.primaryText }]}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {selectedModel ? stripFileExtension(selectedModel) : 'No model selected'}
            </Text>
          </Animated.View>

          {/* Right arrow button - absolutely positioned */}
          {hasNextModel && (
            <TouchableOpacity
              onPress={navigateToNext}
              style={[stylesLocalWithTheme.arrowButton, stylesLocalWithTheme.arrowButtonRight, { backgroundColor: theme.colors.primary }]}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-forward" size={20} color={theme.colors.primaryText} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Detail modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={[stylesLocalWithTheme.modalOverlay, { backgroundColor: theme.colors.overlay }]}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableWithoutFeedback>
            <Animated.View style={[
              stylesLocalWithTheme.modalCard,
              { 
                transform: [{ scale: modalAnim }], 
                alignItems: 'flex-start',
                backgroundColor: theme.colors.card,
              }
            ]}>
              <Text style={[stylesLocalWithTheme.modalTitle, { color: theme.colors.text }]}>
                {graphType === 'tps' ? 'Tokens Per Second' : 'Inference Time (ms)'}
              </Text>
              {stats && (
                <View style={{ width: SCREEN_WIDTH - 80, alignSelf: 'flex-start' }}>
                  <LineChart
                    data={{
                      labels: (graphType === 'tps' ? stats.tpsData : stats.timeData)
                        .map((_, i) => `${i + 1}`),
                      datasets: [{
                        data: graphType === 'tps' ? stats.tpsData : stats.timeData
                      }],
                    }}
                    width={SCREEN_WIDTH - 80}
                    height={300 + GRAPH_SHIFT}
                    chartConfig={chartConfigDetailed}
                    yLabelsOffset={10}
                    bezier
                    withDots
                    withInnerLines
                    withHorizontalLabels
                    withVerticalLabels
                    withHorizontalLines
                    withVerticalLines={false}
                    style={{
                      backgroundColor: 'transparent',
                      marginLeft: -20,
                      marginBottom: -GRAPH_SHIFT,
                    }}
                  />
                </View>
              )}
            </Animated.View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* Navigation buttons */}
      <View style={[stylesLocalWithTheme.fixedBtn, { left: 15, bottom: 20, backgroundColor: "transparent" }]}>
        <TouchableOpacity style={[stylesLocalWithTheme.btn, { backgroundColor: theme.colors.primary }]} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text style={stylesLocalWithTheme.btnText}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={[stylesLocalWithTheme.fixedBtn, { right: 15, bottom: 20, backgroundColor: "transparent" }]}>
        <TouchableOpacity
          style={[stylesLocalWithTheme.btn, { backgroundColor: theme.colors.error }]}
          onPress={() => showAlert(
            'Clear Usage Data',
            'Are you sure?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Clear',
                style: 'destructive',
                onPress: clearUsageData
              },
            ]
          )}
        >
          <Text style={[stylesLocalWithTheme.btnText, { marginLeft: 0 }]}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Chart configs will be created dynamically based on theme in component

// perfColor will be defined within component to access theme

/* ───────────────────────────── styles ───────────────────────────── */
const createStylesLocal = (colors: any) => StyleSheet.create({
  scroll: { padding: 20 },
  scrollContent: { paddingBottom: 220 },
  title: { marginBottom: 40 },
  row: { flexDirection: 'row', marginBottom: 10 },

  statCard: {
    width: GRAPH_WIDTH,
    height: STAT_CARD_HEIGHT,
    borderRadius: RADIUS,
    position: 'relative',
  },
  statInner: { position: 'absolute', bottom: 15, left: 15 },
  statValue: { fontSize: 42, fontWeight: '700' },
  perfValue: { fontSize: 34, fontWeight: '700' },
  statCaption: { fontSize: 12 },

  graphCard: {
    borderRadius: RADIUS,
    paddingTop: 10,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT + 60,
    overflow: 'hidden',
  },
  graphValue: { fontSize: 36, fontWeight: '600', paddingLeft: 10 },
  graphCaption: { fontSize: 12, marginBottom: 5, paddingLeft: 10 },

  suggestionCard: {
    borderRadius: RADIUS,
    padding: 20,
    marginBottom: 20,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  suggestionTitle: { fontSize: 18, marginRight: 6 },
  suggestionText: { fontSize: 14, marginBottom: 4 },

  modelBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 80,
    paddingHorizontal: 20,
  },
  modelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  modelChip: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 24,
    minWidth: 120,
    maxWidth: SCREEN_WIDTH - 140,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  modelText: {
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 20,
  },
  arrowButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
  },
  arrowButtonLeft: {
    left: 0,
  },
  arrowButtonRight: {
    right: 0,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    borderRadius: RADIUS,
    padding: 20,
    width: SCREEN_WIDTH - 40,
    overflow: 'hidden',
  },
  modalTitle: { fontSize: 18, marginBottom: 10 },

  fixedBtn: { position: 'absolute', bottom: 20 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  btnText: {
    color: colors.primaryText,
    fontSize: 20,
    fontFamily: 'Poppins',
    marginLeft: 8,
    marginBottom: 2,
  },
});

const stylesLocal = createStylesLocal({ primaryText: '#fff' }); // Will be overridden

const stylesChart = StyleSheet.create({
  chart: { backgroundColor: 'transparent', paddingLeft: 0, paddingRight: 0 },
});

export default StagesScreen;
