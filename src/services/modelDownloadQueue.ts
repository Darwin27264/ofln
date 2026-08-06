/**
 * Bounded parallel model download queue (S32 restore).
 * Caps concurrency so restore does not thrash disk/network.
 * Sorts smallest-first via caller (sortModelsSmallestFirst).
 */

import {
  downloadModel,
  normalizeModelFileName,
  getModelDestPath,
} from '../api/model';
import RNFS from 'react-native-fs';
import { checkDiskSpaceForDownload } from '../utils/diskPreflight';
import type { BackupModelEntry } from '../utils/backupSchema';
import {
  isSafeRestoreDownloadUrl,
  sortModelsSmallestFirst,
  safeBackupModelFileName,
} from '../utils/backupSchema';
import { registerModelSource } from './modelCatalogService';

/** Safe default: 2 parallel streams (not serial, not unbounded). */
export const MODEL_DOWNLOAD_QUEUE_MAX_CONCURRENT = 2;

export type QueuedModelDownload = {
  fileName: string;
  downloadUrl: string;
  expectedBytes?: number | null;
};

export type ModelQueueProgress = {
  fileName: string;
  /** 0–100 for active file; -1 when waiting. */
  progress: number;
  index: number;
  total: number;
  phase: 'queued' | 'downloading' | 'done' | 'skipped' | 'error';
  error?: string;
};

export type ModelQueueResult = {
  completed: string[];
  skipped: string[];
  failed: Array<{ fileName: string; error: string }>;
};

export function toQueuedDownloads(
  models: BackupModelEntry[],
): QueuedModelDownload[] {
  return sortModelsSmallestFirst(models)
    .map((m) => {
      const fileName = safeBackupModelFileName(m.fileName);
      const downloadUrl =
        typeof m.downloadUrl === 'string' ? m.downloadUrl.trim() : '';
      if (!fileName || !isSafeRestoreDownloadUrl(downloadUrl)) return null;
      return {
        fileName: normalizeModelFileName(fileName),
        downloadUrl,
        expectedBytes: m.expectedBytes ?? m.sizeBytes ?? null,
      };
    })
    .filter((m): m is QueuedModelDownload => m != null);
}

/**
 * Download a list of models with max concurrency.
 * Skips files already present as final `.gguf`.
 */
export async function runModelDownloadQueue(
  items: QueuedModelDownload[],
  opts?: {
    maxConcurrent?: number;
    onProgress?: (p: ModelQueueProgress) => void;
    shouldCancel?: () => boolean;
  },
): Promise<ModelQueueResult> {
  const max = Math.max(
    1,
    Math.min(4, opts?.maxConcurrent ?? MODEL_DOWNLOAD_QUEUE_MAX_CONCURRENT),
  );
  const completed: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ fileName: string; error: string }> = [];
  const total = items.length;

  if (total === 0) {
    return { completed, skipped, failed };
  }

  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      if (opts?.shouldCancel?.()) return;
      const i = nextIndex++;
      if (i >= items.length) return;
      const item = items[i];
      const name = normalizeModelFileName(item.fileName);

      opts?.onProgress?.({
        fileName: name,
        progress: -1,
        index: i,
        total,
        phase: 'queued',
      });

      try {
        const dest = getModelDestPath(name);
        if (await RNFS.exists(dest)) {
          skipped.push(name);
          opts?.onProgress?.({
            fileName: name,
            progress: 100,
            index: i,
            total,
            phase: 'skipped',
          });
          continue;
        }

        const need =
          typeof item.expectedBytes === 'number' && item.expectedBytes > 0
            ? item.expectedBytes
            : 0;
        if (need > 0) {
          const pre = await checkDiskSpaceForDownload(need);
          if (!pre.ok) {
            throw new Error(
              pre.reason === 'insufficient'
                ? 'Not enough free storage for this model'
                : 'Could not check free storage',
            );
          }
        }

        opts?.onProgress?.({
          fileName: name,
          progress: 0,
          index: i,
          total,
          phase: 'downloading',
        });

        await downloadModel(name, item.downloadUrl, {
          expectedBytes: item.expectedBytes,
          onProgress: (pct) => {
            opts?.onProgress?.({
              fileName: name,
              progress: pct,
              index: i,
              total,
              phase: 'downloading',
            });
          },
        });

        await registerModelSource({
          fileName: name,
          downloadUrl: item.downloadUrl,
          expectedBytes: item.expectedBytes,
        });

        completed.push(name);
        opts?.onProgress?.({
          fileName: name,
          progress: 100,
          index: i,
          total,
          phase: 'done',
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Download failed';
        failed.push({ fileName: name, error: message });
        opts?.onProgress?.({
          fileName: name,
          progress: 0,
          index: i,
          total,
          phase: 'error',
          error: message,
        });
      }
    }
  };

  const workers = Array.from({ length: Math.min(max, items.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return { completed, skipped, failed };
}
