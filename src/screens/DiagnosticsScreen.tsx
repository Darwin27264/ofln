// DiagnosticsScreen.tsx — logs, acceleration check, and llama.rn smoke tests
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  BackHandler,
  Platform,
  Animated,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Clipboard from "@react-native-clipboard/clipboard";
import { LineChart } from "react-native-chart-kit";
import { initLlama, getBackendDevicesInfo } from "llama.rn";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { getFullLogContent, getErrorLogPath, clearErrorLog } from "../utils/errorLogger";
import { showAlert } from "../components/CustomAlert";
import { FloatingBackButton } from "../components/FloatingBackButton";
import { BottomSheet } from "../components/BottomSheet";
import { FrostedPanel, SETTINGS_BLOCK } from "../components/FrostedGlass";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import { getAccelerationConfig } from "../services/accelerationCapabilityService";
import { checkFileExists } from "../services/llamaService";
import { DEFAULT_SETTINGS } from "../services/modelSettingsService";
import {
  formatThermalHint,
  formatThermalLabel,
  getThermalLevel,
  thermalLevelToGraphValue,
  type ThermalLevel,
} from "../services/thermalService";
import { getInferencePerfParams } from "../services/inferencePerfParams";
import { getTotalMemoryBytes } from "../services/ramFitService";
import {
  markModelLoadInProgress,
  clearModelLoadInProgress,
} from "../services/safeBootService";
import { EASING, OVERLAY_MOTION } from "../utils/animationConfig";

interface Props {
  onBack: () => void;
  /** Absolute path to a GGUF used by the smoke test (optional). */
  modelPath: string | null;
  /** Optional — opens Models to download or load a GGUF. */
  onGoToModels?: () => void;
}

/** Match Settings tile height for the 2-up action blocks. */
const SETTINGS_TILE_HEIGHT_DIAG = 130;
/** Full content width — same as Acceleration + Smoke row. */
const THERMAL_CARD_WIDTH = Dimensions.get("window").width - 40;
const THERMAL_Y_LABEL_W = 34;
const THERMAL_CHART_WIDTH = THERMAL_CARD_WIDTH - THERMAL_Y_LABEL_W;
const THERMAL_CHART_HEIGHT = 72;
const THERMAL_CHART_SHIFT = 14;
const THERMAL_HISTORY_LEN = 24;

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text
      style={{
        fontSize: 13,
        fontWeight: "600",
        color,
        fontFamily: "Poppins",
        marginBottom: 10,
        marginTop: 8,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Text>
  );
}

