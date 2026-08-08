/**
 * ModelSettingsScreen Component
 *
 * Full-page screen for editing model settings.
 * Numeric knobs are slider-only within SETTING_RANGES (no free-text entry).
 */

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from "react-native";
import Slider from "@react-native-community/slider";
import Ionicons from "react-native-vector-icons/Ionicons";
import { createStyles } from "../styles/styles";
import { useTheme } from "../context/ThemeContext";
import { showAlert } from "../components/CustomAlert";
import { useFloatingBackBottom, useScrollPadForFloatingBack } from "../utils/layoutInsets";
import {
  getModelSettings,
  saveModelSettings,
  ModelSettings,
  ThinkingMode,
  getDefaultSettingsForModel,
  SETTING_RANGES,
  snapNCtx,
  snapToStep,
  validateSettings,
} from "../services/modelSettingsService";
import { resolveModelPolicy, policyRecommendedBlurb } from "../services/inference/modelPolicy";
import { ModelInfo } from "../components/ModelCard";

interface ModelSettingsScreenProps {
  model: ModelInfo;
  onBack: () => void;
}

const N_CTX_VALUES = SETTING_RANGES.n_ctx.values;

const THINKING_MODE_OPTIONS: { value: ThinkingMode; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
];

// Metric explanations (ranges match SETTING_RANGES)
const metricExplanations: { [key: string]: { title: string; explanation: string } } = {
  contextSize: {
    title: "Context Size (n_ctx)",
    explanation:
      "What it is:\nHow many tokens of conversation the model can keep in memory at once.\n\nAllowed values:\n512, 1024, 2048, 4096, or 8192 (power-of-two only).\n\nEffects of tuning:\n• Higher (4096–8192): Longer memory, much more RAM\n• Lower (512–1024): Faster load, forgets older turns sooner\n• Android may soft-cap near 2048 at load time\n• Recommended: 2048 for most phones",
  },
  gpuLayers: {
    title: "GPU Layers (n_gpu_layers)",
    explanation:
      "What it is:\nHow many layers run on GPU/NPU vs CPU (llama.rn / llama.cpp).\n\nAllowed range:\n0–99 (99 ≈ offload all layers).\n\nAndroid acceleration:\n• Works best with Q4_0 or Q6_K quants on OpenCL (Adreno 700+) or Hexagon NPU (Snapdragon 8 Gen 1+)\n• Other quants are forced to CPU (layers treated as 0)\n• Emulators always use CPU\n\nEffects of tuning:\n• Higher: Faster when acceleration is available\n• 0: CPU only — slowest but most compatible\n• Recommended: try 8–99 on capable phones with a Q4_0 model; use 0 if loads fail",
  },
  temperature: {
    title: "Temperature",
    explanation:
      "What it is:\nControls randomness vs focus in replies.\n\nAllowed range:\n0.00–2.00 (steps of 0.05).\n\nEffects of tuning:\n• Lower (0.2–0.5): More deterministic — good for facts / code\n• Mid (0.7–0.9): Balanced chat (app default 0.80; Qwen thinking may raise toward 0.85)\n• Higher (1.0–1.5): More creative; too high can ramble\n• Recommended: 0.7–1.0 for Qwen3.5",
  },
  topP: {
    title: "Top P (Nucleus Sampling)",
    explanation:
      "What it is:\nOnly considers tokens in the top probability mass.\n\nAllowed range:\n0.05–1.00 (steps of 0.01).\n\nEffects of tuning:\n• Lower (0.5–0.8): Tighter, more focused wording\n• Higher (0.95–1.0): More variety (Qwen3.5 official ~0.95)\n• Works with temperature\n• Recommended: 0.95 (app default)",
  },
  topK: {
    title: "Top K",
    explanation:
      "What it is:\nLimits choices to the K most likely next tokens.\n\nAllowed range:\n1–100.\n\nEffects of tuning:\n• Lower (10–20): More predictable (Qwen3.5 official = 20)\n• Higher (40–100): More diversity\n• Recommended: 20 (app default); Qwen turns cap at 20 automatically",
  },
  repeatPenalty: {
    title: "Repeat Penalty",
    explanation:
      "What it is:\nDiscourages repeating the same token sequences (llama.rn penalty_repeat).\n\nAllowed range:\n1.00–2.00 (steps of 0.05). Values below 1.0 are blocked — they encourage loops.\n\nEffects of tuning:\n• 1.0: Off (Qwen thinking turns use this automatically)\n• 1.05–1.15: Mild; default for chat\n• Above ~1.4: May dodge common words awkwardly\n• Note: For Qwen models, presence penalty (auto) fights phrase loops better than a high repeat penalty",
  },
  maxPredict: {
    title: "Max Predict Tokens (n_predict)",
    explanation:
      "What it is:\nUpper bound on tokens generated per reply.\n\nAllowed range:\n64–2048 (steps of 32) — capped for phone latency and battery.\n\nEffects of tuning:\n• Lower (128–256): Shorter, snappier answers (default 256)\n• Higher (512–1024): Longer answers, slower and more battery\n• Recommended: 256–512 on phones; raise only when you need long drafts",
  },
};

