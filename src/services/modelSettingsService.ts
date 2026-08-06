// modelSettingsService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveModelPolicy } from "./inference/modelPolicy";
import { SYSTEM_PROMPT_MOBILE } from "./inference/promptDefaults";

export type SystemPromptSource = "default" | "user";

/** Per-turn thinking override (S20). Only affects jinja_enable families (Qwen). */
export type ThinkingMode = "auto" | "on" | "off";

export const THINKING_MODES = ["auto", "on", "off"] as const;

export interface ModelSettings {
  systemPrompt: string;
  /**
   * How systemPrompt was set. `default` may be refreshed when OFLN ships better
   * policy defaults; `user` is never auto-overwritten.
   */
  systemPromptSource?: SystemPromptSource;
  /**
   * Thinking control: Auto = prompt heuristic; On/Off force enable_thinking
   * only for jinja_enable families. Default auto matches pre-S20 behavior.
   */
  thinkingMode: ThinkingMode;
  n_ctx: number; // Context window size
  n_gpu_layers: number; // Number of GPU layers
  temperature: number; // Sampling temperature (0.0 - 2.0)
  top_p: number; // Top-p sampling (0.0 - 1.0)
  top_k: number; // Top-k sampling (1 - 100)
  repeat_penalty: number; // Repeat penalty (1.0 - 2.0)
  n_predict: number; // Max tokens to predict
}

/**
 * Allowed ranges for each numeric setting.
 * Tuned for on-device llama.rn / llama.cpp on phones:
 * - n_ctx: power-of-two sizes only (KV-friendly); Android load may still soft-cap ~2048
 * - n_gpu_layers: 0 = CPU; 99 ≈ offload all (llama.cpp convention)
 * - temperature / top_p / top_k: standard llama.cpp sampling bounds
 * - repeat_penalty: stored as OpenAI-style name; mapped to llama.rn `penalty_repeat` at completion time
 * - n_predict: capped for battery / latency on mobile
 */
export const SETTING_RANGES = {
  n_ctx: {
    /** Discrete allowed context sizes (slider snaps to these). */
    values: [512, 1024, 2048, 4096, 8192] as const,
    min: 512,
    max: 8192,
    step: 1,
  },
  n_gpu_layers: { min: 0, max: 99, step: 1 },
  temperature: { min: 0, max: 2, step: 0.05 },
  top_p: { min: 0.05, max: 1, step: 0.01 },
  top_k: { min: 1, max: 100, step: 1 },
  repeat_penalty: { min: 1, max: 2, step: 0.05 },
  n_predict: { min: 64, max: 2048, step: 32 },
} as const;

export type NCtxAllowed = (typeof SETTING_RANGES.n_ctx.values)[number];

/** Prior shipped defaults — upgraded when systemPromptSource is still default. */
const LEGACY_DEFAULT_SYSTEM_PROMPTS = [
  "You are a helpful assistant. " +
    "For simple questions, reply in 1–3 short sentences with the answer only. " +
    "Never write chain-of-thought, planning, or phrases like \"Thinking in English\", \"I need to\", or \"Wait,\". " +
    "Do not repeat facts already given in this conversation.",
  "You are a helpful, friendly assistant running on the user's device. " +
    "Be accurate, clear, and useful. Match reply length to the question — " +
    "short questions get short answers; harder questions get fuller explanations. " +
    "Prefer a direct answer in the user-visible reply. " +
    "Do not narrate planning or inner monologue in the reply " +
    "(avoid phrases like \"Thinking in English\", \"I need to\", or \"Wait,\"). " +
    "Do not repeat facts already given in this conversation.",
  "This is a conversation between user and assistant, a friendly chatbot.",
  // Generic mobile default before per-family policy
  SYSTEM_PROMPT_MOBILE,
  // First policy-era tiny default
  "You are a concise assistant on this phone. " +
    "Answer the user's latest message clearly. Prefer short answers unless detail is needed.",
];

/**
 * Fallback when no model filename is known.
 * Prefer getDefaultSettingsForModel(fileName) for real loads.
 */
export const DEFAULT_SETTINGS: ModelSettings = {
  systemPrompt: SYSTEM_PROMPT_MOBILE,
  systemPromptSource: "default",
  thinkingMode: "auto",
  n_ctx: 2048,
  n_gpu_layers: 1,
  temperature: 0.8,
  top_p: 0.95,
  top_k: 20,
  repeat_penalty: 1.05,
  n_predict: 256,
};

function normalizeThinkingMode(value: unknown): ThinkingMode {
  if (value === "auto" || value === "on" || value === "off") return value;
  return "auto";
}