export default function DiagnosticsScreen({ onBack, modelPath, onGoToModels }: Props) {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();
  const [errorLogVisible, setErrorLogVisible] = useState(false);
  const [errorLogContent, setErrorLogContent] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [testLogLines, setTestLogLines] = useState<string[]>([
    "Results from acceleration and smoke tests appear here.",
  ]);
  const [running, setRunning] = useState(false);
  const [logPathSheetOpen, setLogPathSheetOpen] = useState(false);
  const [noModelSheetOpen, setNoModelSheetOpen] = useState(false);
  const [androidOnlySheetOpen, setAndroidOnlySheetOpen] = useState(false);
  const [thermalLevel, setThermalLevel] = useState<ThermalLevel>("unknown");
  const [thermalHistory, setThermalHistory] = useState<number[]>([]);
  const [thermalRefreshing, setThermalRefreshing] = useState(false);
  const thermalChartAnim = useRef(new Animated.Value(THERMAL_CHART_WIDTH)).current;
  const thermalAnimatedOnce = useRef(false);
  const testScrollRef = useRef<ScrollView>(null);
  /** Full-screen logs page: fade only (no scale) — scale on opaque fill looks glitchy. */
  const logOverlayOpacity = useRef(new Animated.Value(0)).current;
  const [logOverlayMounted, setLogOverlayMounted] = useState(false);
  const [logOverlaySettled, setLogOverlaySettled] = useState(false);

  // Mount before paint so the first frame is opacity 0 (no flash).
  useLayoutEffect(() => {
    if (!errorLogVisible) return;
    setLogOverlayMounted(true);
    setLogOverlaySettled(false);
    logOverlayOpacity.setValue(0);
  }, [errorLogVisible, logOverlayOpacity]);

  // Enter/exit fade; after enter, unbind opacity (PageFadeIn pattern) then load content.
  useEffect(() => {
    if (!logOverlayMounted) return;

    if (errorLogVisible) {
      const anim = Animated.timing(logOverlayOpacity, {
        toValue: 1,
        duration: OVERLAY_MOTION.FADE_IN_MS,
        easing: EASING.EASE_OUT,
        useNativeDriver: true,
      });
      anim.start(({ finished }) => {
        if (!finished) return;
        logOverlayOpacity.setValue(1);
        requestAnimationFrame(() => {
          setLogOverlaySettled(true);
        });
      });
      return () => anim.stop();
    }

    setLogOverlaySettled(false);
    const anim = Animated.timing(logOverlayOpacity, {
      toValue: 0,
      duration: OVERLAY_MOTION.FADE_OUT_MS,
      easing: EASING.EASE_IN,
      useNativeDriver: true,
    });
    let exited = false;
    anim.start(({ finished }) => {
      if (!finished || exited) return;
      exited = true;
      setLogOverlayMounted(false);
    });
    return () => {
      if (!exited) anim.stop();
    };
  }, [errorLogVisible, logOverlayMounted, logOverlayOpacity]);

  const graphLineColor = isDark ? "#FFFFFF" : "#6B7280";

  const thermalChartConfig = useMemo(() => {
    const hexToRgba = (hex: string, alpha: number) => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    };
    return {
      backgroundColor: "transparent",
      backgroundGradientFrom: "transparent",
      backgroundGradientTo: "transparent",
      backgroundGradientFromOpacity: 0,
      backgroundGradientToOpacity: 0,
      color: (o = 1) => hexToRgba(graphLineColor, o),
      labelColor: () => "transparent",
      strokeWidth: 2,
      decimalPlaces: 0,
      propsForDots: { r: "0" },
      fillShadowGradient: graphLineColor,
      fillShadowGradientOpacity: 0.25,
    };
  }, [graphLineColor]);

  const appendTestLog = (msg: string) => {
    if (__DEV__) {
      console.log("[ofln diagnostics]", msg);
    }
    setTestLogLines((prev) => [...prev, msg]);
  };

  const refreshThermal = async (opts?: { log?: boolean }) => {
    setThermalRefreshing(true);
    try {
      const level = await getThermalLevel({ force: true });
      setThermalLevel(level);
      const y = thermalLevelToGraphValue(level);
      setThermalHistory((prev) => {
        const next = [...prev, y];
        return next.length > THERMAL_HISTORY_LEN
          ? next.slice(next.length - THERMAL_HISTORY_LEN)
          : next;
      });
      if (opts?.log) {
        appendTestLog(
          `Thermal: ${formatThermalLabel(level)} — ${formatThermalHint(level)}`,
        );
      }
    } catch {
      setThermalLevel("unknown");
      if (opts?.log) {
        appendTestLog("Thermal: failed to read native status.");
      }
    } finally {
      setThermalRefreshing(false);
    }
  };

  useEffect(() => {
    void refreshThermal();
    const id = setInterval(() => {
      void refreshThermal();
    }, 2500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount poll only
  }, []);

  useEffect(() => {
    if (thermalHistory.length < 2 || thermalAnimatedOnce.current) {
      return;
    }
    thermalAnimatedOnce.current = true;
    thermalChartAnim.setValue(0);
    Animated.timing(thermalChartAnim, {
      toValue: THERMAL_CHART_WIDTH,
      duration: 700,
      useNativeDriver: false,
    }).start();
  }, [thermalHistory.length, thermalChartAnim]);

  const thermalSeries =
    thermalHistory.length >= 2
      ? thermalHistory
      : thermalHistory.length === 1
        ? [thermalHistory[0], thermalHistory[0]]
        : [1, 1];

  const refreshLogContent = async () => {
    setLogsLoading(true);
    try {
      const logContent = await getFullLogContent();
      setErrorLogContent(logContent);
    } catch {
      setErrorLogVisible(false);
      showAlert("Error", "Failed to load logs.", [{ text: "OK" }]);
    } finally {
      setLogsLoading(false);
    }
  };

  // Defer heavy TextInput mount until after fade settles — avoids mid-animation hitch.
  useEffect(() => {
    if (!logOverlaySettled || !errorLogVisible) return;
    void refreshLogContent();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per settled open
  }, [logOverlaySettled, errorLogVisible]);

  const handleViewLogs = () => {
    setErrorLogContent("");
    setLogsLoading(true);
    setErrorLogVisible(true);
  };

  const handleClearErrorLog = () => {
    showAlert(
      "Clear Error Log",
      "Are you sure you want to clear the error log? This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await clearErrorLog();
              if (errorLogVisible) {
                await refreshLogContent();
              }
              showAlert("Success", "Error log cleared.", [{ text: "OK" }]);
            } catch {
              showAlert("Error", "Failed to clear error log.", [{ text: "OK" }]);
            }
          },
        },
      ],
    );
  };

  const handleCopyLogContent = () => {
    if (!errorLogContent.trim()) {
      showAlert("Empty", "There is nothing to copy yet.", [{ text: "OK" }]);
      return;
    }
    Clipboard.setString(errorLogContent);
    showAlert("Copied", "Full log copied to clipboard.", [{ text: "OK" }]);
  };

  const handleCopyLogPath = () => {
    setLogPathSheetOpen(true);
  };

  const runAccelCheck = async () => {
    if (Platform.OS !== "android") {
      appendTestLog("Acceleration check: Android only.");
      return;
    }
    setTestLogLines((prev) => [...prev, "--- Acceleration check ---"]);
    try {
      const config = await getAccelerationConfig();
      appendTestLog(config.summary);
      const raw = await getBackendDevicesInfo();
      raw.forEach((d, i) => appendTestLog(`  [${i}] ${d.deviceName} (${d.backend})`));
    } catch (e) {
      appendTestLog("Error: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const runSmokeTest = async () => {
    if (running || !modelPath) return;
    setRunning(true);
    setTestLogLines((prev) => [...prev, "--- Smoke test started ---"]);

    try {
      const exists = await checkFileExists(modelPath);
      if (!exists) {
        appendTestLog("Error: Model file not found at path.");
        return;
      }
      appendTestLog("Model file found.");

      const nCtx = 512;
      const nGpuLayers = 0;
      const totalRam = await getTotalMemoryBytes();
      const perfParams = getInferencePerfParams(nGpuLayers, {
        totalMemoryBytes: totalRam,
      });

      appendTestLog("Initializing context...");
      await markModelLoadInProgress();
      let ctx: any;
      try {
        ctx = await initLlama({
          model: modelPath,
          use_mlock: false,
          n_ctx: nCtx,
          n_gpu_layers: nGpuLayers,
          ...perfParams,
        });
      } finally {
        await clearModelLoadInProgress();
      }
      appendTestLog("Context created.");

      const meta = (ctx as any)?.model?.metadata;
      const hasMeta = meta != null && typeof meta === "object";
      const hasChatTpl = !!(meta && meta["tokenizer.chat_template"]);
      appendTestLog(
        `Model details: metadata=${hasMeta ? "ok" : "MISSING"} chat_template=${hasChatTpl ? "ok" : "missing"}`,
      );
      if (!hasMeta) {
        appendTestLog(
          "WARN: model.metadata missing — completion({ messages }) will crash. Prefer reloading after GGUF sanitize.",
        );
      }

      try {
        appendTestLog("Probing getFormattedChat...");
        await (ctx as any).getFormattedChat(
          [{ role: "user", content: "ping" }],
          undefined,
          { jinja: true, enable_thinking: false },
        );
        appendTestLog("getFormattedChat probe OK.");
      } catch (probeErr) {
        appendTestLog(
          "getFormattedChat probe FAILED: " +
            (probeErr instanceof Error ? probeErr.message : String(probeErr)),
        );
      }

      const stopWords = ["</s>", "<|end|>", "<|im_end|>", "user:", "assistant:"];

      let tokenCount = 0;
      const stoppedRef = { current: false };
      appendTestLog("Running first completion (will stop after 3 tokens)...");
      const p1 = ctx.completion(
        {
          messages: [{ role: "user", content: "Reply with exactly one word: Hi." }],
          n_predict: 30,
          temperature: DEFAULT_SETTINGS.temperature,
          top_p: DEFAULT_SETTINGS.top_p,
          top_k: DEFAULT_SETTINGS.top_k,
          stop: stopWords,
        },
        () => {
          tokenCount++;
          if (tokenCount >= 3 && !stoppedRef.current) {
            stoppedRef.current = true;
            ctx.stopCompletion();
          }
        },
      );
      await p1;
      appendTestLog("Stopped after " + tokenCount + " token(s).");

      appendTestLog("Running second completion (full)...");
      await ctx.completion({
        messages: [{ role: "user", content: "Reply with exactly one word: Bye." }],
        n_predict: 20,
        temperature: DEFAULT_SETTINGS.temperature,
        top_p: DEFAULT_SETTINGS.top_p,
        top_k: DEFAULT_SETTINGS.top_k,
        stop: stopWords,
      });
      appendTestLog("Second completion done.");

      await ctx.release();
      appendTestLog("Context released.");

      appendTestLog("Re-initializing context...");
      await markModelLoadInProgress();
      try {
        ctx = await initLlama({
          model: modelPath,
          use_mlock: false,
          n_ctx: nCtx,
          n_gpu_layers: nGpuLayers,
          ...perfParams,
        });
      } finally {
        await clearModelLoadInProgress();
      }
      appendTestLog("Running third completion...");
      await ctx.completion({
        messages: [{ role: "user", content: "Reply with exactly one word: Done." }],
        n_predict: 20,
        temperature: DEFAULT_SETTINGS.temperature,
        top_p: DEFAULT_SETTINGS.top_p,
        top_k: DEFAULT_SETTINGS.top_k,
        stop: stopWords,
      });
      await ctx.release();
      appendTestLog("Reload completion done. Smoke test passed.");
    } catch (e) {
      appendTestLog("Error: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
      setTestLogLines((prev) => [...prev, "--- Smoke test finished ---"]);
    }
  };

  const confirmSmokeTest = () => {
    if (running) return;

    if (!modelPath) {
      setNoModelSheetOpen(true);
      return;
    }

    showAlert(
      "Run smoke test?",
      "Reloads the model and runs three short completions. Uses extra RAM and may take several minutes. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Run anyway",
          style: "destructive",
          onPress: () => {
            void runSmokeTest();
          },
        },
      ],
    );
  };

  const confirmAccelCheck = () => {
    if (Platform.OS !== "android") {
      setAndroidOnlySheetOpen(true);
      return;
    }
    void runAccelCheck();
  };

  useEffect(() => {
    if (!errorLogVisible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setErrorLogVisible(false);
      return true;
    });
    return () => sub.remove();
  }, [errorLogVisible]);

  return (
    <View
      style={[
        styles.container,
        {
          padding: 20,
          flex: 1,
          backgroundColor: theme.colors.background,
        },
      ]}
    >
      <Text style={styles.settingsTitle}>Diagnostics</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Logs */}
        <TouchableOpacity
          onPress={handleViewLogs}
          activeOpacity={0.85}
          style={{ marginBottom: SETTINGS_BLOCK.gap }}
        >
          <FrostedPanel
            style={{
              paddingVertical: 22,
              paddingHorizontal: SETTINGS_BLOCK.padding,
              flexDirection: "row",
              alignItems: "center",
              minHeight: 88,
            }}
          >
            <Ionicons
              name="document-text-outline"
              size={30}
              color={theme.colors.text}
              style={{ marginRight: 14 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 18,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 4,
                }}
              >
                View Logs
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                }}
              >
                App environment and error logs
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={22} color={theme.colors.textSecondary} />
          </FrostedPanel>
        </TouchableOpacity>

        <View
          style={{
            flexDirection: "row",
            marginBottom: 20,
          }}
        >
          <TouchableOpacity
            onPress={handleCopyLogPath}
            activeOpacity={0.85}
            style={{ flex: 1, marginRight: SETTINGS_BLOCK.gutter }}
          >
            <FrostedPanel
              style={{
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="folder-outline" size={20} color={theme.colors.text} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Log Path
              </Text>
            </FrostedPanel>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClearErrorLog}
            activeOpacity={0.85}
            style={{ flex: 1, marginLeft: SETTINGS_BLOCK.gutter }}
          >
            <FrostedPanel
              style={{
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.error,
                  fontFamily: "Poppins",
                  marginTop: 4,
                  textAlign: "center",
                }}
              >
                Clear Log
              </Text>
            </FrostedPanel>
          </TouchableOpacity>
        </View>

        {/* 2. Acceleration + Smoke test */}
        <View style={{ flexDirection: "row", marginBottom: 20 }}>
          <TouchableOpacity
            onPress={confirmAccelCheck}
            activeOpacity={0.85}
            style={{
              flex: 1,
              marginRight: SETTINGS_BLOCK.gutter,
              opacity: Platform.OS === "android" ? 1 : 0.55,
            }}
            accessibilityLabel="Check acceleration"
          >
            <FrostedPanel
              style={{
                paddingVertical: 22,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                minHeight: SETTINGS_TILE_HEIGHT_DIAG,
              }}
            >
              <Ionicons
                name="hardware-chip-outline"
                size={32}
                color={theme.colors.text}
                style={{ marginBottom: 10 }}
              />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  textAlign: "center",
                  marginBottom: 6,
                }}
              >
                Acceleration
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  textAlign: "center",
                  lineHeight: 16,
                }}
              >
                {Platform.OS === "android"
                  ? "OpenCL / Hexagon check"
                  : "Android only"}
              </Text>
            </FrostedPanel>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={confirmSmokeTest}
            disabled={running}
            activeOpacity={0.85}
            style={{
              flex: 1,
              marginLeft: SETTINGS_BLOCK.gutter,
              opacity: running ? 0.7 : 1,
            }}
            accessibilityLabel={
              running ? "Smoke test running" : "Run llama.rn smoke test"
            }
          >
            <FrostedPanel
              style={{
                paddingVertical: 22,
                paddingHorizontal: 14,
                alignItems: "center",
                justifyContent: "center",
                minHeight: SETTINGS_TILE_HEIGHT_DIAG,
              }}
            >
              <Ionicons
                name={running ? "hourglass-outline" : "play-circle-outline"}
                size={32}
                color={theme.colors.text}
                style={{ marginBottom: 10 }}
              />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  textAlign: "center",
                  marginBottom: 6,
                }}
              >
                {running ? "Running…" : "Smoke test"}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  textAlign: "center",
                  lineHeight: 16,
                }}
              >
                {modelPath
                  ? "May take several minutes"
                  : "Load a model first"}
              </Text>
            </FrostedPanel>
          </TouchableOpacity>
        </View>

        {/* Device thermal — Stages-style line chart (Cool / Warm / Hot) */}
        <TouchableOpacity
          onPress={() => void refreshThermal({ log: true })}
          activeOpacity={0.85}
          style={{ marginBottom: 20 }}
          accessibilityLabel={`Device thermal ${formatThermalLabel(thermalLevel)}`}
        >
          <FrostedPanel
            style={{
              width: THERMAL_CARD_WIDTH,
              height: SETTINGS_TILE_HEIGHT_DIAG,
              overflow: "hidden",
              paddingTop: 10,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                paddingHorizontal: SETTINGS_BLOCK.padding,
                zIndex: 2,
              }}
            >
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: "600",
                  color:
                    thermalLevel === "critical"
                      ? theme.colors.error
                      : thermalLevel === "serious"
                        ? theme.colors.warning
                        : theme.colors.text,
                  fontFamily: "Poppins",
                  marginRight: 8,
                }}
              >
                {thermalRefreshing && thermalHistory.length === 0
                  ? "…"
                  : formatThermalLabel(thermalLevel)}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                  flex: 1,
                }}
              >
                thermal
              </Text>
              {thermalRefreshing ? (
                <ActivityIndicator size="small" color={theme.colors.textSecondary} />
              ) : null}
            </View>

            <View
              style={{
                flex: 1,
                flexDirection: "row",
                marginTop: 2,
              }}
            >
              <View
                style={{
                  width: THERMAL_Y_LABEL_W,
                  justifyContent: "space-between",
                  paddingVertical: 6,
                  paddingLeft: 8,
                }}
              >
                {(["Hot", "Warm", "Cool"] as const).map((band) => (
                  <Text
                    key={band}
                    style={{
                      fontSize: 9,
                      color: theme.colors.textSecondary,
                      fontFamily: "Poppins",
                      fontWeight: "600",
                    }}
                  >
                    {band}
                  </Text>
                ))}
              </View>

              <View
                style={{
                  flex: 1,
                  height: THERMAL_CHART_HEIGHT + THERMAL_CHART_SHIFT,
                  overflow: "hidden",
                }}
              >
                <Animated.View
                  style={{
                    width: thermalChartAnim,
                    height: THERMAL_CHART_HEIGHT + THERMAL_CHART_SHIFT,
                    position: "absolute",
                    bottom: -THERMAL_CHART_SHIFT,
                    left: 0,
                    overflow: "hidden",
                  }}
                >
                  <LineChart
                    data={{
                      labels: thermalSeries.map(() => ""),
                      datasets: [
                        {
                          data: thermalSeries,
                        },
                        {
                          // Invisible anchors so chart-kit keeps Cool→Hot scale
                          data: [1, 3],
                          color: () => "transparent",
                          strokeWidth: 0,
                          withDots: false,
                        },
                      ],
                    }}
                    width={THERMAL_CHART_WIDTH}
                    height={THERMAL_CHART_HEIGHT + THERMAL_CHART_SHIFT}
                    chartConfig={thermalChartConfig}
                    bezier
                    withDots={false}
                    withInnerLines={false}
                    withVerticalLabels={false}
                    withHorizontalLabels={false}
                    withVerticalLines={false}
                    withHorizontalLines={false}
                    style={{
                      backgroundColor: "transparent",
                      paddingLeft: 0,
                      paddingRight: 0,
                      marginLeft: -8,
                    }}
                  />
                </Animated.View>
              </View>
            </View>
          </FrostedPanel>
        </TouchableOpacity>

        {/* 3. Live test output */}
        <SectionLabel label="Test output" color={theme.colors.textSecondary} />

        <FrostedPanel
          style={{
            padding: SETTINGS_BLOCK.padding,
            minHeight: 140,
            maxHeight: 280,
          }}
        >
          <ScrollView
            ref={testScrollRef}
            nestedScrollEnabled
            onContentSizeChange={() =>
              testScrollRef.current?.scrollToEnd({ animated: true })
            }
          >
            {testLogLines.map((line, i) => (
              <Text
                key={i}
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: theme.colors.text,
                  marginBottom: 2,
                }}
              >
                {line}
              </Text>
            ))}
          </ScrollView>
        </FrostedPanel>
      </ScrollView>

      <View style={{ position: "absolute", bottom: backBottom, left: 15, backgroundColor: "transparent" }}>
        <FloatingBackButton onPress={onBack} />
      </View>

      {/* Full-screen logs viewer — fade-only absolute overlay (not RN Modal) */}
      {logOverlayMounted && (
        <Animated.View
          collapsable={false}
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: theme.colors.background,
              zIndex: 10000,
              elevation: 10000,
              // Unbind opacity after settle so Android isn't stuck on a native opacity layer.
              ...(logOverlaySettled ? {} : { opacity: logOverlayOpacity }),
            },
          ]}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 20,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "600",
                color: theme.colors.text,
                fontFamily: "Poppins",
              }}
            >
              Logs
            </Text>
            <TouchableOpacity onPress={() => setErrorLogVisible(false)} style={{ padding: 8 }}>
              <Ionicons name="close" size={24} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1, padding: 16 }} contentContainerStyle={{ flexGrow: 1 }}>
            {logsLoading ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 400 }}>
                <ActivityIndicator size="large" color={theme.colors.text} />
                <Text
                  style={{
                    marginTop: 12,
                    fontSize: 14,
                    color: theme.colors.textSecondary,
                    fontFamily: "Poppins",
                  }}
                >
                  Loading logs…
                </Text>
              </View>
            ) : (
              <TextInput
                style={{
                  fontFamily: "monospace",
                  fontSize: 12,
                  color: theme.colors.text,
                  backgroundColor: theme.colors.surface,
                  borderRadius: 8,
                  padding: 12,
                  minHeight: 400,
                  textAlignVertical: "top",
                }}
                value={errorLogContent}
                multiline
                editable={false}
                selectTextOnFocus
              />
            )}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              padding: 16,
              borderTopWidth: 1,
              borderTopColor: theme.colors.border,
              backgroundColor: theme.colors.card,
              gap: 12,
            }}
          >
            <TouchableOpacity
              onPress={handleCopyLogContent}
              disabled={logsLoading}
              style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
                opacity: logsLoading ? 0.5 : 1,
              }}
            >
              <Ionicons name="copy-outline" size={20} color={theme.colors.text} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Copy Log
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleCopyLogPath}
              style={{
                flex: 1,
                backgroundColor: theme.colors.surface,
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="folder-outline" size={20} color={theme.colors.text} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Log Path
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClearErrorLog}
              style={{
                flex: 1,
                backgroundColor: theme.colors.error + "20",
                borderRadius: 12,
                padding: 12,
                alignItems: "center",
              }}
            >
              <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.error,
                  fontFamily: "Poppins",
                  marginTop: 4,
                }}
              >
                Clear Log
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}

      <BottomSheet
        visible={noModelSheetOpen}
        onClose={() => setNoModelSheetOpen(false)}
        title="No model available"
        subtitle="Smoke test needs a GGUF"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
            marginBottom: onGoToModels ? 16 : 0,
          }}
        >
          Load or download a model first, then open Diagnostics again to run the
          smoke test.
        </Text>
        {onGoToModels ? (
          <TouchableOpacity
            onPress={() => {
              setNoModelSheetOpen(false);
              onGoToModels();
            }}
            style={{
              backgroundColor: theme.colors.primary,
              borderRadius: 12,
              paddingVertical: 14,
              alignItems: "center",
            }}
            accessibilityLabel="Go to Models"
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 15,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Go to Models
            </Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheet>

      <BottomSheet
        visible={androidOnlySheetOpen}
        onClose={() => setAndroidOnlySheetOpen(false)}
        title="Android only"
        subtitle="Acceleration detection"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
          }}
        >
          Acceleration detection is only available on Android devices.
        </Text>
      </BottomSheet>

      <BottomSheet
        visible={logPathSheetOpen}
        onClose={() => setLogPathSheetOpen(false)}
        title="Error Log Location"
        subtitle="On-device path"
        fitContent
      >
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "monospace",
            lineHeight: 20,
            marginBottom: 12,
          }}
          selectable
        >
          {getErrorLogPath()}
        </Text>
        <Text
          style={{
            fontSize: 14,
            color: theme.colors.textSecondary,
            fontFamily: "Poppins",
            lineHeight: 21,
          }}
        >
          You can access this file using a file manager app.
        </Text>
      </BottomSheet>
    </View>
  );
}
