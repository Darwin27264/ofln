import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";

const LOCAL_MODELS_KEY = "@local_models";

export interface LocalModelInfo {
  fileName: string;
  filePath: string;
  addedDate: string; // ISO date string
  fileSize?: number; // in bytes
}

/**
 * Get all saved local models
 */
export const getLocalModels = async (): Promise<LocalModelInfo[]> => {
  try {
    const modelsJson = await AsyncStorage.getItem(LOCAL_MODELS_KEY);
    if (modelsJson) {
      return JSON.parse(modelsJson);
    }
    return [];
  } catch (error) {
    console.error("Error loading local models:", error);
    return [];
  }
};

/**
 * Save a local model to storage
 */
export const saveLocalModel = async (model: LocalModelInfo): Promise<void> => {
  try {
    const models = await getLocalModels();
    // Check if model already exists (by filePath)
    const existingIndex = models.findIndex((m) => m.filePath === model.filePath);
    if (existingIndex >= 0) {
      // Update existing model
      models[existingIndex] = model;
    } else {
      // Add new model
      models.push(model);
    }
    await AsyncStorage.setItem(LOCAL_MODELS_KEY, JSON.stringify(models));
  } catch (error) {
    console.error("Error saving local model:", error);
    throw error;
  }
};

/**
 * Remove a local model from storage
 */
export const removeLocalModel = async (filePath: string): Promise<void> => {
  try {
    const models = await getLocalModels();
    const filtered = models.filter((m) => m.filePath !== filePath);
    await AsyncStorage.setItem(LOCAL_MODELS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error removing local model:", error);
    throw error;
  }
};

/**
 * Validate that all saved local models still exist on the file system
 * Returns list of valid models and removes invalid ones from storage
 */
export const validateLocalModels = async (): Promise<LocalModelInfo[]> => {
  try {
    const models = await getLocalModels();
    const validModels: LocalModelInfo[] = [];
    const invalidModels: string[] = [];

    for (const model of models) {
      try {
        const exists = await RNFS.exists(model.filePath);
        if (exists) {
          // Verify it's still a file (not a directory)
          const stat = await RNFS.stat(model.filePath);
          if (stat.isFile()) {
            // Update file size if it changed
            const updatedModel = {
              ...model,
              fileSize: stat.size,
            };
            validModels.push(updatedModel);
          } else {
            invalidModels.push(model.filePath);
          }
        } else {
          invalidModels.push(model.filePath);
        }
      } catch (error) {
        console.error(`Error checking model ${model.filePath}:`, error);
        invalidModels.push(model.filePath);
      }
    }

    // Remove invalid models from storage
    if (invalidModels.length > 0) {
      const filtered = models.filter((m) => !invalidModels.includes(m.filePath));
      await AsyncStorage.setItem(LOCAL_MODELS_KEY, JSON.stringify(filtered));
      console.log(`Removed ${invalidModels.length} invalid local models from storage`);
    }

    // Update storage with valid models (in case file sizes changed)
    if (validModels.length !== models.length || invalidModels.length > 0) {
      await AsyncStorage.setItem(LOCAL_MODELS_KEY, JSON.stringify(validModels));
    }

    return validModels;
  } catch (error) {
    console.error("Error validating local models:", error);
    return [];
  }
};

/**
 * Check if a file path is already saved as a local model
 */
export const isLocalModelSaved = async (filePath: string): Promise<boolean> => {
  try {
    const models = await getLocalModels();
    return models.some((m) => m.filePath === filePath);
  } catch (error) {
    console.error("Error checking if local model is saved:", error);
    return false;
  }
};