const MODEL_SETTINGS_KEY_PREFIX = "@model_settings_";

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

/** Snap to nearest step within [min, max]. */
export function snapToStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clamped = clamp(value, min, max);
  if (step <= 0) return clamped;
  const snapped = Math.round((clamped - min) / step) * step + min;
  const decimals = String(step).includes(".")
    ? (String(step).split(".")[1]?.length ?? 0)
    : 0;
  const rounded =
    decimals > 0 ? Number(snapped.toFixed(decimals)) : Math.round(snapped);
  return clamp(rounded, min, max);
}

/** Nearest allowed n_ctx from the discrete list. */
export function snapNCtx(value: number): NCtxAllowed {
  const allowed = SETTING_RANGES.n_ctx.values;
  let best: NCtxAllowed = allowed[0];
  let bestDist = Math.abs(value - best);
  for (const v of allowed) {
    const d = Math.abs(value - v);
    if (d < bestDist) {
      best = v;
      bestDist = d;
    }
  }
  return best;
}

function isLegacyOrShippedDefaultPrompt(prompt: string): boolean {
  const trimmed = prompt.trim();
  return LEGACY_DEFAULT_SYSTEM_PROMPTS.some((legacy) => legacy.trim() === trimmed);
}

/**
 * Policy-seeded defaults for a concrete model file (no AsyncStorage).
 */
export function getDefaultSettingsForModel(modelFileName: string): ModelSettings {
  const policy = resolveModelPolicy(modelFileName || "");
  return {
    systemPrompt: policy.systemPromptDefault,
    systemPromptSource: "default",
    thinkingMode: "auto",
    n_ctx: DEFAULT_SETTINGS.n_ctx,
    n_gpu_layers: DEFAULT_SETTINGS.n_gpu_layers,
    temperature: policy.sampling.temperature,
    top_p: policy.sampling.top_p,
    top_k: policy.sampling.top_k,
    repeat_penalty: policy.sampling.repeat_penalty,
    n_predict: policy.sampling.n_predict,
  };
}

/**
 * Validate and sanitize model settings.
 * When modelFileName is set, default-source prompts refresh from ModelRuntimePolicy.
 */
export const validateSettings = (
  settings: Partial<ModelSettings>,
  modelFileName?: string,
): ModelSettings => {
  const policyDefaults = modelFileName
    ? getDefaultSettingsForModel(modelFileName)
    : DEFAULT_SETTINGS;
  const validated = { ...policyDefaults, ...settings };

  validated.thinkingMode = normalizeThinkingMode(validated.thinkingMode);

  validated.n_ctx = snapNCtx(
    typeof validated.n_ctx === "number"
      ? validated.n_ctx
      : policyDefaults.n_ctx,
  );

  validated.n_gpu_layers = snapToStep(
    Number(validated.n_gpu_layers),
    SETTING_RANGES.n_gpu_layers.min,
    SETTING_RANGES.n_gpu_layers.max,
    SETTING_RANGES.n_gpu_layers.step,
  );

  validated.temperature = snapToStep(
    Number(validated.temperature),
    SETTING_RANGES.temperature.min,
    SETTING_RANGES.temperature.max,
    SETTING_RANGES.temperature.step,
  );

  validated.top_p = snapToStep(
    Number(validated.top_p),
    SETTING_RANGES.top_p.min,
    SETTING_RANGES.top_p.max,
    SETTING_RANGES.top_p.step,
  );

  validated.top_k = snapToStep(
    Number(validated.top_k),
    SETTING_RANGES.top_k.min,
    SETTING_RANGES.top_k.max,
    SETTING_RANGES.top_k.step,
  );

  validated.repeat_penalty = snapToStep(
    Number(validated.repeat_penalty),
    SETTING_RANGES.repeat_penalty.min,
    SETTING_RANGES.repeat_penalty.max,
    SETTING_RANGES.repeat_penalty.step,
  );

  validated.n_predict = snapToStep(
    Number(validated.n_predict),
    SETTING_RANGES.n_predict.min,
    SETTING_RANGES.n_predict.max,
    SETTING_RANGES.n_predict.step,
  );

  if (typeof validated.systemPrompt !== "string") {
    validated.systemPrompt = policyDefaults.systemPrompt;
    validated.systemPromptSource = "default";
    return validated;
  }

  const prompt = validated.systemPrompt;
  let source = validated.systemPromptSource;
  if (source !== "default" && source !== "user") {
    // Older installs: infer from whether text matches a shipped default.
    source = isLegacyOrShippedDefaultPrompt(prompt) ? "default" : "user";
  }

  // Refresh policy defaults only when still on a shipped/default prompt.
  if (source === "default" || isLegacyOrShippedDefaultPrompt(prompt)) {
    validated.systemPrompt = policyDefaults.systemPrompt;
    validated.systemPromptSource = "default";
  } else {
    validated.systemPromptSource = "user";
  }

  return validated;
};

