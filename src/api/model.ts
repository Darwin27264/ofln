/**
 * Model download API.
 * S06: resumable downloads via react-native-blob-util → `.gguf.partial` + AsyncStorage meta.
 * S07: size verify on complete before rename/activate.
 * Feature flag: USE_RESUMABLE_DOWNLOADS (legacy RNFS path when false).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { hfAuthHeaders } from '../services/hfTokenService';

/** Flip false to force legacy RNFS one-shot download (no resume). */
export const USE_RESUMABLE_DOWNLOADS = true;

const META_KEY_PREFIX = '@download_meta_';
/** Allow small Content-Length vs on-disk drift (headers / FS rounding). */
const SIZE_TOLERANCE_BYTES = 64 * 1024; // 64 KB

export type CancelMode = 'pause' | 'discard';

export interface DownloadCancellationToken {
  /** pause = keep .partial; discard = delete partial + meta. Default pause when resumable. */
  cancel: (mode?: CancelMode) => Promise<void>;
  isCancelled: () => boolean;
  getMode: () => CancelMode | null;
}

export type DownloadModelOptions = {
  expectedBytes?: number | null;
  onProgress?: (progress: number) => void;
  cancellationToken?: DownloadCancellationToken;
};

type DownloadMeta = {
  url: string;
  modelName: string;
  expectedBytes: number | null;
  bytesWritten: number;
  updatedAt: number;
};

type ActiveDownload = {
  task: { cancel: () => void } | null;
  destPath: string;
  partialPath: string;
  /** Resume writes here first; merged into partial only after a good 206/200. */
  chunkPath: string | null;
  mode: CancelMode | null;
};

const activeDownloads = new Map<string, ActiveDownload>();
/** Serialize concurrent starts for the same model name. */
const inFlightByModel = new Map<string, Promise<string>>();

export function normalizeModelFileName(modelName: string): string {
  // Prevent path traversal if a malicious backup injects `../` into a model name.
  const base = (modelName || '').replace(/^.*[/\\]/, '').trim() || 'model.gguf';
  return base.toLowerCase().endsWith('.gguf') ? base : `${base}.gguf`;
}

export function getModelDestPath(modelName: string): string {
  const name = normalizeModelFileName(modelName);
  // Refuse anything that still looks path-like after basename strip.
  if (
    !name ||
    name === '.' ||
    name === '..' ||
    name.includes('..') ||
    name.includes('/') ||
    name.includes('\\')
  ) {
    throw new Error('Invalid model file name');
  }
  return `${RNFS.DocumentDirectoryPath}/${name}`;
}

/** Final models are `*.gguf`. Partials are `*.gguf.partial` — never load these. */
export function getPartialPath(destPath: string): string {
  return `${destPath}.partial`;
}

export function isPartialFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.partial');
}

function metaKey(modelName: string): string {
  return `${META_KEY_PREFIX}${normalizeModelFileName(modelName)}`;
}

async function saveMeta(meta: DownloadMeta): Promise<void> {
  await AsyncStorage.setItem(metaKey(meta.modelName), JSON.stringify(meta));
}

async function loadMeta(modelName: string): Promise<DownloadMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(metaKey(modelName));
    if (!raw) return null;
    return JSON.parse(raw) as DownloadMeta;
  } catch {
    return null;
  }
}

async function clearMeta(modelName: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(metaKey(modelName));
  } catch {
    /* ignore */
  }
}

export async function getPausedDownloadProgress(
  modelName: string,
): Promise<number | null> {
  const name = normalizeModelFileName(modelName);
  const dest = getModelDestPath(name);
  const partial = getPartialPath(dest);
  const meta = await loadMeta(name);
  if (!(await RNFS.exists(partial))) return null;
  try {
    const stat = await RNFS.stat(partial);
    const written = Number(stat.size) || 0;
    const expected = meta?.expectedBytes;
    if (expected && expected > 0) {
      return Math.min(99, Math.floor((written / expected) * 100));
    }
    return written > 0 ? 1 : null;
  } catch {
    return null;
  }
}

export async function listPausedDownloadNames(): Promise<string[]> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const metaKeys = keys.filter((k) => k.startsWith(META_KEY_PREFIX));
    const names: string[] = [];
    for (const key of metaKeys) {
      const name = key.slice(META_KEY_PREFIX.length);
      const partial = getPartialPath(getModelDestPath(name));
      if (await RNFS.exists(partial)) names.push(name);
    }
    return names;
  } catch {
    return [];
  }
}

async function safeUnlink(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    if (await RNFS.exists(path)) await RNFS.unlink(path);
  } catch {
    /* ignore */
  }
}

