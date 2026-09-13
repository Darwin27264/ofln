/**
 * Persistent model download catalog — enables full-backup rehydrate.
 * Separate from ephemeral `@download_meta_*` (resume state).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { BackupModelEntry } from '../utils/backupSchema';
import {
  isHttpDownloadUrl,
  isSafeRestoreDownloadUrl,
  safeBackupModelFileName,
} from '../utils/backupSchema';

export const MODEL_CATALOG_KEY = '@model_catalog_v1';

export type ModelCatalogEntry = {
  fileName: string;
  downloadUrl: string;
  repoId?: string | null;
  expectedBytes?: number | null;
  sha256?: string | null;
  updatedAt: number;
};

type CatalogMap = Record<string, ModelCatalogEntry>;

function normalizeName(fileName: string): string | null {
  return safeBackupModelFileName(fileName);
}

/** Extract repoId from HuggingFace resolve URL when possible. */
export function repoIdFromDownloadUrl(url: string): string | null {
  try {
    const m = url.match(
      /huggingface\.co\/([^/]+\/[^/]+)\/(?:resolve|blob)\//i,
    );
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function readMap(): Promise<CatalogMap> {
  try {
    const raw = await AsyncStorage.getItem(MODEL_CATALOG_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as CatalogMap;
  } catch {
    return {};
  }
}

async function writeMap(map: CatalogMap): Promise<void> {
  await AsyncStorage.setItem(MODEL_CATALOG_KEY, JSON.stringify(map));
}

export async function getModelCatalog(): Promise<ModelCatalogEntry[]> {
  const map = await readMap();
  return Object.values(map).filter(
    (e) =>
      e &&
      typeof e.fileName === 'string' &&
      safeBackupModelFileName(e.fileName) != null &&
      isHttpDownloadUrl(e.downloadUrl),
  );
}

export async function getModelCatalogEntry(
  fileName: string,
): Promise<ModelCatalogEntry | null> {
  const name = normalizeName(fileName);
  if (!name) return null;
  const map = await readMap();
  return map[name] ?? null;
}

/**
 * Record a successful (or in-progress known) download source.
 * Safe to call after every finish — overwrites same fileName.
 */
export async function registerModelSource(opts: {
  fileName: string;
  downloadUrl: string;
  expectedBytes?: number | null;
  repoId?: string | null;
  sha256?: string | null;
}): Promise<void> {
  if (!isHttpDownloadUrl(opts.downloadUrl)) return;
  // Prefer https for new catalog rows; allow already-valid session downloads.
  if (
    !isSafeRestoreDownloadUrl(opts.downloadUrl) &&
    !opts.downloadUrl.trim().toLowerCase().startsWith('https://')
  ) {
    return;
  }
  const fileName = normalizeName(opts.fileName);
  if (!fileName) return;
  const map = await readMap();
  map[fileName] = {
    fileName,
    downloadUrl: opts.downloadUrl.trim(),
    repoId: opts.repoId ?? repoIdFromDownloadUrl(opts.downloadUrl),
    expectedBytes:
      typeof opts.expectedBytes === 'number' && opts.expectedBytes > 0
        ? opts.expectedBytes
        : map[fileName]?.expectedBytes ?? null,
    sha256: opts.sha256
      ? opts.sha256.trim().toLowerCase()
      : map[fileName]?.sha256 ?? null,
    updatedAt: Date.now(),
  };
  await writeMap(map);
}

export async function removeModelCatalogEntry(fileName: string): Promise<void> {
  const name = normalizeName(fileName);
  if (!name) return;
  const map = await readMap();
  delete map[name];
  await writeMap(map);
}

/** Merge catalog entries from a backup (only safe HTTPS URLs). */
export async function mergeModelCatalogFromBackup(
  entries: BackupModelEntry[],
): Promise<void> {
  const map = await readMap();
  for (const e of entries) {
    const fileName = safeBackupModelFileName(e.fileName);
    if (!fileName || !isSafeRestoreDownloadUrl(e.downloadUrl ?? undefined)) {
      continue;
    }
    map[fileName] = {
      fileName,
      downloadUrl: (e.downloadUrl as string).trim(),
      repoId: e.repoId ?? repoIdFromDownloadUrl(e.downloadUrl as string),
      expectedBytes: e.expectedBytes ?? map[fileName]?.expectedBytes ?? null,
      updatedAt: Date.now(),
    };
  }
  await writeMap(map);
}

export async function replaceModelCatalogFromBackup(
  entries: BackupModelEntry[],
): Promise<void> {
  const map: CatalogMap = {};
  for (const e of entries) {
    const fileName = safeBackupModelFileName(e.fileName);
    if (!fileName || !isSafeRestoreDownloadUrl(e.downloadUrl ?? undefined)) {
      continue;
    }
    map[fileName] = {
      fileName,
      downloadUrl: (e.downloadUrl as string).trim(),
      repoId: e.repoId ?? repoIdFromDownloadUrl(e.downloadUrl as string),
      expectedBytes: e.expectedBytes ?? null,
      updatedAt: Date.now(),
    };
  }
  await writeMap(map);
}
