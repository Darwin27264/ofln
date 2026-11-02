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
import Clipboard from '@react-native-clipboard/clipboard';
import { FloatingBackButton } from '../components/FloatingBackButton';
import { BottomSheet } from '../components/BottomSheet';
import { useCollapsibleTitle } from '../hooks/useCollapsibleTitle';
import { CollapsibleTitle } from '../components/CollapsibleTitle';
import { useFloatingBackBottom, useScrollPadForFloatingBack } from '../utils/layoutInsets';
import {
  runBenchmark,
  loadLastBenchmark,
  formatRedditBenchmarkCard,
  type BenchmarkResult,
} from '../services/benchmarkService';
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
  buildUsageHistory,
  computeUsageTrend,
  filterRecordsForModel,
  isValidUsageRecord,
  normalizeModelName,
  type UsageMetrics,
  type ModelPerformanceStats,
} from '../services/performanceTracking';
import { llamaProvider } from '../providers/llamaProvider';
import { EASING, OVERLAY_MOTION, animateLayout } from '../utils/animationConfig';
import {
  FrostedGlass,
  FrostedPanel,
  SETTINGS_BLOCK,
} from '../components/FrostedGlass';

/* ──────────────────────────────────── constants ──────────────────────────────────── */
const RADIUS = SETTINGS_BLOCK.radius;
const SCREEN_WIDTH = Dimensions.get('window').width;
/** Screen pad 20×2 + Settings-style gutter×2 between the pair. */
const GRAPH_WIDTH =
  (SCREEN_WIDTH - 40 - SETTINGS_BLOCK.gutter * 2) / 2;
const GRAPH_HEIGHT = 120;
const GRAPH_SHIFT = 18;
const STAT_CARD_HEIGHT = GRAPH_HEIGHT + 30;
/** Extra scroll pad so last cards clear the floating model pill. */
const MODEL_PILL_SCROLL_CLEARANCE = 48;

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