export async function discardPartialDownload(modelName: string): Promise<void> {
  const name = normalizeModelFileName(modelName);
  const dest = getModelDestPath(name);
  const partial = getPartialPath(dest);
  await safeUnlink(partial);
  await safeUnlink(`${partial}.chunk`);
  await clearMeta(name);
}

function assertNotPartialPath(path: string) {
  if (path.toLowerCase().endsWith('.partial')) {
    throw new Error('Refusing to activate a .partial model file');
  }
}

/** S07 — compare on-disk size to expected Content-Length / known size. */
export function sizesMatch(
  actualBytes: number,
  expectedBytes: number | null | undefined,
  tolerance = SIZE_TOLERANCE_BYTES,
): boolean {
  if (expectedBytes == null || expectedBytes <= 0) return true;
  return Math.abs(actualBytes - expectedBytes) <= tolerance;
}

async function verifyAndActivate(
  partialPath: string,
  destPath: string,
  expectedBytes: number | null,
): Promise<string> {
  assertNotPartialPath(destPath);
  const stat = await RNFS.stat(partialPath);
  const actual = Number(stat.size) || 0;
  if (!sizesMatch(actual, expectedBytes)) {
    // Leave partial for retry; do not rename to .gguf.
    throw new Error(
      `Download size mismatch: expected ~${expectedBytes} bytes, got ${actual}`,
    );
  }
  if (await RNFS.exists(destPath)) {
    await RNFS.unlink(destPath);
  }
  await RNFS.moveFile(partialPath, destPath);
  return destPath;
}

export const downloadModel = async (
  modelName: string,
  modelUrl: string,
  onProgressOrOpts?: ((progress: number) => void) | DownloadModelOptions,
  cancellationTokenMaybe?: DownloadCancellationToken,
): Promise<string> => {
  // Back-compat: (name, url, onProgress, token) or (name, url, options)
  let options: DownloadModelOptions;
  if (typeof onProgressOrOpts === 'function') {
    options = {
      onProgress: onProgressOrOpts,
      cancellationToken: cancellationTokenMaybe,
    };
  } else {
    options = onProgressOrOpts || {};
  }

  const name = normalizeModelFileName(modelName);
  const existing = inFlightByModel.get(name);
  if (existing) return existing;

  const run = USE_RESUMABLE_DOWNLOADS
    ? downloadModelResumable(name, modelUrl, options)
    : downloadModelLegacy(name, modelUrl, options);

  inFlightByModel.set(name, run);
  try {
    return await run;
  } finally {
    if (inFlightByModel.get(name) === run) {
      inFlightByModel.delete(name);
    }
  }
};

