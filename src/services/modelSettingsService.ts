// modelSettingsService.ts
import RNFS from "react-native-fs";
import AsyncStorage from "@react-native-async-storage/async-storage";

export interface ModelSettings {
  systemPrompt: string;
  n_ctx: number; // Context window size
  n_gpu_layers: number; // Number of GPU layers
  temperature: number; // Sampling temperature (0.0 - 2.0)
  top_p: number; // Top-p sampling (0.0 - 1.0)
  top_k: number; // Top-k sampling (1 - 100)
  repeat_penalty: number; // Repeat penalty (0.0 - 2.0)
  n_predict: number; // Max tokens to predict
}

export const DEFAULT_SETTINGS: ModelSettings = {
  systemPrompt: "This is a conversation between user and assistant, a friendly chatbot.",
  n_ctx: 1536, // Recommended for Q4 models
  n_gpu_layers: 1,
  temperature: 0.65, // Recommended for Q4 models
  top_p: 0.90, // Recommended for Q4 models
  top_k: 40, // Recommended for Q4 models
  repeat_penalty: 1.15, // Recommended for Q4 models
  n_predict: 192, // Recommended max_new_tokens for Q4 models
};

const MODEL_SETTINGS_KEY_PREFIX = "@model_settings_";

/**
 * Validate and sanitize model settings
 * Ensures all values are within valid ranges and all required fields exist
 */
const validateSettings = (settings: Partial<ModelSettings>): ModelSettings => {
  const validated = { ...DEFAULT_SETTINGS, ...settings };
  
  // Validate and clamp values to safe ranges
  validated.n_ctx = Math.max(128, Math.min(8192, validated.n_ctx || DEFAULT_SETTINGS.n_ctx));
  validated.n_gpu_layers = Math.max(0, Math.min(100, validated.n_gpu_layers ?? DEFAULT_SETTINGS.n_gpu_layers));
  validated.temperature = Math.max(0.0, Math.min(2.0, validated.temperature ?? DEFAULT_SETTINGS.temperature));
  validated.top_p = Math.max(0.0, Math.min(1.0, validated.top_p ?? DEFAULT_SETTINGS.top_p));
  validated.top_k = Math.max(1, Math.min(100, validated.top_k ?? DEFAULT_SETTINGS.top_k));
  validated.repeat_penalty = Math.max(0.0, Math.min(2.0, validated.repeat_penalty ?? DEFAULT_SETTINGS.repeat_penalty));
  validated.n_predict = Math.max(1, Math.min(10000, validated.n_predict ?? DEFAULT_SETTINGS.n_predict));
  
  // Ensure systemPrompt is a string
  if (typeof validated.systemPrompt !== 'string') {
    validated.systemPrompt = DEFAULT_SETTINGS.systemPrompt;
  }
  
  return validated;
};

/**
 * Get settings for a specific model
 * Returns validated settings with defaults merged in for any missing fields
 */
export const getModelSettings = async (modelFileName: string): Promise<ModelSettings> => {
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
  settings: Partial<ModelSettings>
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
export const resetModelSettings = async (modelFileName: string): Promise<void> => {
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
export const deleteModelSettings = async (modelFileName: string): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    await AsyncStorage.removeItem(key);
  } catch (error) {
    console.error(`Error deleting settings for ${modelFileName}:`, error);
    throw error;
  }
};

