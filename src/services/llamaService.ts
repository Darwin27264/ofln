/**
 * Lightweight filesystem helpers for model files.
 *
 * Product model load/unload lives in `llamaProvider`. Chat completion uses
 * `useAIChat` → `nativeCompletion`. This module only exposes existence checks
 * used by App and Diagnostics.
 */

import RNFS from 'react-native-fs';

/** Returns whether a path exists on disk; false on any I/O error. */
export const checkFileExists = async (filePath: string): Promise<boolean> => {
  try {
    return await RNFS.exists(filePath);
  } catch (error) {
    console.error('Error checking file existence:', error);
    return false;
  }
};