async function downloadModelResumable(
  modelName: string,
  modelUrl: string,
  options: DownloadModelOptions,
): Promise<string> {
  const { onProgress, cancellationToken, expectedBytes: expectedHint } = options;
  const destPath = getModelDestPath(modelName);
  const partialPath = getPartialPath(destPath);
  const chunkPath = `${partialPath}.chunk`;
  const downloadKey = modelName;

  if (cancellationToken?.isCancelled()) {
    throw pauseOrCancelError(cancellationToken);
  }

  // Final file already present — caller (App) usually short-circuits earlier.
  if (await RNFS.exists(destPath)) {
    return destPath;
  }

  // Drop any orphan chunk from a prior interrupted resume attempt.
  await safeUnlink(chunkPath);

  let existingBytes = 0;
  if (await RNFS.exists(partialPath)) {
    try {
      const st = await RNFS.stat(partialPath);
      existingBytes = Number(st.size) || 0;
    } catch {
      existingBytes = 0;
    }
  }

  const prevMeta = await loadMeta(modelName);
  let expectedBytes =
    expectedHint && expectedHint > 0
      ? expectedHint
      : prevMeta?.expectedBytes && prevMeta.expectedBytes > 0
        ? prevMeta.expectedBytes
        : null;

  await saveMeta({
    url: modelUrl,
    modelName,
    expectedBytes,
    bytesWritten: existingBytes,
    updatedAt: Date.now(),
  });

  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
  };
  if (existingBytes > 0) {
    headers.Range = `bytes=${existingBytes}-`;
  }

  // S08 — Bearer only for huggingface.co (never for other hosts).
  Object.assign(headers, await hfAuthHeaders(modelUrl));

  // Fresh downloads write straight to .partial.
  // Resumes write to .chunk first so a 200 (Range ignored) cannot append-corrupt .partial.
  const writePath = existingBytes > 0 ? chunkPath : partialPath;

  console.log(
    `Starting ${existingBytes > 0 ? 'resumable' : 'fresh'} download:`,
    modelUrl,
    existingBytes > 0 ? `(from byte ${existingBytes})` : '',
  );

  const task = ReactNativeBlobUtil.config({
    path: writePath,
    fileCache: true,
    overwrite: true,
    timeout: 10 * 60 * 1000,
  }).fetch('GET', modelUrl, headers);

  activeDownloads.set(downloadKey, {
    task,
    destPath,
    partialPath,
    chunkPath: existingBytes > 0 ? chunkPath : null,
    mode: null,
  });

  task.progress({ count: 20, interval: 250 }, (received, total) => {
    const info = activeDownloads.get(downloadKey);
    if (info?.mode || cancellationToken?.isCancelled()) return;

    const recv = Number(received) || 0;
    const tot = Number(total) || 0;
    // When resuming, `received`/`total` are often for the remaining range only.
    const written = existingBytes + recv;
    let overallTotal = expectedBytes;
    if (!overallTotal || overallTotal <= 0) {
      overallTotal = existingBytes > 0 && tot > 0 ? existingBytes + tot : tot;
      if (overallTotal > 0) expectedBytes = overallTotal;
    }
    if (overallTotal > 0) {
      const pct = Math.min(99, Math.floor((written / overallTotal) * 100));
      onProgress?.(pct);
    }
  });

  try {
    const res = await task;
    const status = res.info()?.status ?? 0;

    if (cancellationToken?.isCancelled()) {
      throw pauseOrCancelError(cancellationToken);
    }

    // Prefer Content-Length of full entity when available.
    const headersOut = res.info()?.headers || {};
    const contentRange =
      headersOut['Content-Range'] ||
      headersOut['content-range'] ||
      headersOut['CONTENT-RANGE'];
    if (typeof contentRange === 'string') {
      const m = contentRange.match(/\/(\d+)\s*$/);
      if (m) expectedBytes = Number(m[1]) || expectedBytes;
    } else if (status === 200) {
      const cl =
        headersOut['Content-Length'] ||
        headersOut['content-length'] ||
        headersOut['CONTENT-LENGTH'];
      if (cl) expectedBytes = Number(cl) || expectedBytes;
    }

    if (existingBytes > 0) {
      // Merge chunk into .partial only after a successful response.
      if (status === 206) {
        await ReactNativeBlobUtil.fs.appendFile(partialPath, chunkPath, 'uri');
        await safeUnlink(chunkPath);
      } else if (status === 200) {
        // Server ignored Range and sent the full body — replace partial.
        await safeUnlink(partialPath);
        await RNFS.moveFile(chunkPath, partialPath);
      } else {
        await safeUnlink(chunkPath);
        throw new Error(`Download failed with status code: ${status}`);
      }
    } else if (status !== 200 && status !== 206) {
      throw new Error(`Download failed with status code: ${status}`);
    }

    const activated = await verifyAndActivate(partialPath, destPath, expectedBytes);
    await clearMeta(modelName);
    activeDownloads.delete(downloadKey);
    onProgress?.(100);
    // Persist download URL so full-device backups can re-fetch on another phone (S32).
    try {
      const { registerModelSource } = await import(
        '../services/modelCatalogService'
      );
      await registerModelSource({
        fileName: modelName,
        downloadUrl: modelUrl,
        expectedBytes,
      });
    } catch {
      /* catalog is best-effort */
    }
    return activated;
  } catch (error) {
    const info = activeDownloads.get(downloadKey);
    const mode = cancellationToken?.getMode() ?? info?.mode;
    activeDownloads.delete(downloadKey);
    // Never keep a half-written resume chunk (would double-append on retry).
    await safeUnlink(chunkPath);

    if (mode === 'pause' || (cancellationToken?.isCancelled() && mode !== 'discard')) {
      // Keep .partial + meta for resume.
      try {
        if (await RNFS.exists(partialPath)) {
          const st = await RNFS.stat(partialPath);
          await saveMeta({
            url: modelUrl,
            modelName,
            expectedBytes,
            bytesWritten: Number(st.size) || 0,
            updatedAt: Date.now(),
          });
        }
      } catch {
        /* ignore */
      }
      throw new Error('Download was paused');
    }

    if (mode === 'discard' || (error instanceof Error && /cancelled/i.test(error.message))) {
      await discardPartialDownload(modelName);
      throw new Error('Download was cancelled');
    }

    // Network / other failure: keep partial for resume (S06 mid-fail resume).
    try {
      if (await RNFS.exists(partialPath)) {
        const st = await RNFS.stat(partialPath);
        await saveMeta({
          url: modelUrl,
          modelName,
          expectedBytes,
          bytesWritten: Number(st.size) || 0,
          updatedAt: Date.now(),
        });
      }
    } catch {
      /* ignore */
    }

    if (error instanceof Error) {
      if (/size mismatch/i.test(error.message)) throw error;
      if (/paused/i.test(error.message)) throw error;
      throw new Error(`Failed to download model: ${error.message}`);
    }
    throw new Error('Failed to download model: Unknown error');
  }
}