type MetricSliderProps = {
  label: string;
  infoKey: string;
  /** Value shown / edited in the text field (real setting units). */
  committedValue: number;
  formatValue: (v: number) => string;
  /** Snap a parsed number into a valid committed value. */
  snapValue: (n: number) => number;
  /** Apply a committed value (already snapped). */
  onCommit: (v: number) => void;
  /** Slider thumb position (may differ from committed, e.g. n_ctx index). */
  sliderValue: number;
  onSliderChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  onInfo: (key: string) => void;
  minLabel?: string;
  maxLabel?: string;
  keyboardType?: "numeric" | "decimal-pad";
  textColor: string;
  secondaryColor: string;
  tertiaryColor: string;
  trackColor: string;
  thumbColor: string;
  surfaceColor: string;
  borderColor: string;
};

function MetricSlider({
  label,
  infoKey,
  committedValue,
  formatValue,
  snapValue,
  onCommit,
  sliderValue,
  onSliderChange,
  min,
  max,
  step,
  onInfo,
  minLabel,
  maxLabel,
  keyboardType = "numeric",
  textColor,
  secondaryColor,
  tertiaryColor,
  trackColor,
  thumbColor,
  surfaceColor,
  borderColor,
}: MetricSliderProps) {
  const formatted = formatValue(committedValue);
  const [draft, setDraft] = useState(formatted);
  const [focused, setFocused] = useState(false);

  // Keep the text field in sync with the slider / external updates while not editing.
  useEffect(() => {
    if (!focused) {
      setDraft(formatValue(committedValue));
    }
  }, [committedValue, focused, formatValue]);

  const commitDraft = useCallback(() => {
    const cleaned = draft.trim().replace(",", ".");
    const parsed = Number(cleaned);
    if (!Number.isFinite(parsed)) {
      setDraft(formatValue(committedValue));
      return;
    }
    const next = snapValue(parsed);
    onCommit(next);
    setDraft(formatValue(next));
  }, [draft, committedValue, formatValue, snapValue, onCommit]);

  return (
    <View style={localStyles.metricBlock}>
      <View style={localStyles.metricHeader}>
        <View style={localStyles.metricTitleRow}>
          <Text style={[localStyles.metricTitle, { color: textColor }]}>{label}</Text>
          <TouchableOpacity
            onPress={() => onInfo(infoKey)}
            style={localStyles.infoHit}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="information-circle-outline" size={20} color={secondaryColor} />
          </TouchableOpacity>
        </View>
        <TextInput
          style={[
            localStyles.valueInput,
            {
              color: textColor,
              backgroundColor: surfaceColor,
              borderColor: focused ? thumbColor : borderColor,
            },
          ]}
          value={draft}
          onChangeText={setDraft}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            commitDraft();
          }}
          onSubmitEditing={commitDraft}
          keyboardType={keyboardType}
          selectTextOnFocus
          returnKeyType="done"
          textAlign="right"
        />
      </View>
      <View style={localStyles.sliderRow}>
        <Text style={[localStyles.rangeHint, { color: tertiaryColor }]}>
          {minLabel ?? String(min)}
        </Text>
        <Slider
          style={localStyles.slider}
          minimumValue={min}
          maximumValue={max}
          step={step}
          value={sliderValue}
          onValueChange={(v) => {
            onSliderChange(v);
          }}
          minimumTrackTintColor={thumbColor}
          maximumTrackTintColor={trackColor}
          thumbTintColor={thumbColor}
        />
        <Text style={[localStyles.rangeHint, { color: tertiaryColor }]}>
          {maxLabel ?? String(max)}
        </Text>
      </View>
    </View>
  );
}

