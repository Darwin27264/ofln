/**
 * List / delete on-device GGUF files.
 */

import RNFS from 'react-native-fs';
import {
  safeModelFileName,
  storedModelsFromDirEntries,
  type StoredModelFile,
} from '../utils/modelStorageHelpers';
import { logError } from '../utils/errorLogger';

export type { StoredModelFile };

export async function listStoredGgufModels(): Promise<StoredModelFile[]> {
  try {
    const entries = await RNFS.readDir(RNFS.DocumentDirectoryPath);
    return storedModelsFromDirEntries(entries as any);
  } catch (err) {
    void logError('ModelStorage', 'listStoredGgufModels failed', err);
    throw err;
  }
}

export async function getDeviceFreeSpaceBytes(): Promise<number | null> {
  try {
    const info = await RNFS.getFSInfo();
    const free = Number(info?.freeSpace);
    return Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

/**
 * Delete a final .gguf from the app document directory.
 * Caller must unload first if this file is the active model.
 */
export async function deleteStoredGgufFile(fileName: string): Promise<void> {
  const safe = safeModelFileName(fileName);
  if (!safe) {
    throw new Error('Invalid model file name');
  }
  const path = `${RNFS.DocumentDirectoryPath}/${safe}`;
  try {
    const exists = await RNFS.exists(path);
    if (!exists) {
      throw new Error('Model file not found');
    }
    await RNFS.unlink(path);
  } catch (err) {
    void logError('ModelStorage', 'deleteStoredGgufFile failed', err, {
      fileName: safe,
    });
    throw err;
  }
}
