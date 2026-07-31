// modelSettingsService.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ModelSettings {
  systemPrompt: string;
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

/** Prior shipped defaults — upgraded in validateSettings so existing installs pick up the new prompt. */
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
];

/**
 * Keep this short and positive. Tiny on-device models (e.g. Qwen3.5 0.8B) burn
 * their thinking budget listing/debating long negative rule lists — especially
 * "do not repeat facts" / conversation-history meta-checks.
 */
export const DEFAULT_SETTINGS: ModelSettings = {
  systemPrompt:
    "You are a helpful assistant on the user's device. " +
    "Answer the latest user message clearly and accurately. " +
    "Keep simple asks short; give more detail only when the question needs it. " +
    "Start with the answer — avoid reply openers like \"I need to\" or \"Wait,\".",
  n_ctx: 2048, // Enough headroom for multi-turn chats without overflow
  n_gpu_layers: 1,
  // Closer to Qwen3.5 text defaults; per-turn builder still overrides for thinking.
  temperature: 0.8,
  top_p: 0.95,
  top_k: 20,
  // Mapped to llama.rn `penalty_repeat`. Keep mild — presence_penalty handles loops.
  repeat_penalty: 1.05,
  n_predict: 256, // Slightly more room than 192; still conservative for phone inference
};

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
  // Avoid float drift (e.g. 0.7000000001)
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

/**
 * Validate and sanitize model settings.
 * Ensures all values are within valid ranges and all required fields exist.
 */
export const validateSettings = (
  settings: Partial<ModelSettings>,
): ModelSettings => {
  const validated = { ...DEFAULT_SETTINGS, ...settings };

  validated.n_ctx = snapNCtx(
    typeof validated.n_ctx === "number"
      ? validated.n_ctx
      : DEFAULT_SETTINGS.n_ctx,
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
    validated.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
  } else {
    const trimmed = validated.systemPrompt.trim();
    if (
      LEGACY_DEFAULT_SYSTEM_PROMPTS.some((legacy) => legacy.trim() === trimmed)
    ) {
      validated.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
    }
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
      // Validate and merge with defaults to ensure all fields exist and are valid
      return validateSettings(settings);
    }
    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error(`Error loading settings for ${modelFileName}:`, error);
    return { ...DEFAULT_SETTINGS };
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
    // Merge user settings with current settings, then validate
    const updatedSettings = validateSettings({ ...currentSettings, ...settings });
    await AsyncStorage.setItem(key, JSON.stringify(updatedSettings));
  } catch (error) {
    console.error(`Error saving settings for ${modelFileName}:`, error);
    throw error;
  }
};

/**
 * Reset settings to defaults for a specific model
 */
export const resetModelSettings = async (
  modelFileName: string,
): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    await AsyncStorage.setItem(key, JSON.stringify(DEFAULT_SETTINGS));
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
