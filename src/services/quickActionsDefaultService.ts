/**
 * Default GGUF for Android Share / Quick actions overlay.
 * Preference is a file name; overlay falls back via `pickQuickActionsModelFile`.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const QUICK_ACTIONS_DEFAULT_KEY = '@ofln/quick_actions_default_model';

export async function getQuickActionsDefaultModel(): Promise<string | null> {
  try {
    const raw = await AsyncStorage.getItem(QUICK_ACTIONS_DEFAULT_KEY);
    const name = raw?.trim();
    return name ? name : null;
  } catch {
    return null;
  }
}

export async function setQuickActionsDefaultModel(
  fileName: string | null,
): Promise<void> {
  const name = fileName?.trim() ?? '';
  if (!name) {
    await AsyncStorage.removeItem(QUICK_ACTIONS_DEFAULT_KEY);
    return;
  }
  await AsyncStorage.setItem(QUICK_ACTIONS_DEFAULT_KEY, name);
}

export async function clearQuickActionsDefaultIfMatch(
  fileName: string,
): Promise<void> {
  const current = await getQuickActionsDefaultModel();
  if (current === fileName) {
    await setQuickActionsDefaultModel(null);
  }
}