/**
 * Get settings for a specific model
 * Returns validated settings with defaults merged in for any missing fields
 */
export const getModelSettings = async (
  modelFileName: string,
): Promise<ModelSettings> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    const settingsJson = await AsyncStorage.getItem(key);
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      return validateSettings(settings, modelFileName);
    }
    return getDefaultSettingsForModel(modelFileName);
  } catch (error) {
    console.error(`Error loading settings for ${modelFileName}:`, error);
    return getDefaultSettingsForModel(modelFileName);
  }
};

/**
 * Save settings for a specific model
 * Validates settings before saving to ensure robustness
 */
export const saveModelSettings = async (
  modelFileName: string,
  settings: Partial<ModelSettings>,
): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    const currentSettings = await getModelSettings(modelFileName);
    const merged: Partial<ModelSettings> = { ...currentSettings, ...settings };

    // Editing the prompt string marks it as user-owned unless caller sets source.
    if (
      typeof settings.systemPrompt === "string" &&
      settings.systemPromptSource === undefined
    ) {
      const defaults = getDefaultSettingsForModel(modelFileName);
      merged.systemPromptSource =
        settings.systemPrompt.trim() === defaults.systemPrompt.trim()
          ? "default"
          : "user";
    }

    const updatedSettings = validateSettings(merged, modelFileName);
    await AsyncStorage.setItem(key, JSON.stringify(updatedSettings));
  } catch (error) {
    console.error(`Error saving settings for ${modelFileName}:`, error);
    throw error;
  }
};

/**
 * Reset settings to policy defaults for a specific model
 */
export const resetModelSettings = async (
  modelFileName: string,
): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    const defaults = getDefaultSettingsForModel(modelFileName);
    await AsyncStorage.setItem(key, JSON.stringify(defaults));
  } catch (error) {
    console.error(`Error resetting settings for ${modelFileName}:`, error);
    throw error;
  }
};

/**
 * Delete settings for a specific model
 */
export const deleteModelSettings = async (
  modelFileName: string,
): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error(`Error deleting settings for ${modelFileName}:`, error);
    throw error;
  }
};

/**
 * Export all per-model settings for backup (S32).
 * Keys are model file names (without storage prefix).
 */
export const exportAllModelSettings = async (): Promise<
  Record<string, ModelSettings>
> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const settingKeys = keys.filter((k) =>
      k.startsWith(MODEL_SETTINGS_KEY_PREFIX),
    );
    if (settingKeys.length === 0) return {};
    const pairs = await AsyncStorage.multiGet(settingKeys);
    const out: Record<string, ModelSettings> = {};
    for (const [key, raw] of pairs) {
      if (!raw) continue;
      const fileName = key.slice(MODEL_SETTINGS_KEY_PREFIX.length);
      if (!fileName) continue;
      try {
        const parsed = JSON.parse(raw);
        out[fileName] = validateSettings(parsed, fileName);
      } catch {
        /* skip corrupt entry */
      }
    }
    return out;
  } catch (error) {
    console.error("Error exporting model settings:", error);
    return {};
  }
};

/**
 * Import per-model settings map from backup.
 * replace: overwrites listed models only (does not wipe unrelated keys).
 * merge: same — both modes upsert because settings are keyed per model.
 */
export const importModelSettingsMap = async (
  map: Record<string, Partial<ModelSettings>>,
  _mode: "merge" | "replace" = "merge",
): Promise<void> => {
  if (!map || typeof map !== "object") return;
  for (const [rawName, partial] of Object.entries(map)) {
    if (!partial || typeof partial !== "object") continue;
    // Basename only — never let keys inject path separators into storage.
    const fileName = (rawName || "").replace(/^.*[/\\]/, "").trim().slice(0, 240);
    if (
      !fileName ||
      fileName === "." ||
      fileName === ".." ||
      fileName.includes("..") ||
      fileName.includes("/") ||
      fileName.includes("\\")
    ) {
      continue;
    }
    const validated = validateSettings(partial, fileName);
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${fileName}`;
    await AsyncStorage.setItem(key, JSON.stringify(validated));
  }
};
