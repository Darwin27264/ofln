// DiagnosticsScreen.tsx — logs, acceleration check, and llama.rn smoke tests
import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import Clipboard from "@react-native-clipboard/clipboard";
import { initLlama, getBackendDevicesInfo } from "llama.rn";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { getFullLogContent, getErrorLogPath, clearErrorLog } from "../utils/errorLogger";
import { showAlert } from "../components/CustomAlert";
import { BottomSheet } from "../components/BottomSheet";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import { getAccelerationConfig } from "../services/accelerationCapabilityService";
import { checkFileExists } from "../services/llamaService";
import { DEFAULT_SETTINGS } from "../services/modelSettingsService";
import { useFadeScalePresence } from "../hooks/useFadeScalePresence";
import { OVERLAY_MOTION } from "../utils/animationConfig";

interface Props {
  onBack: () => void;
  /** Absolute path to a GGUF used by the smoke test (optional). */
  modelPath: string | null;
  /** Optional — opens Models to download or load a GGUF. */
  onGoToModels?: () => void;
}

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
  const { theme } = useTheme();
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
  const testScrollRef = useRef<ScrollView>(null);
  const logOverlayOpacity = useRef(new Animated.Value(0)).current;
  const logOverlayScale = useRef(new Animated.Value(OVERLAY_MOTION.FROM_SCALE)).current;
  const logOverlayMounted = useFadeScalePresence(errorLogVisible, logOverlayOpacity, logOverlayScale);

  const appendTestLog = (msg: string) => {
    if (__DEV__) {
      console.log("[ofln diagnostics]", msg);
    }
    setTestLogLines((prev) => [...prev, msg]);
  };

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

  const handleViewLogs = () => {
    setErrorLogVisible(true);
    void refreshLogContent();
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

      appendTestLog("Initializing context...");
      let ctx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: nCtx,
        n_gpu_layers: nGpuLayers,
      });
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
      ctx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: nCtx,
        n_gpu_layers: nGpuLayers,
      });
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
      <Text style={[styles.settingsTitle, { marginBottom: 24 }]}>Diagnostics</Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: scrollPadBottom }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontSize: 16,
            color: theme.colors.textSecondary,
            lineHeight: 24,
            marginBottom: 20,
            fontFamily: "Poppins",
          }}
        >
          View error logs and run device checks when load or chat fails.
        </Text>

        {/* 1. Logs */}
        <SectionLabel label="Logs" color={theme.colors.textSecondary} />

        <TouchableOpacity
          onPress={handleViewLogs}
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.colors.border,
            paddingVertical: 22,
            paddingHorizontal: 18,
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 12,
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
        </TouchableOpacity>

        <View style={{ flexDirection: "row", gap: 8, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={handleCopyLogPath}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
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
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleClearErrorLog}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
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
          </TouchableOpacity>
        </View>

        {/* 2. Acceleration + Smoke test */}
        <View style={{ flexDirection: "row", gap: 12, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={confirmAccelCheck}
            style={{
              flex: 1,
              backgroundColor: theme.colors.card,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 22,
              paddingHorizontal: 14,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 140,
              opacity: Platform.OS === "android" ? 1 : 0.55,
            }}
            accessibilityLabel="Check acceleration"
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
          </TouchableOpacity>

          <TouchableOpacity
            onPress={confirmSmokeTest}
            disabled={running}
            style={{
              flex: 1,
              backgroundColor:
                modelPath && !running ? theme.colors.card : theme.colors.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              paddingVertical: 22,
              paddingHorizontal: 14,
              alignItems: "center",
              justifyContent: "center",
              minHeight: 140,
              opacity: running ? 0.7 : 1,
            }}
            accessibilityLabel={
              running ? "Smoke test running" : "Run llama.rn smoke test"
            }
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
          </TouchableOpacity>
        </View>

        {/* 3. Live test output */}
        <SectionLabel label="Test output" color={theme.colors.textSecondary} />

        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
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
        </View>
      </ScrollView>

      <View style={{ position: "absolute", bottom: backBottom, left: 15, backgroundColor: "transparent" }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 30,
          }}
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.primaryText} />
          <Text
            style={{
              color: theme.colors.primaryText,
              fontSize: 20,
              fontFamily: "Poppins",
              marginLeft: 8,
              marginBottom: 2,
            }}
          >
            Back
          </Text>
        </TouchableOpacity>
      </View>

      {/* Full-screen logs viewer — absolute overlay (not RN Modal) */}
      {logOverlayMounted && (
        <Animated.View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: theme.colors.background,
              zIndex: 10000,
              elevation: 10000,
              opacity: logOverlayOpacity,
              transform: [{ scale: logOverlayScale }],
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
