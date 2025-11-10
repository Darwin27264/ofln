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
  n_ctx: 2048,
  n_gpu_layers: 1,
  temperature: 0.7,
  top_p: 0.9,
  top_k: 40,
  repeat_penalty: 1.1,
  n_predict: 10000,
};

const MODEL_SETTINGS_KEY_PREFIX = "@model_settings_";

/**
 * Get settings for a specific model
 */
export const getModelSettings = async (modelFileName: string): Promise<ModelSettings> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    const settingsJson = await AsyncStorage.getItem(key);
    if (settingsJson) {
      const settings = JSON.parse(settingsJson);
      // Merge with defaults to ensure all fields exist
      return { ...DEFAULT_SETTINGS, ...settings };
    }
    return { ...DEFAULT_SETTINGS };
  } catch (error) {
    console.error(`Error loading settings for ${modelFileName}:`, error);
    return { ...DEFAULT_SETTINGS };
  }
};

/**
 * Save settings for a specific model
 */
export const saveModelSettings = async (
  modelFileName: string,
  settings: Partial<ModelSettings>
): Promise<void> => {
  try {
    const key = `${MODEL_SETTINGS_KEY_PREFIX}${modelFileName}`;
    const currentSettings = await getModelSettings(modelFileName);
    const updatedSettings = { ...currentSettings, ...settings };
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

