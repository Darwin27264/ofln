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
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LineChart } from 'react-native-chart-kit';
import { createStyles } from '../styles/styles';
import { useTheme } from '../context/ThemeContext';
import { showAlert } from '../components/CustomAlert';
import {
  getAccelerationStatusSnapshot,
  type AccelerationStatusSnapshot,
} from '../services/accelerationCapabilityService';
import {
  loadUsageRecords,
  clearUsageRecords,
  clearUsageRecordsForModel,
  computeUsageAverages,
  computeModelPerformanceStats,
  filterRecordsForModel,
  isValidUsageRecord,
  normalizeModelName,
  type UsageMetrics,
  type ModelPerformanceStats,
} from '../services/performanceTracking';
import { llamaProvider } from '../providers/llamaProvider';
import { EASING, OVERLAY_MOTION } from '../utils/animationConfig';
import { FrostedGlass } from '../components/FrostedGlass';

/* ──────────────────────────────────── constants ──────────────────────────────────── */
const RADIUS = 30;
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_WIDTH = (SCREEN_WIDTH - 50) / 2;
const GRAPH_HEIGHT = 120;
const GRAPH_SHIFT = 18;
const STAT_CARD_HEIGHT = GRAPH_HEIGHT + 30;

interface Props {
  downloadedModels: string[];
  onBack: () => void;
}