function pauseOrCancelError(token: DownloadCancellationToken): Error {
  return new Error(
    token.getMode() === 'discard' ? 'Download was cancelled' : 'Download was paused',
  );
}

/** Legacy one-shot RNFS path (flag off). Deletes dest at start; no resume. */
async function downloadModelLegacy(
  modelName: string,
  modelUrl: string,
  options: DownloadModelOptions,
): Promise<string> {
  const { onProgress, cancellationToken, expectedBytes } = options;
  const destPath = getModelDestPath(modelName);
  const downloadKey = modelName;

  if (cancellationToken?.isCancelled()) {
    throw new Error('Download was cancelled');
  }

  if (await RNFS.exists(destPath)) {
    await RNFS.unlink(destPath);
  }

  const authHeaders = await hfAuthHeaders(modelUrl);
  const downloadJob = RNFS.downloadFile({
    fromUrl: modelUrl,
    toFile: destPath,
    headers: authHeaders,
    progressDivider: 5,
    begin: (res) => {
      activeDownloads.set(downloadKey, {
        task: {
          cancel: () => {
            try {
              RNFS.stopDownload?.(res.jobId);
            } catch {
              /* ignore */
            }
          },
        },
        destPath,
        partialPath: destPath,
        chunkPath: null,
        mode: null,
      });
    },
    progress: ({ bytesWritten, contentLength }) => {
      if (cancellationToken?.isCancelled()) return;
      if (contentLength > 0) {
        onProgress?.(Math.floor((bytesWritten / contentLength) * 100));
      }
    },
  });

  try {
    const result = await downloadJob.promise;
    if (cancellationToken?.isCancelled()) {
      try {
        if (await RNFS.exists(destPath)) await RNFS.unlink(destPath);
      } catch {
        /* ignore */
      }
      throw new Error('Download was cancelled');
    }
    activeDownloads.delete(downloadKey);
    if (result.statusCode !== 200) {
      throw new Error(`Download failed with status code: ${result.statusCode}`);
    }
    const st = await RNFS.stat(destPath);
    if (!sizesMatch(Number(st.size) || 0, expectedBytes ?? null)) {
      await RNFS.unlink(destPath);
      throw new Error(
        `Download size mismatch: expected ~${expectedBytes} bytes, got ${st.size}`,
      );
    }
    onProgress?.(100);
    try {
      const { registerModelSource } = await import(
        '../services/modelCatalogService'
      );
      await registerModelSource({
        fileName: modelName,
        downloadUrl: modelUrl,
        expectedBytes: expectedBytes ?? null,
      });
    } catch {
      /* catalog is best-effort */
    }
    return destPath;
  } catch (error) {
    activeDownloads.delete(downloadKey);
    if (error instanceof Error && /cancelled|mismatch/i.test(error.message)) {
      throw error;
    }
    try {
      if (await RNFS.exists(destPath)) await RNFS.unlink(destPath);
    } catch {
      /* ignore */
    }
    if (error instanceof Error) {
      throw new Error(`Failed to download model: ${error.message}`);
    }
    throw new Error('Failed to download model: Unknown error');
  }
}

export const createCancellationToken = (modelName: string): DownloadCancellationToken => {
  const downloadKey = normalizeModelFileName(modelName);
  let cancelled = false;
  let mode: CancelMode | null = null;

  return {
    cancel: async (requested: CancelMode = USE_RESUMABLE_DOWNLOADS ? 'pause' : 'discard') => {
      if (cancelled && mode) return;
      cancelled = true;
      mode = requested;
      const info = activeDownloads.get(downloadKey);
      if (info) {
        info.mode = requested;
        try {
          info.task?.cancel();
        } catch {
          /* ignore */
        }
        if (requested === 'discard') {
          try {
            if (await RNFS.exists(info.partialPath)) {
              await RNFS.unlink(info.partialPath);
            }
          } catch {
            /* ignore */
          }
          await safeUnlink(info.chunkPath);
          await clearMeta(downloadKey);
        }
        // pause: leave partial + meta for resume; chunk cleaned by download catch
      } else if (requested === 'discard') {
        await discardPartialDownload(downloadKey);
      }
    },
    isCancelled: () => cancelled,
    getMode: () => mode,
  };
};

export function isDownloadPausedError(err: unknown): boolean {
  return err instanceof Error && /download was paused/i.test(err.message);
}

export function isDownloadCancelledError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (/download was cancelled/i.test(err.message) || /cancelled by user/i.test(err.message))
  );
}
