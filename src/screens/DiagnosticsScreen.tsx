/**
 * DEV-only Diagnostics screen: llama.rn smoke test.
 * Reachable via long-press on Settings title. Not shown in production.
 */
import React, { useState, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { initLlama } from "llama.rn";
import RNFS from "react-native-fs";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { checkFileExists } from "../services/llamaService";
import { DEFAULT_SETTINGS } from "../services/modelSettingsService";

interface Props {
  onBack: () => void;
  modelPath: string | null;
}

export default function DiagnosticsScreen({ onBack, modelPath }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const [logLines, setLogLines] = useState<string[]>(["Diagnostics (DEV only). Tap Run to start smoke test."]);
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const log = (msg: string) => {
    if (__DEV__) {
      console.log("[ofln diagnostics]", msg);
    }
    setLogLines((prev) => [...prev, msg]);
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
          repeat_penalty: DEFAULT_SETTINGS.repeat_penalty,
          stop: stopWords,
        },
        (data: { token: string }) => {
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
        repeat_penalty: DEFAULT_SETTINGS.repeat_penalty,
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
        repeat_penalty: DEFAULT_SETTINGS.repeat_penalty,
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
    <View style={[styles.container, { flex: 1, padding: 16, backgroundColor: theme.colors.background }]}>
      <Text style={[styles.settingsTitle, { marginBottom: 8 }]}>Diagnostics</Text>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, marginBottom: 12 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {logLines.map((line, i) => (
          <Text key={i} style={{ fontFamily: "monospace", fontSize: 12, color: theme.colors.text, marginBottom: 2 }}>
            {line}
          </Text>
        ))}
      </ScrollView>
      <TouchableOpacity
        onPress={runSmokeTest}
        disabled={running || !modelPath}
        style={{
          backgroundColor: modelPath && !running ? theme.colors.primary : theme.colors.border,
          padding: 12,
          borderRadius: 8,
          marginBottom: 8,
        }}
      >
        <Text style={{ color: theme.colors.primaryText, textAlign: "center" }}>
          {running ? "Running..." : modelPath ? "Run llama.rn smoke test" : "Load a model first"}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onBack} style={{ backgroundColor: theme.colors.primary, padding: 12, borderRadius: 8 }}>
        <Text style={{ color: theme.colors.primaryText, textAlign: "center" }}>Back</Text>
      </TouchableOpacity>
    </View>
  );
}