export default function ModelSettingsScreen({
  model,
  onBack,
}: ModelSettingsScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme.colors);
  const backBottom = useFloatingBackBottom();
  const scrollPadBottom = useScrollPadForFloatingBack();

  const [modelSettings, setModelSettings] = useState<ModelSettings | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const nCtxIndex = useMemo(() => {
    if (!modelSettings) return N_CTX_VALUES.indexOf(2048);
    const idx = N_CTX_VALUES.indexOf(modelSettings.n_ctx as (typeof N_CTX_VALUES)[number]);
    return idx >= 0 ? idx : N_CTX_VALUES.indexOf(snapNCtx(modelSettings.n_ctx));
  }, [modelSettings]);

  // Load model settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        setIsLoading(true);
        const settings = await getModelSettings(model.fileName);
        setModelSettings(validateSettings(settings, model.fileName));
      } catch (error) {
        console.error("Error loading model settings:", error);
        showAlert("Error", "Failed to load model settings.", [{ text: "OK" }]);
        setModelSettings(getDefaultSettingsForModel(model.fileName));
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, [model.fileName]);

  const patchSetting = useCallback(<K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
    setModelSettings((prev) => {
      if (!prev) return prev;
      const next: Partial<ModelSettings> = { ...prev, [key]: value };
      if (key === "systemPrompt" && typeof value === "string") {
        const defaults = getDefaultSettingsForModel(model.fileName);
        next.systemPromptSource =
          value.trim() === defaults.systemPrompt.trim() ? "default" : "user";
      }
      return validateSettings(next, model.fileName);
    });
  }, [model.fileName]);

  const handleSaveSettings = useCallback(async () => {
    if (!modelSettings) return;

    try {
      const sanitized = validateSettings(modelSettings, model.fileName);
      await saveModelSettings(model.fileName, sanitized);
      setModelSettings(sanitized);
      showAlert("Success", "Model settings saved successfully.", [{ text: "OK" }]);
      onBack();
    } catch (error) {
      console.error("Error saving model settings:", error);
      showAlert("Error", "Failed to save model settings.", [{ text: "OK" }]);
    }
  }, [modelSettings, model.fileName, onBack]);

  const handleResetSettings = useCallback(() => {
    setModelSettings(getDefaultSettingsForModel(model.fileName));
  }, [model.fileName]);

  const policyBlurb = useMemo(
    () => policyRecommendedBlurb(resolveModelPolicy(model.fileName)),
    [model.fileName],
  );

  const showMetricInfo = useCallback((metricKey: string) => {
    const info = metricExplanations[metricKey];
    if (info) {
      showAlert(info.title, info.explanation, [{ text: "OK" }], {
        textAlign: "left",
      });
    }
  }, []);

  const formatInt = useCallback((v: number) => String(Math.round(v)), []);
  const formatFloat2 = useCallback((v: number) => v.toFixed(2), []);

  if (isLoading || !modelSettings) {
    return (
      <View
        style={[
          styles.container,
          {
            padding: 20,
            flex: 1,
            backgroundColor: theme.colors.background,
            justifyContent: "center",
            alignItems: "center",
          },
        ]}
      >
        <Text style={{ color: theme.colors.text, fontFamily: "Poppins" }}>
          Loading settings...
        </Text>
      </View>
    );
  }

  const sliderShared = {
    onInfo: showMetricInfo,
    textColor: theme.colors.text,
    secondaryColor: theme.colors.textSecondary,
    tertiaryColor: theme.colors.textTertiary,
    trackColor: theme.colors.surface,
    thumbColor: theme.colors.primary,
    surfaceColor: theme.colors.surface,
    borderColor: theme.colors.border,
  };

  return (
    <View
      style={[
        styles.container,
        { padding: 20, flex: 1, backgroundColor: theme.colors.background },
      ]}
    >
      {/* Header */}
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          backgroundColor: theme.colors.background,
          zIndex: 1,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.settingsTitle}>Model Settings</Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.textSecondary,
              fontFamily: "Poppins",
              marginTop: 4,
            }}
          >
            {model.name}
          </Text>
        </View>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{
          marginTop: 70,
          flex: 1,
        }}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={{
          paddingBottom: scrollPadBottom,
        }}
      >
        {/* System Prompt */}
        <View style={{ marginBottom: 24 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: theme.colors.text,
              fontFamily: "Poppins",
              marginBottom: 8,
            }}
          >
            System Prompt
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textTertiary,
              fontFamily: "Poppins",
              marginBottom: 8,
              lineHeight: 18,
            }}
          >
            {policyBlurb}
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: 12,
              padding: 12,
              color: theme.colors.text,
              fontFamily: "Poppins",
              fontSize: 16,
              minHeight: 100,
              textAlignVertical: "top",
              borderWidth: 1,
              borderColor: theme.colors.border,
            }}
            value={modelSettings.systemPrompt}
            onChangeText={(text) => patchSetting("systemPrompt", text)}
            multiline
            placeholder="Enter system prompt..."
            placeholderTextColor={theme.colors.textTertiary}
          />
        </View>

        {/* Thinking mode (S20) — Auto matches prompt heuristic; On/Off for Qwen-style models only */}
        <View style={localStyles.metricBlock}>
          <Text style={[localStyles.metricTitle, { color: theme.colors.text }]}>
            Thinking
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textTertiary,
              fontFamily: "Poppins",
              marginTop: 4,
              marginBottom: 10,
              lineHeight: 18,
            }}
          >
            Auto uses complexity for supported models. On/Off force thinking where the template allows it.
          </Text>
          <View
            style={{
              flexDirection: "row",
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: "hidden",
              backgroundColor: theme.colors.surface,
            }}
          >
            {THINKING_MODE_OPTIONS.map((opt, idx) => {
              const selected = modelSettings.thinkingMode === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => patchSetting("thinkingMode", opt.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: selected
                      ? theme.colors.primary
                      : "transparent",
                    borderLeftWidth: idx === 0 ? 0 : 1,
                    borderLeftColor: theme.colors.border,
                    minHeight: 40,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: selected ? "600" : "500",
                      fontFamily: "Poppins",
                      color: selected
                        ? theme.colors.primaryText
                        : theme.colors.textSecondary,
                    }}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <MetricSlider
          {...sliderShared}
          label="Context Size (n_ctx)"
          infoKey="contextSize"
          committedValue={modelSettings.n_ctx}
          formatValue={formatInt}
          snapValue={snapNCtx}
          onCommit={(v) => patchSetting("n_ctx", v)}
          sliderValue={nCtxIndex}
          onSliderChange={(idx) => {
            const i = Math.round(clampIndex(idx, 0, N_CTX_VALUES.length - 1));
            patchSetting("n_ctx", N_CTX_VALUES[i]);
          }}
          min={0}
          max={N_CTX_VALUES.length - 1}
          step={1}
          minLabel="512"
          maxLabel="8192"
        />

        <MetricSlider
          {...sliderShared}
          label="GPU Layers (n_gpu_layers)"
          infoKey="gpuLayers"
          committedValue={modelSettings.n_gpu_layers}
          formatValue={formatInt}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.n_gpu_layers.min,
              SETTING_RANGES.n_gpu_layers.max,
              SETTING_RANGES.n_gpu_layers.step,
            )
          }
          onCommit={(v) => patchSetting("n_gpu_layers", v)}
          sliderValue={modelSettings.n_gpu_layers}
          onSliderChange={(v) =>
            patchSetting(
              "n_gpu_layers",
              snapToStep(
                v,
                SETTING_RANGES.n_gpu_layers.min,
                SETTING_RANGES.n_gpu_layers.max,
                SETTING_RANGES.n_gpu_layers.step,
              ),
            )
          }
          min={SETTING_RANGES.n_gpu_layers.min}
          max={SETTING_RANGES.n_gpu_layers.max}
          step={SETTING_RANGES.n_gpu_layers.step}
        />

        <MetricSlider
          {...sliderShared}
          label="Temperature"
          infoKey="temperature"
          committedValue={modelSettings.temperature}
          formatValue={formatFloat2}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.temperature.min,
              SETTING_RANGES.temperature.max,
              SETTING_RANGES.temperature.step,
            )
          }
          onCommit={(v) => patchSetting("temperature", v)}
          sliderValue={modelSettings.temperature}
          onSliderChange={(v) =>
            patchSetting(
              "temperature",
              snapToStep(
                v,
                SETTING_RANGES.temperature.min,
                SETTING_RANGES.temperature.max,
                SETTING_RANGES.temperature.step,
              ),
            )
          }
          min={SETTING_RANGES.temperature.min}
          max={SETTING_RANGES.temperature.max}
          step={SETTING_RANGES.temperature.step}
          minLabel="0"
          maxLabel="2"
          keyboardType="decimal-pad"
        />

        <MetricSlider
          {...sliderShared}
          label="Top P"
          infoKey="topP"
          committedValue={modelSettings.top_p}
          formatValue={formatFloat2}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.top_p.min,
              SETTING_RANGES.top_p.max,
              SETTING_RANGES.top_p.step,
            )
          }
          onCommit={(v) => patchSetting("top_p", v)}
          sliderValue={modelSettings.top_p}
          onSliderChange={(v) =>
            patchSetting(
              "top_p",
              snapToStep(
                v,
                SETTING_RANGES.top_p.min,
                SETTING_RANGES.top_p.max,
                SETTING_RANGES.top_p.step,
              ),
            )
          }
          min={SETTING_RANGES.top_p.min}
          max={SETTING_RANGES.top_p.max}
          step={SETTING_RANGES.top_p.step}
          minLabel="0.05"
          maxLabel="1"
          keyboardType="decimal-pad"
        />

        <MetricSlider
          {...sliderShared}
          label="Top K"
          infoKey="topK"
          committedValue={modelSettings.top_k}
          formatValue={formatInt}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.top_k.min,
              SETTING_RANGES.top_k.max,
              SETTING_RANGES.top_k.step,
            )
          }
          onCommit={(v) => patchSetting("top_k", v)}
          sliderValue={modelSettings.top_k}
          onSliderChange={(v) =>
            patchSetting(
              "top_k",
              snapToStep(
                v,
                SETTING_RANGES.top_k.min,
                SETTING_RANGES.top_k.max,
                SETTING_RANGES.top_k.step,
              ),
            )
          }
          min={SETTING_RANGES.top_k.min}
          max={SETTING_RANGES.top_k.max}
          step={SETTING_RANGES.top_k.step}
        />

        <MetricSlider
          {...sliderShared}
          label="Repeat Penalty"
          infoKey="repeatPenalty"
          committedValue={modelSettings.repeat_penalty}
          formatValue={formatFloat2}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.repeat_penalty.min,
              SETTING_RANGES.repeat_penalty.max,
              SETTING_RANGES.repeat_penalty.step,
            )
          }
          onCommit={(v) => patchSetting("repeat_penalty", v)}
          sliderValue={modelSettings.repeat_penalty}
          onSliderChange={(v) =>
            patchSetting(
              "repeat_penalty",
              snapToStep(
                v,
                SETTING_RANGES.repeat_penalty.min,
                SETTING_RANGES.repeat_penalty.max,
                SETTING_RANGES.repeat_penalty.step,
              ),
            )
          }
          min={SETTING_RANGES.repeat_penalty.min}
          max={SETTING_RANGES.repeat_penalty.max}
          step={SETTING_RANGES.repeat_penalty.step}
          minLabel="1"
          maxLabel="2"
          keyboardType="decimal-pad"
        />

        <MetricSlider
          {...sliderShared}
          label="Max Predict Tokens (n_predict)"
          infoKey="maxPredict"
          committedValue={modelSettings.n_predict}
          formatValue={formatInt}
          snapValue={(n) =>
            snapToStep(
              n,
              SETTING_RANGES.n_predict.min,
              SETTING_RANGES.n_predict.max,
              SETTING_RANGES.n_predict.step,
            )
          }
          onCommit={(v) => patchSetting("n_predict", v)}
          sliderValue={modelSettings.n_predict}
          onSliderChange={(v) =>
            patchSetting(
              "n_predict",
              snapToStep(
                v,
                SETTING_RANGES.n_predict.min,
                SETTING_RANGES.n_predict.max,
                SETTING_RANGES.n_predict.step,
              ),
            )
          }
          min={SETTING_RANGES.n_predict.min}
          max={SETTING_RANGES.n_predict.max}
          step={SETTING_RANGES.n_predict.step}
          minLabel="64"
          maxLabel="2048"
        />

        {/* Action Buttons */}
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8, marginBottom: 12 }}>
          <TouchableOpacity
            onPress={handleResetSettings}
            style={{
              flex: 1,
              backgroundColor: theme.colors.surface,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: theme.colors.border,
              minHeight: 44,
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Reset
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSaveSettings}
            style={{
              flex: 1,
              backgroundColor: theme.colors.primary,
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              minHeight: 44,
            }}
          >
            <Text
              style={{
                color: theme.colors.primaryText,
                fontSize: 16,
                fontWeight: "600",
                fontFamily: "Poppins",
              }}
            >
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Back button */}
      <View style={{ position: "absolute", bottom: backBottom, left: 15, backgroundColor: "transparent" }}>
        <TouchableOpacity
          onPress={onBack}
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: theme.colors.primary,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: 24,
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

function clampIndex(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

const localStyles = StyleSheet.create({
  metricBlock: {
    marginBottom: 24,
  },
  metricHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  metricTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 8,
  },
  metricTitle: {
    fontSize: 18,
    fontWeight: "600",
    fontFamily: "Poppins",
  },
  infoHit: {
    marginLeft: 8,
    padding: 4,
  },
  valueInput: {
    minWidth: 72,
    maxWidth: 96,
    fontSize: 16,
    fontFamily: "Poppins",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  sliderRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  slider: {
    flex: 1,
    height: 40,
    marginHorizontal: 4,
  },
  rangeHint: {
    fontSize: 12,
    fontFamily: "Poppins",
    minWidth: 36,
    textAlign: "center",
  },
});