/** Calm relative time for recent-run list (local-only usage log). */
const formatRelativeTime = (timestamp: number, now = Date.now()): string => {
  const sec = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 14) return `${days}d ago`;
  try {
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
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
  const { anim: titleAnim, handleScroll } = useCollapsibleTitle();
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();
  const { usageRecords, isLoading, error, clearUsageDataForModel, clearAllUsageData } = useUsageData();
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modalVisible, setModalVisible] = useState(false);
  const [accelModalOpen, setAccelModalOpen] = useState(false);
  const [suggestionsModalOpen, setSuggestionsModalOpen] = useState(false);
  const [graphType, setGraphType] = useState<'tps' | 'inf' | null>(null);
  const [recentRunsExpanded, setRecentRunsExpanded] = useState(false);
  const userTouchedRef = useRef(false);
  const [accelStatus, setAccelStatus] = useState<AccelerationStatusSnapshot | null>(null);
  const [benchmarkResult, setBenchmarkResult] = useState<BenchmarkResult | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const [benchmarkStage, setBenchmarkStage] = useState<string | null>(null);

  useEffect(() => {
    void loadLastBenchmark().then((res) => {
      if (res) setBenchmarkResult(res);
    });
  }, []);

  const handleRunBenchmark = async () => {
    if (isBenchmarking) return;
    if (!llamaProvider.isReady()) {
      showAlert(
        'Model Not Loaded',
        'Please load a model first from the chat or models tab before running the benchmark.',
        [{ text: 'OK' }],
      );
      return;
    }
    setIsBenchmarking(true);
    setBenchmarkStage('Starting benchmark…');
    try {
      const res = await runBenchmark((stage) => setBenchmarkStage(stage));
      setBenchmarkResult(res);
      showAlert(
        'Benchmark Complete',
        `Prompt: ${res.promptTokPerSec} tok/s · Generation: ${res.generationTokPerSec} tok/s · TTFT: ${res.ttftMs}ms`,
        [{ text: 'OK' }],
      );
    } catch (err: any) {
      showAlert(
        'Benchmark Failed',
        err?.message || 'Could not complete benchmark test.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsBenchmarking(false);
      setBenchmarkStage(null);
    }
  };

  const handleCopyBenchmarkCard = () => {
    if (!benchmarkResult) return;
    const card = formatRedditBenchmarkCard(benchmarkResult);
    Clipboard.setString(card);
    showAlert(
      'Benchmark Card Copied',
      'Reddit /r/LocalLLaMA markdown table copied to clipboard!',
      [{ text: 'OK' }],
    );
  };

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

  // Pill swipe animation state (declared before callbacks that close over them).
  const pillTranslateX = useRef(new Animated.Value(0)).current;
  const pillOpacity = useRef(new Animated.Value(1)).current;
  const pillScale = useRef(new Animated.Value(1)).current;
  const isAnimating = useRef(false);
  const currentAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const isMountedRef = useRef(true);

  const pillSpring = useMemo(
    () => ({
      stiffness: 420,
      damping: 28,
      mass: 0.72,
      overshootClamping: false,
      restDisplacementThreshold: 0.35,
      restSpeedThreshold: 0.35,
      useNativeDriver: true as const,
    }),
    [],
  );

  const stopCurrentAnimation = useCallback(() => {
    if (currentAnimation.current) {
      currentAnimation.current.stop();
      currentAnimation.current = null;
    }
    isAnimating.current = false;
  }, []);

  const runPillAnimation = useCallback((animation: Animated.CompositeAnimation) => {
    currentAnimation.current = animation;
    animation.start((finished) => {
      // Clear the busy flag when the run completes or is interrupted.
      if (!finished || isMountedRef.current) {
        isAnimating.current = false;
      }
      currentAnimation.current = null;
    });
  }, []);

  /** Snap the model pill back to center after a cancelled / incomplete swipe. */
  const snapPillToCenter = useCallback(() => {
    if (!isMountedRef.current) return;
    stopCurrentAnimation();
    isAnimating.current = true;
    runPillAnimation(
      Animated.parallel([
        Animated.spring(pillTranslateX, { ...pillSpring, toValue: 0 }),
        Animated.spring(pillOpacity, { ...pillSpring, toValue: 1, stiffness: 380 }),
        Animated.spring(pillScale, { ...pillSpring, toValue: 1, stiffness: 520 }),
      ]),
    );
  }, [
    pillOpacity,
    pillScale,
    pillSpring,
    pillTranslateX,
    runPillAnimation,
    stopCurrentAnimation,
  ]);

  /** Animate to an adjacent model. direction -1 = previous, +1 = next. */
  const navigateModelByOffset = useCallback(
    (direction: -1 | 1) => {
      const canMove = direction < 0 ? hasPreviousModel : hasNextModel;
      if (!canMove || sortedModels.length === 0 || isAnimating.current || !isMountedRef.current) {
        return;
      }

      stopCurrentAnimation();

      const targetIndex = currentModelIndex + direction;
      const targetModel = sortedModels[targetIndex];
      if (
        targetIndex < 0 ||
        targetIndex >= sortedModels.length ||
        !targetModel ||
        targetModel === selectedModel
      ) {
        return;
      }

      isAnimating.current = true;
      userTouchedRef.current = true;

      // Exit toward the swipe direction, then enter from the opposite side.
      const exitX = direction < 0 ? SCREEN_WIDTH * 0.22 : -SCREEN_WIDTH * 0.22;
      const enterX = -exitX;

      pillScale.setValue(0.96);

      const outAnimation = Animated.parallel([
        Animated.spring(pillTranslateX, {
          ...pillSpring,
          toValue: exitX,
          stiffness: 380,
          overshootClamping: true,
        }),
        Animated.timing(pillOpacity, {
          toValue: 0.25,
          duration: 100,
          easing: EASING.ACCELERATE,
          useNativeDriver: true,
        }),
        Animated.spring(pillScale, {
          ...pillSpring,
          toValue: 0.92,
          stiffness: 480,
          overshootClamping: true,
        }),
      ]);

      currentAnimation.current = outAnimation;
      outAnimation.start((finished) => {
        if (!finished || !isMountedRef.current) {
          isAnimating.current = false;
          currentAnimation.current = null;
          return;
        }

        const currentIndex = sortedModels.indexOf(selectedModel);
        const nextIndex = currentIndex + direction;
        const nextModel =
          nextIndex >= 0 && nextIndex < sortedModels.length ? sortedModels[nextIndex] : null;

        if (nextModel && nextModel !== selectedModel) {
          setSelectedModel(nextModel);
          pillTranslateX.setValue(enterX);
          pillOpacity.setValue(0.25);
          pillScale.setValue(0.94);
          runPillAnimation(
            Animated.parallel([
              Animated.spring(pillTranslateX, { ...pillSpring, toValue: 0 }),
              Animated.spring(pillOpacity, {
                ...pillSpring,
                toValue: 1,
                stiffness: 360,
              }),
              Animated.spring(pillScale, {
                ...pillSpring,
                toValue: 1,
                stiffness: 520,
              }),
            ]),
          );
        } else {
          pillTranslateX.setValue(0);
          pillOpacity.setValue(1);
          pillScale.setValue(1);
          isAnimating.current = false;
          currentAnimation.current = null;
        }
      });
    },
    [
      currentModelIndex,
      hasNextModel,
      hasPreviousModel,
      pillOpacity,
      pillScale,
      pillSpring,
      pillTranslateX,
      runPillAnimation,
      selectedModel,
      sortedModels,
      stopCurrentAnimation,
    ],
  );

  const navigateToPrevious = useCallback(() => navigateModelByOffset(-1), [navigateModelByOffset]);
  const navigateToNext = useCallback(() => navigateModelByOffset(1), [navigateModelByOffset]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (currentAnimation.current) {
        currentAnimation.current.stop();
        currentAnimation.current = null;
      }
      isAnimating.current = false;
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => sortedModels.length > 1 && !isAnimating.current,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          if (sortedModels.length <= 1 || isAnimating.current) return false;
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
        },
        onPanResponderGrant: () => {
          if (isAnimating.current) return;
          pillTranslateX.setValue(0);
          pillOpacity.setValue(1);
          pillScale.setValue(1);
        },
        onPanResponderMove: (_, gestureState) => {
          if (isAnimating.current) return;
          const resistance = 0.5;
          const maxDrag = 60;
          const dragAmount = Math.max(-maxDrag, Math.min(maxDrag, gestureState.dx * resistance));
          pillTranslateX.setValue(dragAmount);
          const progress = Math.abs(dragAmount) / maxDrag;
          pillOpacity.setValue(Math.max(0.88, 1 - progress * 0.12));
          pillScale.setValue(Math.max(0.96, 1 - progress * 0.04));
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isAnimating.current || sortedModels.length <= 1 || !isMountedRef.current) {
            return;
          }

          const swipeThreshold = 50;
          const velocity = gestureState.vx || 0;
          const dx = gestureState.dx || 0;

          if (dx > swipeThreshold || velocity > 0.3) {
            if (hasPreviousModel) navigateToPrevious();
            else snapPillToCenter();
          } else if (dx < -swipeThreshold || velocity < -0.3) {
            if (hasNextModel) navigateToNext();
            else snapPillToCenter();
          } else {
            snapPillToCenter();
          }
        },
        onPanResponderTerminate: () => {
          if (!isAnimating.current && isMountedRef.current) {
            snapPillToCenter();
          }
        },
      }),
    [
      hasNextModel,
      hasPreviousModel,
      navigateToNext,
      navigateToPrevious,
      snapPillToCenter,
      sortedModels.length,
    ],
  );

  const stats = useModelStats(usageRecords, selectedModel);

  const resourceAverages = useMemo(() => {
    if (!selectedModel) return null;
    return computeUsageAverages(filterRecordsForModel(usageRecords, selectedModel));
  }, [usageRecords, selectedModel]);

  // Personal tok/s history + half-vs-half trend from usage_log. Cap high for
  // "view all"; UI previews the first 5 rows.
  const recentHistory = useMemo(
    () => buildUsageHistory(usageRecords, selectedModel, 200),
    [usageRecords, selectedModel],
  );
  const visibleRecentHistory = useMemo(() => {
    if (recentRunsExpanded) return recentHistory;
    return recentHistory.slice(0, 5);
  }, [recentHistory, recentRunsExpanded]);
  const canExpandRecentRuns = recentHistory.length > 5;

  useEffect(() => {
    setRecentRunsExpanded(false);
  }, [selectedModel]);

  const usageTrend = useMemo(() => {
    // Prefer full series from stats when available (all valid runs).
    if (stats?.tpsData?.length) {
      return computeUsageTrend(stats.tpsData);
    }
    const chrono = [...recentHistory].reverse().map((h) => h.tokensPerSecond);
    return computeUsageTrend(chrono);
  }, [stats?.tpsData, recentHistory]);

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
      ? 'rgba(52, 199, 89, 0.32)'
      : p === 'Medium'
      ? 'rgba(255, 159, 10, 0.32)'
      : p === 'Low' || p === 'Very Low'
      ? 'rgba(255, 69, 58, 0.28)'
      : undefined;

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

  const suggestions = getSuggestions();
  
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background, padding: 20 }]}>
      <ScrollView
        style={stylesLocalWithTheme.scroll}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[stylesLocalWithTheme.scrollContent, { paddingBottom: scrollPadBottom + MODEL_PILL_SCROLL_CLEARANCE }]}
        showsVerticalScrollIndicator={false}
      >
        <CollapsibleTitle title="Performance" anim={titleAnim} />
        {selectedModel && stats && (
          <>
            {/* Stats cards */}
            <View style={stylesLocalWithTheme.row}>
              <FrostedPanel
                style={[
                  stylesLocalWithTheme.statCard,
                  { marginRight: SETTINGS_BLOCK.gutter },
                ]}
              >
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
              </FrostedPanel>

              <FrostedPanel
                style={[
                  stylesLocalWithTheme.statCard,
                  { marginLeft: SETTINGS_BLOCK.gutter },
                ]}
                overlayColor={perfColor(stats.perf)}
              >
                <View style={stylesLocalWithTheme.statInner}>
                  <Text style={[stylesLocalWithTheme.perfValue, { color: theme.colors.text }]}>
                    {stats.perf}
                  </Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: theme.colors.textSecondary }]}>
                    from avg tok/s
                  </Text>
                </View>
              </FrostedPanel>
            </View>

            {/* Graph cards */}
            <View style={stylesLocalWithTheme.row}>
              <TouchableOpacity
                onPress={() => { setGraphType('tps'); setModalVisible(true); }}
                style={{ marginRight: SETTINGS_BLOCK.gutter }}
              >
                <FrostedPanel style={stylesLocalWithTheme.graphCard}>
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTps.toFixed(1)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg tok/s</Text>
                  {stats.tpsData.length ? (
                    <Chart data={stats.tpsData.slice(-20)} anim={tpsAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.text} />
                  )}
                </FrostedPanel>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => { setGraphType('inf'); setModalVisible(true); }}
                style={{ marginLeft: SETTINGS_BLOCK.gutter }}
              >
                <FrostedPanel style={stylesLocalWithTheme.graphCard}>
                  <Text style={[stylesLocalWithTheme.graphValue, { color: theme.colors.text }]}>{stats.avgTime.toFixed(0)}</Text>
                  <Text style={[stylesLocalWithTheme.graphCaption, { color: theme.colors.textSecondary }]}>avg decode ms</Text>
                  {stats.timeData.length ? (
                    <Chart data={stats.timeData.slice(-20)} anim={infAnim} />
                  ) : (
                    <ActivityIndicator color={theme.colors.text} />
                  )}
                </FrostedPanel>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Avg resource usage from usage log (not realtime) */}
        <FrostedPanel style={stylesLocalWithTheme.statusCard}>
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
        </FrostedPanel>

        {/* Hardware acceleration & Suggestions — compact side-by-side boxes */}
        <View style={{ flexDirection: 'row', width: '100%', gap: 10, marginBottom: SETTINGS_BLOCK.gap }}>
          {/* Hardware acceleration compact box */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.85}
            onPress={() => setAccelModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Hardware acceleration details"
          >
            <FrostedPanel style={[stylesLocalWithTheme.statusCard, stylesLocalWithTheme.compactHalfCard]}>
              <View style={stylesLocalWithTheme.compactHeader}>
                <Ionicons name="hardware-chip-outline" size={18} color={theme.colors.text} />
                <Text
                  style={[stylesLocalWithTheme.compactTitle, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  Hardware
                </Text>
              </View>

              <View style={stylesLocalWithTheme.compactContent}>
                <View style={stylesLocalWithTheme.compactStatusRow}>
                  <View
                    style={[
                      stylesLocalWithTheme.statusDot,
                      {
                        backgroundColor:
                          accelStatus?.on === true
                            ? theme.colors.success
                            : accelStatus?.on === false
                              ? theme.colors.warning
                              : theme.colors.textSecondary,
                      },
                    ]}
                  />
                  <Text
                    style={[stylesLocalWithTheme.compactPrimaryValue, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {accelStatus?.on === true
                      ? 'On'
                      : accelStatus?.on === false
                        ? 'CPU'
                        : 'Idle'}
                  </Text>
                </View>

                <Text
                  style={[stylesLocalWithTheme.compactSubCaption, { color: theme.colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {accelStatus?.on === true
                    ? accelStatus.onLabel
                    : accelStatus?.available
                      ? `Avail: ${accelStatus.availableLabel}`
                      : 'CPU Only'}
                </Text>
              </View>

              <View style={stylesLocalWithTheme.compactFooter}>
                <Text style={[stylesLocalWithTheme.compactFooterText, { color: theme.colors.textTertiary }]}>
                  Details
                </Text>
                <Ionicons name="chevron-forward" size={13} color={theme.colors.textTertiary} />
              </View>
            </FrostedPanel>
          </TouchableOpacity>

          {/* Suggestions compact box */}
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={0.85}
            onPress={() => setSuggestionsModalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="Performance suggestions details"
          >
            <FrostedPanel style={[stylesLocalWithTheme.statusCard, stylesLocalWithTheme.compactHalfCard]}>
              <View style={stylesLocalWithTheme.compactHeader}>
                <Ionicons name="bulb-outline" size={18} color={theme.colors.accent || theme.colors.text} />
                <Text
                  style={[stylesLocalWithTheme.compactTitle, { color: theme.colors.text }]}
                  numberOfLines={1}
                >
                  Suggestions
                </Text>
              </View>

              <View style={stylesLocalWithTheme.compactContent}>
                <View style={stylesLocalWithTheme.compactStatusRow}>
                  <View
                    style={[
                      stylesLocalWithTheme.statusDot,
                      {
                        backgroundColor:
                          suggestions.length === 0 || (stats && stats.avgTps >= 18)
                            ? theme.colors.success
                            : theme.colors.accent || theme.colors.warning,
                      },
                    ]}
                  />
                  <Text
                    style={[stylesLocalWithTheme.compactPrimaryValue, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {suggestions.length === 0 || (stats && stats.avgTps >= 18)
                      ? 'Optimal'
                      : `${suggestions.length} tip${suggestions.length === 1 ? '' : 's'}`}
                  </Text>
                </View>

                <Text
                  style={[stylesLocalWithTheme.compactSubCaption, { color: theme.colors.textSecondary }]}
                  numberOfLines={2}
                >
                  {suggestions[0] || 'Strong performance'}
                </Text>
              </View>

              <View style={stylesLocalWithTheme.compactFooter}>
                <Text style={[stylesLocalWithTheme.compactFooterText, { color: theme.colors.textTertiary }]}>
                  View all
                </Text>
                <Ionicons name="chevron-forward" size={13} color={theme.colors.textTertiary} />
              </View>
            </FrostedPanel>
          </TouchableOpacity>
        </View>

        {/* On-device Benchmark & Reddit Card */}
        <FrostedPanel style={stylesLocalWithTheme.statusCard}>
          <View style={stylesLocalWithTheme.statusHeader}>
            <Ionicons name="speedometer-outline" size={20} color={theme.colors.text} />
            <Text style={[stylesLocalWithTheme.statusTitle, { color: theme.colors.text }]}>
              On-device benchmark
            </Text>
          </View>

          <Text style={[stylesLocalWithTheme.statusHint, { color: theme.colors.textSecondary, marginBottom: 12 }]}>
            Standardized test measuring prompt processing (PP), token generation (TG), time to first token (TTFT), and RAM.
          </Text>

          {benchmarkResult && (
            <View style={{ marginBottom: 14 }}>
              <View style={stylesLocalWithTheme.resourceGrid}>
                <View style={stylesLocalWithTheme.resourceCell}>
                  <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                    {benchmarkResult.promptTokPerSec.toFixed(1)}
                  </Text>
                  <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                    PP tok/s
                  </Text>
                </View>
                <View style={stylesLocalWithTheme.resourceCell}>
                  <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                    {benchmarkResult.generationTokPerSec.toFixed(1)}
                  </Text>
                  <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                    TG tok/s
                  </Text>
                </View>
                <View style={stylesLocalWithTheme.resourceCell}>
                  <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                    {benchmarkResult.ttftMs}ms
                  </Text>
                  <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                    TTFT
                  </Text>
                </View>
                <View style={stylesLocalWithTheme.resourceCell}>
                  <Text style={[stylesLocalWithTheme.resourceValue, { color: theme.colors.text }]}>
                    {benchmarkResult.peakRamMb ? `${(benchmarkResult.peakRamMb / 1024).toFixed(1)}G` : '—'}
                  </Text>
                  <Text style={[stylesLocalWithTheme.resourceCaption, { color: theme.colors.textSecondary }]}>
                    peak RAM
                  </Text>
                </View>
              </View>

              <Text
                style={[
                  stylesLocalWithTheme.statusFootnote,
                  { color: theme.colors.textSecondary, marginTop: 8 },
                ]}
              >
                Model: {benchmarkResult.modelName} · {benchmarkResult.accelBackend}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={handleRunBenchmark}
              disabled={isBenchmarking}
              style={[
                stylesLocalWithTheme.btn,
                {
                  flex: 1,
                  backgroundColor: theme.colors.primary,
                  opacity: isBenchmarking ? 0.7 : 1,
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  paddingVertical: 12,
                  gap: 8,
                },
              ]}
            >
              {isBenchmarking ? (
                <>
                  <ActivityIndicator size="small" color={theme.colors.primaryText} />
                  <Text style={stylesLocalWithTheme.btnText}>
                    {benchmarkStage || 'Benchmarking…'}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="play" size={16} color={theme.colors.primaryText} />
                  <Text style={stylesLocalWithTheme.btnText}>
                    {benchmarkResult ? 'Re-run benchmark' : 'Run benchmark'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {benchmarkResult && (
              <TouchableOpacity
                onPress={handleCopyBenchmarkCard}
                disabled={isBenchmarking}
                style={[
                  stylesLocalWithTheme.btn,
                  {
                    backgroundColor: theme.colors.surface,
                    borderColor: theme.colors.border,
                    borderWidth: 1,
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: 8,
                  },
                ]}
              >
                <Ionicons name="copy-outline" size={16} color={theme.colors.text} />
                <Text style={[stylesLocalWithTheme.btnText, { color: theme.colors.text }]}>
                  Reddit card
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </FrostedPanel>

        {/* Personal tok/s history — preview 5, expand for all */}
        {selectedModel && recentHistory.length > 0 && (
          <FrostedPanel style={stylesLocalWithTheme.statusCard}>
            <View style={stylesLocalWithTheme.statusHeader}>
              <Ionicons name="time-outline" size={20} color={theme.colors.text} />
              <Text style={[stylesLocalWithTheme.statusTitle, { color: theme.colors.text }]}>
                Recent runs
              </Text>
            </View>
            {usageTrend.sampleCount >= 4 && usageTrend.deltaPct != null && (
              <Text
                style={[
                  stylesLocalWithTheme.statusHint,
                  { color: theme.colors.textSecondary, marginBottom: 10 },
                ]}
              >
                {usageTrend.direction === 'up'
                  ? `Trending up · +${Math.abs(usageTrend.deltaPct)}% vs earlier runs`
                  : usageTrend.direction === 'down'
                    ? `Trending down · −${Math.abs(usageTrend.deltaPct)}% vs earlier runs`
                    : `Steady · ~${Math.abs(usageTrend.deltaPct)}% change across last ${usageTrend.sampleCount} runs`}
              </Text>
            )}
            {visibleRecentHistory.map((entry, i) => (
              <View
                key={`${entry.timestamp}-${i}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderTopWidth: i === 0 ? StyleSheet.hairlineWidth : 0,
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderColor: theme.colors.border,
                }}
              >
                <Text
                  style={{
                    flex: 1,
                    fontFamily: 'Poppins',
                    fontSize: 14,
                    color: theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {entry.tokensPerSecond.toFixed(1)} tok/s
                  <Text style={{ color: theme.colors.textSecondary }}>
                    {' · '}
                    {entry.tokenCount} tok
                    {entry.accelOn === true
                      ? ' · Accel'
                      : entry.accelOn === false
                        ? ' · CPU'
                        : ''}
                  </Text>
                </Text>
                <Text
                  style={{
                    fontFamily: 'Poppins',
                    fontSize: 12,
                    color: theme.colors.textTertiary,
                    marginLeft: 8,
                  }}
                >
                  {formatRelativeTime(entry.timestamp)}
                </Text>
              </View>
            ))}
            {canExpandRecentRuns && (
              <TouchableOpacity
                onPress={() => {
                  animateLayout();
                  setRecentRunsExpanded((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityState={{ expanded: recentRunsExpanded }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingVertical: 12,
                  marginTop: 4,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    fontFamily: 'Poppins',
                    fontSize: 14,
                    fontWeight: '500',
                    color: theme.colors.textSecondary,
                    marginRight: 4,
                  }}
                >
                  {recentRunsExpanded
                    ? 'Show less'
                    : `View more (${recentHistory.length - 5} more)`}
                </Text>
                <Ionicons
                  name={recentRunsExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={theme.colors.textSecondary}
                />
              </TouchableOpacity>
            )}
            <Text
              style={[
                stylesLocalWithTheme.statusFootnote,
                {
                  color: theme.colors.textSecondary,
                  marginTop: canExpandRecentRuns ? 0 : 10,
                },
              ]}
            >
              {recentRunsExpanded
                ? `${recentHistory.length} completion(s) for this model from on-device usage log.`
                : `Showing ${Math.min(5, recentHistory.length)} of ${recentHistory.length} completion(s) from on-device usage log.`}
            </Text>
          </FrostedPanel>
        )}
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
                transform: [
                  { translateX: pillTranslateX },
                  { scale: pillScale },
                ],
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

      {/* Hardware acceleration detail popup */}
      <BottomSheet
        visible={accelModalOpen}
        onClose={() => setAccelModalOpen(false)}
        title="Hardware Acceleration"
        subtitle="Device inference & backend configuration"
        fitContent
      >
        <View style={{ paddingBottom: 8 }}>
          {/* Status Row */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: theme.colors.surface,
              padding: 14,
              borderRadius: 16,
              marginBottom: 16,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
            }}
          >
            <View
              style={[
                stylesLocalWithTheme.statusDot,
                {
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor:
                    accelStatus?.on === true
                      ? theme.colors.success
                      : accelStatus?.on === false
                        ? theme.colors.warning
                        : theme.colors.textSecondary,
                },
              ]}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: 'Poppins',
                  fontSize: 15,
                  fontWeight: '600',
                  color: theme.colors.text,
                }}
              >
                {accelStatus?.on === true
                  ? `Active · ${accelStatus.onLabel}`
                  : accelStatus?.on === false
                    ? `Inactive · ${accelStatus.onLabel}`
                    : 'No model loaded'}
              </Text>
              <Text
                style={{
                  fontFamily: 'Poppins',
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  marginTop: 2,
                }}
              >
                Available: {accelStatus?.available ? accelStatus.availableLabel : 'Not available'}
              </Text>
            </View>
          </View>

          {/* Details Section */}
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 14,
              fontWeight: '600',
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            About Mobile Acceleration
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 13,
              color: theme.colors.textSecondary,
              lineHeight: 20,
              marginBottom: 10,
            }}
          >
            • Q4_0 and Q6_K quantizations automatically take advantage of GPU and NPU hardware shaders on Android for faster prompt ingestion and decoding.
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 13,
              color: theme.colors.textSecondary,
              lineHeight: 20,
              marginBottom: 10,
            }}
          >
            • If acceleration is available on your device but inference is running on CPU, check GPU Layers in Model Settings and ensure a compatible quantization is loaded.
          </Text>
          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 13,
              color: theme.colors.textSecondary,
              lineHeight: 20,
              marginBottom: 20,
            }}
          >
            • All inference and hardware benchmarks execute 100% offline and locally on your phone. Zero telemetry leaves your device.
          </Text>

          {/* Dismiss button */}
          <TouchableOpacity
            onPress={() => setAccelModalOpen(false)}
            style={[
              stylesLocalWithTheme.btn,
              {
                backgroundColor: theme.colors.primary,
                paddingVertical: 12,
                borderRadius: 24,
              },
            ]}
          >
            <Text style={[stylesLocalWithTheme.btnText, { color: theme.colors.primaryText }]}>
              Close
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Suggestions detail popup */}
      <BottomSheet
        visible={suggestionsModalOpen}
        onClose={() => setSuggestionsModalOpen(false)}
        title="Performance Suggestions"
        subtitle={selectedModel ? `Tailored for ${selectedModel}` : 'Device optimization recommendations'}
        fitContent
      >
        <View style={{ paddingBottom: 8 }}>
          {suggestions.map((suggestion, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                backgroundColor: theme.colors.surface,
                padding: 12,
                borderRadius: 14,
                marginBottom: 10,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: theme.colors.border,
                gap: 10,
              }}
            >
              <Ionicons
                name="bulb-outline"
                size={18}
                color={theme.colors.accent || theme.colors.warning}
                style={{ marginTop: 2 }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: 'Poppins',
                  fontSize: 13,
                  color: theme.colors.text,
                  lineHeight: 19,
                }}
              >
                {suggestion}
              </Text>
            </View>
          ))}

          <Text
            style={{
              fontFamily: 'Poppins',
              fontSize: 12,
              color: theme.colors.textTertiary,
              lineHeight: 18,
              marginTop: 4,
              marginBottom: 20,
            }}
          >
            Tip: Adjusting GPU layers, context window (n_ctx), or temperature in Model Settings can significantly affect memory footprint and response latency.
          </Text>

          {/* Dismiss button */}
          <TouchableOpacity
            onPress={() => setSuggestionsModalOpen(false)}
            style={[
              stylesLocalWithTheme.btn,
              {
                backgroundColor: theme.colors.primary,
                paddingVertical: 12,
                borderRadius: 24,
              },
            ]}
          >
            <Text style={[stylesLocalWithTheme.btnText, { color: theme.colors.primaryText }]}>
              Got It
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      {/* Navigation buttons */}
      <View style={[stylesLocalWithTheme.fixedBtn, { left: 15, bottom: backBottom, backgroundColor: "transparent" }]}>
        <FloatingBackButton onPress={onBack} />
      </View>

      <View style={[stylesLocalWithTheme.fixedBtn, { right: 15, bottom: backBottom, backgroundColor: 'transparent' }]}>
        <TouchableOpacity
          style={[
            stylesLocalWithTheme.iconBtn,
            {
              backgroundColor: theme.colors.error,
              opacity: hasAnyUsageRecords ? 1 : 0.45,
            },
          ]}
          disabled={!hasAnyUsageRecords}
          accessibilityLabel="Clear usage data"
          accessibilityHint="Removes performance history for this model or all models"
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
          <Ionicons name="trash-outline" size={24} color={theme.colors.primaryText} />
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
  scrollContent: { paddingBottom: 0 },
  row: { flexDirection: 'row', marginBottom: SETTINGS_BLOCK.gap },

  statCard: {
    width: GRAPH_WIDTH,
    height: STAT_CARD_HEIGHT,
    position: 'relative',
  },
  statInner: {
    position: 'absolute',
    bottom: SETTINGS_BLOCK.padding,
    left: SETTINGS_BLOCK.padding,
  },
  statValue: { fontSize: 42, fontWeight: '700', fontFamily: 'Poppins' },
  perfValue: { fontSize: 34, fontWeight: '700', fontFamily: 'Poppins' },
  statCaption: { fontSize: 12, fontFamily: 'Poppins' },

  graphCard: {
    paddingTop: 10,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT + 60,
  },
  graphValue: {
    fontSize: 36,
    fontWeight: '600',
    paddingLeft: SETTINGS_BLOCK.padding,
    fontFamily: 'Poppins',
  },
  graphCaption: {
    fontSize: 12,
    marginBottom: 5,
    paddingLeft: SETTINGS_BLOCK.padding,
    fontFamily: 'Poppins',
  },

  suggestionCard: {
    padding: SETTINGS_BLOCK.padding,
    marginBottom: SETTINGS_BLOCK.gap,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  suggestionTitle: { fontSize: 18, marginRight: 6, fontFamily: 'Poppins' },
  suggestionText: { fontSize: 14, marginBottom: 4, fontFamily: 'Poppins' },

  statusCard: {
    padding: SETTINGS_BLOCK.padding,
    marginBottom: SETTINGS_BLOCK.gap,
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
    bottom: 92,
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
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 30,
  },
  btnText: {
    color: colors.primaryText,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Poppins',
    textAlign: 'center',
    includeFontPadding: false,
  },
  compactHalfCard: {
    padding: 14,
    height: 138,
    marginBottom: 0,
    justifyContent: 'space-between',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Poppins',
    flexShrink: 1,
  },
  compactContent: {
    marginVertical: 2,
  },
  compactStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  compactPrimaryValue: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Poppins',
    flexShrink: 1,
  },
  compactSubCaption: {
    fontSize: 12,
    fontFamily: 'Poppins',
    marginTop: 2,
    lineHeight: 16,
  },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
  },
  compactFooterText: {
    fontSize: 11,
    fontFamily: 'Poppins',
    fontWeight: '500',
  },
});

const stylesLocal = createStylesLocal({ primaryText: '#fff' }); // Will be overridden

const stylesChart = StyleSheet.create({
  chart: { backgroundColor: 'transparent', paddingLeft: 0, paddingRight: 0 },
});

export default StagesScreen;
