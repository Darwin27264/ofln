// StagesScreen.tsx
import React, { useState, useEffect, useMemo, useRef, FC } from 'react';
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
  performanceLevel: 'High' | 'Medium' | 'Low';
  model: string;
}

interface ModelStats {
  total: number;
  avgTime: number;
  avgTps: number;
  perf: 'High' | 'Medium' | 'Low';
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
    ['High', 'Medium', 'Low'].includes(record.performanceLevel) &&
    typeof record.model === 'string'
  );
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
  
  const perfColor = (p?: 'High' | 'Medium' | 'Low') =>
    p === 'High'
      ? theme.colors.success
      : p === 'Medium'
      ? theme.colors.warning
      : p === 'Low'
      ? theme.colors.error
      : theme.colors.secondary;

  // Error handling
  if (error) {
    return (
      <View style={[shared.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
        <Text style={{ marginBottom: 20, color: theme.colors.text }}>Error: {error}</Text>
        <TouchableOpacity onPress={onBack} style={[stylesLocalWithTheme.btn, { backgroundColor: theme.colors.primary }]}>
          <Text style={stylesLocalWithTheme.btnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={[shared.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }]}>
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
    if (stats.avgTps < 20) suggestions.push('Tokens‑per‑second is low—try another model.');
    if (stats.total < 5) suggestions.push('Generate more inferences for deeper insight.');
    if (!suggestions.length) suggestions.push('Great performance—keep going!');
    
    return suggestions;
  };
  
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        style={[shared.container, stylesLocalWithTheme.scroll]}
        contentContainerStyle={stylesLocalWithTheme.scrollContent}
      >
        <Text style={[shared.settingsTitle, stylesLocalWithTheme.title, { color: theme.colors.text }]}>Performance</Text>

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
                  <Text style={[stylesLocalWithTheme.perfValue, { color: stats.perf === 'High' ? theme.colors.primaryText : theme.colors.text }]}>
                    {stats.perf}
                  </Text>
                  <Text style={[stylesLocalWithTheme.statCaption, { color: stats.perf === 'High' ? theme.colors.primaryText : theme.colors.text }]}>
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

      {/* Model selector */}
      <View style={stylesLocalWithTheme.modelBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={stylesLocalWithTheme.modelList}
        >
          {sortedModels.map(m => (
            <TouchableOpacity
              key={m}
              onPress={() => {
                userTouchedRef.current = true;
                setSelectedModel(m);
              }}
              style={[stylesLocalWithTheme.modelChip, {
                backgroundColor: selectedModel === m ? theme.colors.accent : theme.colors.secondary
              }]}
            >
              <Text style={[stylesLocalWithTheme.modelText, { color: selectedModel === m ? theme.colors.primaryText : theme.colors.text }]}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
      <View style={[stylesLocalWithTheme.fixedBtn, { left: 15 }]}>
        <TouchableOpacity style={[stylesLocalWithTheme.btn, { backgroundColor: theme.colors.primary }]} onPress={onBack}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text style={stylesLocalWithTheme.btnText}>Back</Text>
        </TouchableOpacity>
      </View>

      <View style={[stylesLocalWithTheme.fixedBtn, { right: 15 }]}>
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
          <Text style={stylesLocalWithTheme.btnText}>Clear</Text>
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
  modelList: { alignItems: 'center' },
  modelChip: {
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 20,
    marginRight: 10,
    minWidth: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelText: { fontSize: 16 },

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