/* ──────────────────────────────── hooks ──────────────────────────────── */
const useUsageData = () => {
  const [usageRecords, setUsageRecords] = useState<UsageMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadUsageData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setUsageRecords(await loadUsageRecords());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load usage data');
      setUsageRecords([]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearUsageDataForModel = async (model: string) => {
    try {
      setUsageRecords(await clearUsageRecordsForModel(model));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear usage data');
    }
  };

  const clearAllUsageData = async () => {
    try {
      await clearUsageRecords();
      setUsageRecords([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to clear usage data');
    }
  };

  useEffect(() => {
    loadUsageData();
  }, []);

  return { usageRecords, isLoading, error, clearUsageDataForModel, clearAllUsageData };
};

const useModelStats = (
  usageRecords: UsageMetrics[],
  selectedModel: string | null,
): ModelPerformanceStats | null => {
  return useMemo(
    () => computeModelPerformanceStats(usageRecords, selectedModel),
    [usageRecords, selectedModel],
  );
};

/* ───────────────────────────── utils ───────────────────────────── */
const stripFileExtension = (modelName: string): string => {
  if (!modelName) return modelName;
  return modelName.replace(/\.(gguf|bin|safetensors|pt|pth|onnx|h5)$/i, '').trim();
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

/* ──────────────────────────────────── component ──────────────────────────────────── */
const StagesScreen: FC<Props> = ({ downloadedModels, onBack }) => {
  const { theme, isDark } = useTheme();
  const graphLineColor = isDark ? '#FFFFFF' : '#6B7280';
  const shared = createStyles(theme.colors);
  const { usageRecords, isLoading, error, clearUsageDataForModel, clearAllUsageData } = useUsageData();
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [graphType, setGraphType] = useState<'tps' | 'inf' | null>(null);
  const userTouchedRef = useRef(false);
  const [accelStatus, setAccelStatus] = useState<AccelerationStatusSnapshot | null>(null);

  // One-shot on mount — cached capability + last load snapshot; no polling.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getAccelerationStatusSnapshot(llamaProvider.isReady());
        if (!cancelled) setAccelStatus(snap);
      } catch {
        if (!cancelled) setAccelStatus(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Models sorting and selection
  const sortedModels = useMemo(() => {
    return downloadedModels
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => {
        const keyA = normalizeModelName(a.m);
        const keyB = normalizeModelName(b.m);
        const countA = usageRecords.filter(
          (r) => normalizeModelName(r.model) === keyA && isValidUsageRecord(r),
        ).length;
        const countB = usageRecords.filter(
          (r) => normalizeModelName(r.model) === keyB && isValidUsageRecord(r),
        ).length;
        return countB !== countA ? countB - countA : a.idx - b.idx;
      })
      .map((o) => o.m);
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

  const selectedModelHasRecords = useMemo(() => {
    if (!selectedModel) return false;
    const key = normalizeModelName(selectedModel);
    return usageRecords.some((r) => normalizeModelName(r.model) === key);
  }, [selectedModel, usageRecords]);

  const hasAnyUsageRecords = usageRecords.length > 0;

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

  const resourceAverages = useMemo(() => {
    if (!selectedModel) return null;
    return computeUsageAverages(filterRecordsForModel(usageRecords, selectedModel));
  }, [usageRecords, selectedModel]);

  // Animations
  const tpsAnim = useChartAnimations(stats?.tpsData);
  const infAnim = useChartAnimations(stats?.timeData);
  const modalAnim = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const modalOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (modalVisible) {
      modalAnim.setValue(OVERLAY_MOTION.FROM_SCALE);
      modalOpacity.setValue(0);
      Animated.parallel([
        Animated.timing(modalOpacity, {
          toValue: 1,
          duration: OVERLAY_MOTION.FADE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
        Animated.timing(modalAnim, {
          toValue: 1,
          duration: OVERLAY_MOTION.SCALE_IN_MS,
          easing: EASING.EASE_OUT,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [modalVisible, modalAnim, modalOpacity]);

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
        <ActivityIndicator size="large" color={theme.colors.text} />
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
    color: (o = 1) => hexToRgba(graphLineColor, o),
    labelColor: () => 'transparent',
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForDots: { r: '0' },
    fillShadowGradient: graphLineColor,
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
    if (stats.valid < stats.total) {
      suggestions.push(
        `${stats.total - stats.valid} empty/failed run(s) were excluded from averages.`,
      );
    }
    // avgTime is decode ms when native timings exist — >3s decode is slow for chat.
    if (stats.avgTime > 3000) {
      suggestions.push('Average decode time is high—try fewer max tokens or a smaller model.');
    }
    if (stats.avgTps < 12) {
      if (stats.avgTps < 6) {
        suggestions.push(
          'Generation speed is very low (< 6 tok/s)—use a smaller quant or enable acceleration if available.',
        );
      } else {
        suggestions.push(
          'Generation speed is moderate (< 12 tok/s)—Q4_0 + GPU/NPU usually helps on Android.',
        );
      }
    }
    if (stats.accelOnShare === 0 && accelStatus?.available) {
      suggestions.push(
        'Acceleration is available on this device but recent runs used CPU—check GPU layers and quant (Q4_0/Q6_K).',
      );
    }
    if (stats.valid < 5) {
      suggestions.push('Run a few more chats for stabler averages.');
    }
    if (!suggestions.length) {
      if (stats.avgTps >= 18) {
        suggestions.push('Strong generation speed—looking good.');
      } else {
        suggestions.push('Solid generation speed for on-device chat.');
      }
    }

    return suggestions;
  };
  
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background, padding: 20 }]}>
      <Text style={[shared.settingsTitle, stylesLocalWithTheme.title, { color: theme.colors.text }]}>Performance</Text>

      <ScrollView
        style={stylesLocalWithTheme.scroll}
        contentContainerStyle={stylesLocalWithTheme.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {selectedModel && stats && (
          <>
            {/* Stats cards */}
            <View style={stylesLocal.row}>
              <View style={[stylesLocalWithTheme.statCard, { marginRight: 10, backgroundColor: theme.colors.glass }]}>
                <View style={stylesLocalWithTheme.statInner}>
                  <Text style={[stylesLocalWithTheme.statValue, { color: theme.colors.text }]}>
                    {stats.valid}
                  </Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: theme.colors.textSecondary }]}>
                    {stats.valid === stats.total
                      ? 'valid runs'
                      : `valid of ${stats.total} logged`}
                  </Text>
                </View>
              </View>

              <View style={[stylesLocalWithTheme.statCard, { backgroundColor: perfColor(stats.perf) }]}>
                <View style={stylesLocalWithTheme.statInner}>
                  <Text style={[stylesLocalWithTheme.perfValue, { color: (stats.perf === 'High' || stats.perf === 'Medium') ? theme.colors.primaryText : theme.colors.text }]}>
                    {stats.perf}
                  </Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: (stats.perf === 'High' || stats.perf === 'Medium') ? theme.colors.primaryText : theme.colors.text }]}>
                    from avg tok/s
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
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTps.toFixed(1)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg tok/s</Text>
                  {stats.tpsData.length ? (
                    <Chart data={stats.tpsData.slice(-20)} anim={tpsAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.text} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setGraphType('inf'); setModalVisible(true); }}
              >
                <View style={[stylesLocalWithTheme.graphCard, { backgroundColor: theme.colors.surface }]}>
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTime.toFixed(0)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg decode ms</Text>
                  {stats.timeData.length ? (
                    <Chart data={stats.timeData.slice(-20)} anim={infAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.text} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Avg resource usage from usage log (not realtime) */}
        <View style={[stylesLocalWithTheme.statusCard, { backgroundColor: theme.colors.glass }]}>
          <View style={stylesLocalWithTheme.statusHeader}>
            <Ionicons name="analytics-outline" size={20} color={theme.colors.text} />
            <Text style={[stylesLocalWithTheme.statusTitle, { color: theme.colors.text }]}>
              Avg resource usage
            </Text>
          </View>
          {resourceAverages ? (
            <View style={stylesLocalWithTheme.resourceGrid}>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {resourceAverages.avgTokensPerSecond.toFixed(1)}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  avg tok/s (weighted)
                </Text>
              </View>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {resourceAverages.medianTokensPerSecond != null
                    ? resourceAverages.medianTokensPerSecond.toFixed(1)
                    : '—'}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  median tok/s
                </Text>
              </View>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {Math.round(resourceAverages.avgInferenceTimeMs)}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  avg decode ms
                </Text>
              </View>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {resourceAverages.avgWallTimeMs != null
                    ? Math.round(resourceAverages.avgWallTimeMs)
                    : '—'}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  avg response ms
                </Text>
              </View>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {resourceAverages.avgTokensPerInference.toFixed(0)}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  avg tokens/run
                </Text>
              </View>
              <View style={stylesLocalWithTheme.resourceCell}>
                <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                  {resourceAverages.accelOnShare != null
                    ? `${Math.round(resourceAverages.accelOnShare * 100)}%`
                    : '—'}
                </Text>
                <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                  runs accelerated
                </Text>
              </View>
            </View>
          ) : (
            <Text style={[stylesLocalWithTheme.statusHint, { color: theme.colors.textSecondary }]}>
              {selectedModel
                ? 'No valid runs yet for this model. Chat a bit to build averages.'
                : 'Select a model to see averages from past runs.'}
            </Text>
          )}
          <Text style={[stylesLocalWithTheme.statusFootnote, { color: theme.colors.textSecondary }]}>
            Tok/s uses native decode timing when available. Empty/failed runs are excluded.
          </Text>
        </View>

        {/* Hardware acceleration — available vs currently on */}
        <View style={[stylesLocalWithTheme.statusCard, { backgroundColor: theme.colors.glass }]}>
          <View style={stylesLocalWithTheme.statusHeader}>
            <Ionicons name="hardware-chip-outline" size={20} color={theme.colors.text} />
            <Text style={[stylesLocalWithTheme.statusTitle, { color: theme.colors.text }]}>
              Hardware acceleration
            </Text>
          </View>
          {accelStatus ? (
            <>
              <View style={stylesLocalWithTheme.statusRow}>
                <Text style={[stylesLocalWithTheme.statusLabel, { color: theme.colors.textSecondary }]}>
                  Available
                </Text>
                <View style={stylesLocalWithTheme.statusValueWrap}>
                  <View
                    style={[
                      stylesLocalWithTheme.statusDot,
                      {
                        backgroundColor: accelStatus.available
                          ? theme.colors.success
                          : theme.colors.textSecondary,
                      },
                    ]}
                  />
                  <Text style={[stylesLocalWithTheme.statusValue, { color: theme.colors.text }]}>
                    {accelStatus.available ? accelStatus.availableLabel : 'Not available'}
                  </Text>
                </View>
              </View>
              <View style={stylesLocalWithTheme.statusRow}>
                <Text style={[stylesLocalWithTheme.statusLabel, { color: theme.colors.textSecondary }]}>
                  Currently on
                </Text>
                <View style={stylesLocalWithTheme.statusValueWrap}>
                  <View
                    style={[
                      stylesLocalWithTheme.statusDot,
                      {
                        backgroundColor:
                          accelStatus.on === true
                            ? theme.colors.success
                            : accelStatus.on === false
                              ? theme.colors.warning
                              : theme.colors.textSecondary,
                      },
                    ]}
                  />
                  <Text
                    style={[stylesLocalWithTheme.statusValue, { color: theme.colors.text }]}
                    numberOfLines={2}
                  >
                    {accelStatus.on === true
                      ? `On · ${accelStatus.onLabel}`
                      : accelStatus.on === false
                        ? accelStatus.onLabel
                        : 'No model loaded'}
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <Text style={[stylesLocalWithTheme.statusHint, { color: theme.colors.textSecondary }]}>
              Checking device backends…
            </Text>
          )}
        </View>

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

      {/* Model selector - centered frosted pill with swipe and arrow buttons */}
      <View style={stylesLocalWithTheme.modelBar}>
        <View style={stylesLocalWithTheme.modelContainer}>
          {/* Left arrow button - absolutely positioned */}
          {hasPreviousModel && (
            <TouchableOpacity
              onPress={navigateToPrevious}
              style={[stylesLocalWithTheme.arrowButton, stylesLocalWithTheme.arrowButtonLeft, { borderColor: theme.colors.border }]}
              activeOpacity={0.7}
            >
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <Ionicons name="chevron-back" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          )}
          
          {/* Centered pill with swipe gesture */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              stylesLocalWithTheme.modelChip,
              {
                borderColor: theme.colors.border,
                transform: [{ translateX: pillTranslateX }],
                opacity: pillOpacity,
              },
            ]}
          >
            <FrostedGlass style={StyleSheet.absoluteFillObject} />
            <Text
              style={[stylesLocalWithTheme.modelText, { color: theme.colors.text }]}
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
              style={[stylesLocalWithTheme.arrowButton, stylesLocalWithTheme.arrowButtonRight, { borderColor: theme.colors.border }]}
              activeOpacity={0.7}
            >
              <FrostedGlass style={StyleSheet.absoluteFillObject} />
              <Ionicons name="chevron-forward" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Detail modal */}
      <Modal visible={modalVisible} transparent animationType="none">
        <TouchableOpacity
          style={[stylesLocalWithTheme.modalOverlay, { backgroundColor: theme.colors.overlay }]}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableWithoutFeedback>
            <Animated.View style={[
              stylesLocalWithTheme.modalCard,
              { 
                opacity: modalOpacity,
                transform: [{ scale: modalAnim }], 
                alignItems: 'flex-start',
                backgroundColor: theme.colors.card,
              }
            ]}>
              <Text style={[stylesLocalWithTheme.modalTitle, { color: theme.colors.text }]}>
                {graphType === 'tps' ? 'Tokens Per Second (decode)' : 'Decode Time (ms)'}
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

      <View style={[stylesLocalWithTheme.fixedBtn, { right: 15, bottom: 20, backgroundColor: 'transparent' }]}>
        <TouchableOpacity
          style={[
            stylesLocalWithTheme.btn,
            {
              backgroundColor: theme.colors.error,
              opacity: hasAnyUsageRecords ? 1 : 0.45,
            },
          ]}
          disabled={!hasAnyUsageRecords}
          onPress={() => {
            const label = selectedModel ? stripFileExtension(selectedModel) : 'this model';
            const buttons: {
              text: string;
              style?: 'default' | 'destructive' | 'cancel';
              onPress?: () => void;
            }[] = [];

            if (selectedModelHasRecords && selectedModel) {
              buttons.push({
                text: 'Clear',
                style: 'destructive',
                onPress: () => clearUsageDataForModel(selectedModel),
              });
            }

            if (hasAnyUsageRecords) {
              buttons.push({
                text: 'Clear All',
                style: 'destructive',
                onPress: clearAllUsageData,
              });
            }

            buttons.push({ text: 'Cancel', style: 'cancel' });

            showAlert(
              'Clear usage data',
              selectedModelHasRecords
                ? `Clear history for "${label}", or remove data for every model.`
                : 'Remove performance history for every model? This cannot be undone.',
              buttons,
            );
          }}
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
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 130 },
  title: { marginBottom: 20 },
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

  statusCard: {
    borderRadius: RADIUS,
    padding: 16,
    marginBottom: 10,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 13,
    marginRight: 12,
    paddingTop: 2,
  },
  statusValueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  statusHint: {
    fontSize: 13,
    lineHeight: 18,
  },
  statusFootnote: {
    fontSize: 11,
    marginTop: 8,
    opacity: 0.85,
  },
  resourceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resourceCell: {
    width: '50%',
    paddingVertical: 8,
    paddingRight: 8,
  },
  resourceValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  resourceCaption: {
    fontSize: 11,
    marginTop: 2,
  },

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
    backgroundColor: 'transparent',
    borderWidth: 1,
    overflow: 'hidden',
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
    backgroundColor: 'transparent',
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 1,
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
