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
  Alert,
  Modal,
  Animated,
  StyleSheet,
} from 'react-native';
import RNFS from 'react-native-fs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { LineChart } from 'react-native-chart-kit';
import { styles as shared } from '../styles/styles';

/* ──────────────────────────────────── constants ──────────────────────────────────── */
const RADIUS = 30;
const SCREEN_WIDTH = Dimensions.get('window').width;
const GRAPH_WIDTH = (SCREEN_WIDTH - 50) / 2;
const GRAPH_HEIGHT = 120;
const GRAPH_SHIFT = 18; // pushes chart down so filled area meets card edge
const STAT_CARD_HEIGHT = GRAPH_HEIGHT + 30;

const COLORS = {
  primary: '#2563EB',
  textDark: '#000',
  textLight: '#fff',
  greyLight: '#EAEAEA',
  greyCard: '#F0F0F0',
};

/* ────────────────────────────────────── types ────────────────────────────────────── */
interface UsageRecord {
  timestamp: number;
  inferenceTime: number;
  tokenCount: number;
  tokensPerSecond: number;
  performanceLevel: 'High' | 'Medium' | 'Low';
  model: string;
}

interface Props {
  downloadedModels: string[];
  onBack: () => void;
}

/* ──────────────────────────────────── component ──────────────────────────────────── */
const StagesScreen: FC<Props> = ({ downloadedModels, onBack }) => {
  /* ───── state ───── */
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(''); // start empty
  const [stats, setStats] = useState<{
    total: number;
    avgTime: number;
    avgTps: number;
    perf: 'High' | 'Medium' | 'Low';
  } | null>(null);

  const [tpsData, setTpsData] = useState<number[]>([]);
  const [timeData, setTimeData] = useState<number[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [graphType, setGraphType] = useState<'tps' | 'inf' | null>(null);

  /* ───── animations ───── */
  const animTPS = useRef(new Animated.Value(0)).current;
  const animINF = useRef(new Animated.Value(0)).current;
  const animBig = useRef(new Animated.Value(0.8)).current; // pop scale

  /* ───── flags ───── */
  const userTouchedRef = useRef(false);

  /* ───── helpers ───── */
  const perfColor = (p?: 'High' | 'Medium' | 'Low') =>
    p === 'High'
      ? '#34C759'
      : p === 'Medium'
      ? '#FF9F0A'
      : p === 'Low'
      ? '#FF453A'
      : COLORS.greyLight;

  const chartConfig = {
    backgroundColor: 'transparent',
    backgroundGradientFrom: 'transparent',
    backgroundGradientTo: 'transparent',
    backgroundGradientFromOpacity: 0,
    backgroundGradientToOpacity: 0,
    color: (o = 1) => `rgba(37,99,235,${o})`,
    labelColor: () => 'transparent',
    strokeWidth: 2,
    decimalPlaces: 0,
    propsForDots: { r: '0' },
    fillShadowGradient: 'rgba(37,99,235,1)',
    fillShadowGradientOpacity: 0.25,
  };

  /* detailed chart config (labels + grid) */
  const chartConfigDetailed = {
    ...chartConfig,
    labelColor: (o = 1) => `rgba(0,0,0,${o})`,
  };

  /* ─────────────────────────────── data loading ─────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const path = `${RNFS.DocumentDirectoryPath}/usage_log.json`;
        if (await RNFS.exists(path)) {
          const records = (await RNFS.readFile(path, 'utf8'))
            .split('\n')
            .filter(Boolean)
            .map((l) => {
              try {
                return JSON.parse(l) as UsageRecord;
              } catch {
                return null;
              }
            })
            .filter(Boolean) as UsageRecord[];
          setUsageRecords(records);
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  /* ───────────────────────────── model list ───────────────────────────── */
  const sortedModels = useMemo(() => {
    return downloadedModels
      .map((m, idx) => ({ m, idx }))
      .sort((a, b) => {
        const cntA = usageRecords.filter((r) => r.model === a.m).length;
        const cntB = usageRecords.filter((r) => r.model === b.m).length;
        if (cntB !== cntA) return cntB - cntA;
        return a.idx - b.idx;
      })
      .map((o) => o.m);
  }, [downloadedModels, usageRecords]);

  useEffect(() => {
    if (!userTouchedRef.current && sortedModels.length) {
      setSelectedModel(sortedModels[0]);
    }
  }, [sortedModels]);

  /* ───────────────────────────── stats / charts ───────────────────────────── */
  useEffect(() => {
    if (!selectedModel) return;
    const filtered = usageRecords.filter((r) => r.model === selectedModel);
    if (!filtered.length) {
      setStats(null);
      setTpsData([]);
      setTimeData([]);
      return;
    }
    const total = filtered.length;
    const avgTime = filtered.reduce((s, r) => s + r.inferenceTime, 0) / total;
    const avgTps = filtered.reduce((s, r) => s + r.tokensPerSecond, 0) / total;
    const perf = filtered.at(-1)!.performanceLevel;

    setStats({ total, avgTime, avgTps, perf });
    setTpsData(filtered.map((r) => r.tokensPerSecond));
    setTimeData(filtered.map((r) => r.inferenceTime));
  }, [usageRecords, selectedModel]);

  /* ───────────────────────────── animations ───────────────────────────── */
  const runSmallCharts = () => {
    animTPS.setValue(0);
    animINF.setValue(0);
    Animated.parallel([
      Animated.timing(animTPS, {
        toValue: GRAPH_WIDTH,
        duration: 900,
        useNativeDriver: false,
      }),
      Animated.timing(animINF, {
        toValue: GRAPH_WIDTH,
        duration: 900,
        useNativeDriver: false,
      }),
    ]).start();
  };
  useEffect(runSmallCharts, [tpsData, timeData]);

  useEffect(() => {
    if (modalVisible) {
      animBig.setValue(0.8);
      Animated.spring(animBig, {
        toValue: 1,
        friction: 6,
        useNativeDriver: true,
      }).start();
    }
  }, [modalVisible, animBig]);

  /* ───────────────────────────── render helpers ───────────────────────────── */
  const Chart = ({ data, anim }: { data: number[]; anim: Animated.Value }) => (
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

  /* ───────────────────────────── JSX ───────────────────────────── */
  return (
    <View style={StyleSheet.absoluteFill}>
      <ScrollView
        style={[shared.container, stylesLocal.scroll]}
        contentContainerStyle={stylesLocal.scrollContent}
      >
        <Text style={[shared.settingsTitle, stylesLocal.title]}>
          Performance
        </Text>

        {selectedModel && stats && (
          <>
            {/* stat cards */}
            <View style={stylesLocal.row}>
              <View style={[stylesLocal.statCard, { marginRight: 10 }]}>
                <View style={stylesLocal.statInner}>
                  <Text style={stylesLocal.statValue}>{stats.total}</Text>
                  <Text style={stylesLocal.statCaption}>total inferences</Text>
                </View>
              </View>

              <View
                style={[
                  stylesLocal.statCard,
                  { backgroundColor: perfColor(stats.perf) },
                ]}
              >
                <View style={stylesLocal.statInner}>
                  <Text
                    style={[
                      stylesLocal.perfValue,
                      {
                        color:
                          stats.perf === 'High'
                            ? COLORS.textLight
                            : COLORS.textDark,
                      },
                    ]}
                  >
                    {stats.perf}
                  </Text>
                  <Text
                    style={[
                      stylesLocal.statCaption,
                      {
                        color:
                          stats.perf === 'High'
                            ? COLORS.textLight
                            : COLORS.textDark,
                      },
                    ]}
                  >
                    Performance level
                  </Text>
                </View>
              </View>
            </View>

            {/* graphs */}
            <View style={stylesLocal.row}>
              <TouchableOpacity
                onPress={() => {
                  setGraphType('tps');
                  setModalVisible(true);
                }}
                style={{ marginRight: 10 }}
              >
                <View style={stylesLocal.graphCard}>
                  <Text style={stylesLocal.graphValue}>
                    {stats.avgTps.toFixed(0)}
                  </Text>
                  <Text style={stylesLocal.graphCaption}>
                    avg tokens/sec
                  </Text>
                  {tpsData.length ? (
                    <Chart data={tpsData.slice(-20)} anim={animTPS} />
                  ) : (
                    <ActivityIndicator color={COLORS.primary} />
                  )}
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setGraphType('inf');
                  setModalVisible(true);
                }}
              >
                <View style={stylesLocal.graphCard}>
                  <Text style={stylesLocal.graphValue}>
                    {stats.avgTime.toFixed(0)}
                  </Text>
                  <Text style={stylesLocal.graphCaption}>
                    avg ms/inference
                  </Text>
                  {timeData.length ? (
                    <Chart data={timeData.slice(-20)} anim={animINF} />
                  ) : (
                    <ActivityIndicator color={COLORS.primary} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* suggestions */}
        <View style={stylesLocal.suggestionCard}>
          <View style={stylesLocal.suggestionHeader}>
            <Text style={stylesLocal.suggestionTitle}>Suggestions</Text>
            <Ionicons name="bulb-outline" size={22} color={COLORS.textDark} />
          </View>
          {(() => {
            const msgs: string[] = [];
            if (!stats) {
              msgs.push(
                'No usage logs available. Start using the model to gather insights.'
              );
            } else {
              if (stats.avgTime > 100)
                msgs.push('Average inference time is high—consider optimising.');
              if (stats.avgTps < 20)
                msgs.push('Tokens‑per‑second is low—try another model.');
              if (stats.total < 5)
                msgs.push('Generate more inferences for deeper insight.');
              if (!msgs.length) msgs.push('Great performance—keep going!');
            }
            return msgs.map((msg, i) => (
              <Text key={i} style={stylesLocal.suggestionText}>
                {msg}
              </Text>
            ));
          })()}
        </View>
      </ScrollView>

      {/* model selector */}
      <View style={stylesLocal.modelBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={stylesLocal.modelList}
        >
          {sortedModels.map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => {
                userTouchedRef.current = true;
                setSelectedModel(m);
                runSmallCharts();
              }}
              style={[
                stylesLocal.modelChip,
                {
                  backgroundColor:
                    selectedModel === m ? COLORS.primary : '#ccc',
                },
              ]}
            >
              <Text style={stylesLocal.modelText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* modal */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity
          style={stylesLocal.modalOverlay}
          activeOpacity={1}
          onPress={() => setModalVisible(false)}
        >
          <TouchableWithoutFeedback>
            <Animated.View
              style={[
                stylesLocal.modalCard,
                { transform: [{ scale: animBig }], alignItems: 'flex-start' },
              ]}
            >
              <Text style={stylesLocal.modalTitle}>
                {graphType === 'tps'
                  ? 'Tokens Per Second'
                  : 'Inference Time (ms)'}
              </Text>
              {(() => {
                const dataArr = graphType === 'tps' ? tpsData : timeData;
                return (
                  <View
                    style={{
                      width: SCREEN_WIDTH - 80,
                      alignSelf: 'flex-start',
                      // No extra left padding here; we'll use a negative margin on the chart instead.
                    }}
                  >
                    <LineChart
                      data={{
                        labels: dataArr.map((_, i) => `${i + 1}`),
                        datasets: [{ data: dataArr }],
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
                        marginLeft: -20, // Shift chart further left to reduce extra empty space
                        marginBottom: -GRAPH_SHIFT,
                      }}
                    />
                  </View>
                );
              })()}
            </Animated.View>
          </TouchableWithoutFeedback>
        </TouchableOpacity>
      </Modal>

      {/* back / clear buttons */}
      <BackClearButtons onBack={onBack} clearLogs={() => setUsageRecords([])} />
    </View>
  );
};

/* ───────────────────────────── back / clear buttons ───────────────────────────── */
const BackClearButtons: FC<{ onBack: () => void; clearLogs: () => void }> = ({
  onBack,
  clearLogs,
}) => (
  <>
    <View style={[stylesLocal.fixedBtn, { left: 15 }]}>
      <TouchableOpacity style={stylesLocal.btn} onPress={onBack}>
        <Ionicons name="arrow-back" size={24} color={COLORS.textLight} />
        <Text style={stylesLocal.btnText}>Back</Text>
      </TouchableOpacity>
    </View>

    <View style={[stylesLocal.fixedBtn, { right: 15 }]}>
      <TouchableOpacity
        style={stylesLocal.btn}
        onPress={() =>
          Alert.alert('Clear Usage Data', 'Are you sure?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear',
              style: 'destructive',
              onPress: async () => {
                try {
                  await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/usage_log.json`);
                  clearLogs();
                } catch (e) {
                  console.error(e);
                }
              },
            },
          ])
        }
      >
        <Text style={stylesLocal.btnText}>Clear</Text>
      </TouchableOpacity>
    </View>
  </>
);

/* ───────────────────────────── styles ───────────────────────────── */
const stylesLocal = StyleSheet.create({
  scroll: { padding: 20 },
  scrollContent: { paddingBottom: 220 },
  title: { marginBottom: 40 }, // Increased margin for added spacing
  row: { flexDirection: 'row', marginBottom: 10 },

  /* stat blocks */
  statCard: {
    width: GRAPH_WIDTH,
    height: STAT_CARD_HEIGHT,
    backgroundColor: COLORS.greyLight,
    borderRadius: RADIUS,
    position: 'relative',
  },
  statInner: { position: 'absolute', bottom: 15, left: 15 },
  statValue: { fontSize: 42, fontWeight: '700' },
  perfValue: { fontSize: 34, fontWeight: '700' },
  statCaption: { fontSize: 12, color: '#555' },

  /* graph cards */
  graphCard: {
    backgroundColor: COLORS.greyCard,
    borderRadius: RADIUS,
    paddingTop: 10,
    width: GRAPH_WIDTH,
    height: GRAPH_HEIGHT + 60,
    overflow: 'hidden',
  },
  graphValue: { fontSize: 36, fontWeight: '600', paddingLeft: 10 },
  graphCaption: { fontSize: 12, color: '#555', marginBottom: 5, paddingLeft: 10 },

  /* suggestions */
  suggestionCard: {
    backgroundColor: COLORS.greyLight,
    borderRadius: RADIUS,
    padding: 20,
    marginBottom: 20,
  },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  suggestionTitle: { fontSize: 18, marginRight: 6 },
  suggestionText: { fontSize: 14, marginBottom: 4 },

  /* model selector */
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
  modelText: { color: COLORS.textLight, fontSize: 16 },

  /* modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalCard: {
    backgroundColor: COLORS.greyCard,
    borderRadius: RADIUS,
    padding: 20,
    width: SCREEN_WIDTH - 40,
    overflow: 'hidden',
  },
  modalTitle: { fontSize: 18, marginBottom: 10 },

  /* buttons */
  fixedBtn: { position: 'absolute', bottom: 20 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.textDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 24,
  },
  btnText: {
    color: COLORS.textLight,
    fontSize: 20,
    fontFamily: 'Poppins',
    marginLeft: 8,
    marginBottom: 2,
  },
});

const stylesChart = StyleSheet.create({
  chart: { backgroundColor: 'transparent', paddingLeft: 0, paddingRight: 0 },
});

export default StagesScreen;
