/**
 * DEV-only Diagnostics screen: llama.rn smoke test.
 * Reachable via long-press on Settings title. Not shown in production.
 */
import React, { useState, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";
import { initLlama, getBackendDevicesInfo } from "llama.rn";
import { getAccelerationConfig } from "../services/accelerationCapabilityService";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { checkFileExists } from "../services/llamaService";
import { DEFAULT_SETTINGS } from "../services/modelSettingsService";

interface Props {
  onBack: () => void;
  modelPath: string | null;
}

export default function DiagnosticsScreen({ onBack, modelPath }: Props) {
  const { theme, isTransitioning } = useTheme();
  const styles = createStyles(theme.colors);
  const insets = useSafeAreaInsets();
  const [logLines, setLogLines] = useState<string[]>(["Diagnostics (DEV only). Tap a button below to run tests."]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const log = (msg: string) => {
    if (__DEV__) {
      console.log("[ofln diagnostics]", msg);
    }
    setLogLines((prev) => [...prev, msg]);
  };

  const runAccelCheck = async () => {
    if (Platform.OS !== "android") {
      log("Acceleration check: Android only.");
      return;
    }
    setLogLines((prev) => [...prev, "--- Acceleration check ---"]);
    try {
      const config = await getAccelerationConfig();
      log(config.summary);
      const raw = await getBackendDevicesInfo();
      raw.forEach((d, i) => log(`  [${i}] ${d.deviceName} (${d.backend})`));
    } catch (e) {
      log("Error: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const runSmokeTest = async () => {
    if (running || !modelPath) return;
    setRunning(true);
    setLogLines((prev) => [...prev, "--- Smoke test started ---"]);

    try {
      const exists = await checkFileExists(modelPath);
      if (!exists) {
        log("Error: Model file not found at path.");
        setRunning(false);
        return;
      }
      log("Model file found.");

      const fileName = modelPath.split("/").pop() || "model";
      const nCtx = 512;
      const nGpuLayers = 0;

      log("Initializing context...");
      let ctx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: nCtx,
        n_gpu_layers: nGpuLayers,
      });
      log("Context created.");

      const stopWords = ["</s>", "<|end|>", "<|im_end|>", "user:", "assistant:"];

      // 1) First completion — stop mid-stream after a few tokens
      let tokenCount = 0;
      const stoppedRef = { current: false };
      log("Running first completion (will stop after 3 tokens)...");
      const p1 = ctx.completion(
        {
          messages: [{ role: "user", content: "Reply with exactly one word: Hi." }],
          n_predict: 30,
          temperature: DEFAULT_SETTINGS.temperature,
          top_p: DEFAULT_SETTINGS.top_p,
          top_k: DEFAULT_SETTINGS.top_k,
          stop: stopWords,
        },
        (data: { token: string; reasoning_content?: string }) => {
          tokenCount++;
          if (tokenCount >= 3 && !stoppedRef.current) {
            stoppedRef.current = true;
            ctx.stopCompletion();
          }
        }
      );
      await p1;
      log("Stopped after " + tokenCount + " token(s).");

      // 2) Second completion — full run
      log("Running second completion (full)...");
      await ctx.completion({
        messages: [{ role: "user", content: "Reply with exactly one word: Bye." }],
        n_predict: 20,
        temperature: DEFAULT_SETTINGS.temperature,
        top_p: DEFAULT_SETTINGS.top_p,
        top_k: DEFAULT_SETTINGS.top_k,
        stop: stopWords,
      });
      log("Second completion done.");

      // 3) Release
      await ctx.release();
      log("Context released.");

      // 4) Re-init and one more completion
      log("Re-initializing context...");
      ctx = await initLlama({
        model: modelPath,
        use_mlock: false,
        n_ctx: nCtx,
        n_gpu_layers: nGpuLayers,
      });
      log("Running third completion...");
      await ctx.completion({
        messages: [{ role: "user", content: "Reply with exactly one word: Done." }],
        n_predict: 20,
        temperature: DEFAULT_SETTINGS.temperature,
        top_p: DEFAULT_SETTINGS.top_p,
        top_k: DEFAULT_SETTINGS.top_k,
        stop: stopWords,
      });
      await ctx.release();
      log("Reload completion done. Smoke test passed.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("Error: " + msg);
    } finally {
      setRunning(false);
      setLogLines((prev) => [...prev, "--- Smoke test finished ---"]);
    }
  };

  if (!__DEV__) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          padding: 20,
          flex: 1,
          backgroundColor: theme.colors.background,
          opacity: isTransitioning ? 0.95 : 1,
        },
      ]}
    >
      <Text style={[styles.settingsTitle, { marginBottom: 40 }]}>Diagnostics</Text>

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={true}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        <View
          style={{
            backgroundColor: theme.colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: 16,
            minHeight: 120,
          }}
        >
          <Text
            style={{
              fontSize: 14,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
              marginBottom: 12,
            }}
          >
            Output
          </Text>
          <View>
            {logLines.map((line, i) => (
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
          </View>
        </View>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: 0,
          paddingBottom: 20 + insets.bottom,
          paddingTop: 12,
          backgroundColor: theme.colors.background,
          gap: 12,
        }}
      >
        {Platform.OS === "android" && (
          <TouchableOpacity
            onPress={runAccelCheck}
            style={{
              backgroundColor: theme.colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.colors.border,
              padding: 16,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={24}
              color={theme.colors.text}
              style={{ marginRight: 12 }}
            />
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "600",
                  color: theme.colors.text,
                  fontFamily: "Poppins",
                  marginBottom: 4,
                }}
              >
                Check acceleration
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textSecondary,
                  fontFamily: "Poppins",
                }}
              >
                OpenCL / Hexagon NPU detection
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          onPress={runSmokeTest}
          disabled={running || !modelPath}
          style={{
            backgroundColor: modelPath && !running ? theme.colors.primary : theme.colors.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: modelPath && !running ? theme.colors.primary : theme.colors.border,
            padding: 16,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <Ionicons
            name={running ? "hourglass-outline" : "play-circle-outline"}
            size={24}
            color={modelPath && !running ? theme.colors.primaryText : theme.colors.text}
            style={{ marginRight: 12 }}
          />
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 16,
                fontWeight: "600",
                color: modelPath && !running ? theme.colors.primaryText : theme.colors.text,
                fontFamily: "Poppins",
                marginBottom: 4,
              }}
            >
              {running ? "Running..." : "Run llama.rn smoke test"}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: modelPath && !running ? theme.colors.primaryText : theme.colors.textSecondary,
                fontFamily: "Poppins",
              }}
            >
              {modelPath ? "Hi / Bye / Done completion test" : "Load a model first"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={modelPath && !running ? theme.colors.primaryText : theme.colors.textSecondary}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            alignSelf: "flex-start",
            backgroundColor: theme.colors.primary,
            marginTop: 4,
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
    </View>
  );
}
