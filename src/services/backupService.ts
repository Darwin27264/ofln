/**
 * Backup / restore service.
 *
 * Portable offline device transfer:
 * - Versioned JSON with magic `format: ofln-backup`
 * - Chats-only: single `.json`
 * - Full: `.zip` of JSON parts (not multi-GB GGUFs)
 * - Models: catalog + auto re-download (smallest first, capped parallel)
 * - Never export Keychain secrets (HF token)
 * - User picks save location via system Save dialog (SAF / Files)
 *
 * Agents adding new durable user data: see README.md → "Backup & restore"
 * (checklist). Wire export+import here and update schema tables in that section.
 */

import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  pick,
  keepLocalCopy,
  saveDocuments,
  isErrorWithCode,
  errorCodes,
  types,
} from '@react-native-documents/picker';
import { chatHistoryService } from './chatHistoryService';
import {
  getPersonas,
  replaceAllPersonas,
  mergePersonasImport,
} from './personaService';
import {
  getPerspectivePresets,
  replaceAllPerspectivePresets,
  mergePerspectivePresetsImport,
  attachPerspectiveMetaToChats,
  setPerspectiveChatMeta,
  type PerspectiveChatMeta,
} from './perspectiveService';
import {
  getAllTaskRuns,
  getTasks,
  mergeTaskRunsImport,
  mergeTasksImport,
  replaceAllTaskRuns,
  replaceAllTasks,
} from './taskService';
import {
  exportAllModelSettings,
  importModelSettingsMap,
} from './modelSettingsService';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  BACKUP_MAX_IMPORT_BYTES,
  type BackupImportMode,
  type BackupKind,
  type BackupModelEntry,
  type BackupPayloadV1,
  type BackupSettingsV1,
  buildBackupFileName,
  isHttpDownloadUrl,
  isSafeRestoreDownloadUrl,
  parseBackupPayload,
  sanitizeChatForBackup,
  sortModelsSmallestFirst,
} from '../utils/backupSchema';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToUtf8,
  createZipStore,
  extractZipStore,
  looksLikeZip,
  utf8ToBytes,
} from '../utils/zipStore';
import {
  getModelCatalog,
  mergeModelCatalogFromBackup,
  replaceModelCatalogFromBackup,
  registerModelSource,
} from './modelCatalogService';
import { listStoredGgufModels } from './modelStorageService';
import {
  runModelDownloadQueue,
  toQueuedDownloads,
  type ModelQueueProgress,
  type ModelQueueResult,
} from './modelDownloadQueue';
import { USAGE_LOG_PATH } from './performanceTracking';
import { ONBOARDING_COMPLETE_KEY } from './onboardingService';
import { THEME_STORAGE_KEY } from '../context/ThemeContext';
import { logError } from '../utils/errorLogger';

const APP_VERSION = '1.1';

export type ExportBackupResult = {
  kind: BackupKind;
  fileName: string;
  savedUri?: string | null;
  chatCount: number;
  modelCount: number;
};

export type ImportBackupResult = {
  kind: BackupKind;
  mode: BackupImportMode;
  chatsImported: number;
  personasImported: number;
  perspectivePresetsImported: number;
  tasksImported: number;
  taskRunsImported: number;
  settingsApplied: boolean;
  themeMode: 'light' | 'dark' | null;
  models: ModelQueueResult | null;
  modelsWithoutUrl: string[];
  warnings: string[];
};

export type ImportProgress =
  | { stage: 'reading' }
  | { stage: 'applying' }
  | { stage: 'models'; progress: ModelQueueProgress }
  | { stage: 'done' };

function toFileUri(path: string): string {
  if (path.startsWith('file://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  // Encode path segments (spaces) but keep slashes absolute.
  const encoded = normalized
    .split('/')
    .map((seg, i) => (i === 0 ? '' : encodeURIComponent(seg)))
    .join('/');
  return `file://${encoded}`;
}

/** Normalize file:// / local paths for RNFS.stat/read/unlink. */
function uriToLocalPath(uriOrPath: string): string {
  let p = (uriOrPath || '').trim();
  if (!p) return p;
  if (p.startsWith('file://')) {
    p = p.replace(/^file:\/\//, '');
    // file:///data/... → /data/...
    try {
      p = decodeURIComponent(p);
    } catch {
      /* keep raw */
    }
  }
  return p;
}

async function cleanupPath(path: string | null | undefined): Promise<void> {
  if (!path) return;
  try {
    const p = uriToLocalPath(path);
    if (p && (await RNFS.exists(p))) await RNFS.unlink(p);
  } catch {
    /* ignore */
  }
}

async function readUsageLog(): Promise<unknown[] | null> {
  try {
    if (!(await RNFS.exists(USAGE_LOG_PATH))) return null;
    const raw = await RNFS.readFile(USAGE_LOG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeUsageLog(entries: unknown[] | null | undefined): Promise<void> {
  if (entries == null || !Array.isArray(entries)) return;
  // Cap merged logs to avoid runaway growth from repeated import merges.
  const capped =
    entries.length > 5000 ? entries.slice(entries.length - 5000) : entries;
  try {
    await RNFS.writeFile(USAGE_LOG_PATH, JSON.stringify(capped), 'utf8');
  } catch (err) {
    void logError('Backup', 'writeUsageLog failed', err);
  }
}

async function collectModelEntries(): Promise<BackupModelEntry[]> {
  const [stored, catalog] = await Promise.all([
    listStoredGgufModels(),
    getModelCatalog(),
  ]);
  const byName = new Map<string, BackupModelEntry>();

  for (const c of catalog) {
    byName.set(c.fileName, {
      fileName: c.fileName,
      downloadUrl: c.downloadUrl,
      repoId: c.repoId,
      expectedBytes: c.expectedBytes,
      sha256: c.sha256,
    });
  }

  for (const s of stored) {
    const prev = byName.get(s.fileName);
    byName.set(s.fileName, {
      fileName: s.fileName,
      downloadUrl: prev?.downloadUrl ?? null,
      repoId: prev?.repoId ?? null,
      expectedBytes: prev?.expectedBytes ?? s.sizeBytes,
      sizeBytes: s.sizeBytes,
      sha256: prev?.sha256 ?? null,
    });
  }

  return sortModelsSmallestFirst([...byName.values()]);
}

async function collectSettings(): Promise<BackupSettingsV1> {
  const [themeMode, onboardingRaw, modelSettings] = await Promise.all([
    AsyncStorage.getItem(THEME_STORAGE_KEY),
    AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY),
    exportAllModelSettings(),
  ]);
  return {
    themeMode:
      themeMode === 'light' || themeMode === 'dark' ? themeMode : null,
    onboardingComplete:
      onboardingRaw === 'true' || onboardingRaw === '1' ? true : false,
    modelSettings,
  };
}

async function buildFullPayload(): Promise<BackupPayloadV1> {
  const [chatsRaw, personas, perspectivePresets, tasks, taskRuns, settings, models, usageLog] =
    await Promise.all([
      chatHistoryService.getAllChats(),
      getPersonas(),
      getPerspectivePresets(),
      getTasks(),
      getAllTaskRuns(),
      collectSettings(),
      collectModelEntries(),
      readUsageLog(),
    ]);
  const chats = await attachPerspectiveMetaToChats(chatsRaw);
  // Cap run payloads in backups (fetched text can be large).
  const cappedRuns = taskRuns.slice(0, 100).map((r) => ({
    ...r,
    fetchedText:
      r.fetchedText && r.fetchedText.length > 4000
        ? `${r.fetchedText.slice(0, 4000)}\n\n[…truncated for backup]`
        : r.fetchedText,
    resultText:
      r.resultText && r.resultText.length > 8000
        ? `${r.resultText.slice(0, 8000)}\n\n[…truncated for backup]`
        : r.resultText,
  }));
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'full',
    exportedAt: Date.now(),
    appVersion: APP_VERSION,
    chats: chats.map(sanitizeChatForBackup),
    personas,
    perspectivePresets,
    tasks,
    taskRuns: cappedRuns,
    settings,
    models,
    usageLog,
  };
}

async function buildChatsPayload(): Promise<BackupPayloadV1> {
  const chatsRaw = await chatHistoryService.getAllChats();
  const chats = await attachPerspectiveMetaToChats(chatsRaw);
  return {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'chats',
    exportedAt: Date.now(),
    appVersion: APP_VERSION,
    chats: chats.map(sanitizeChatForBackup),
  };
}

function fullPayloadToZipBytes(payload: BackupPayloadV1): Uint8Array {
  const manifest = {
    format: BACKUP_FORMAT,
    schemaVersion: BACKUP_SCHEMA_VERSION,
    kind: 'full' as const,
    exportedAt: payload.exportedAt,
    appVersion: payload.appVersion,
    files: [
      'manifest.json',
      'chats.json',
      'personas.json',
      'perspectives.json',
      'tasks.json',
      'task_runs.json',
      'settings.json',
      'models.json',
      'stages.json',
    ],
  };
  return createZipStore([
    { name: 'manifest.json', data: utf8ToBytes(JSON.stringify(manifest, null, 2)) },
    { name: 'chats.json', data: utf8ToBytes(JSON.stringify(payload.chats ?? [], null, 2)) },
    { name: 'personas.json', data: utf8ToBytes(JSON.stringify(payload.personas ?? [], null, 2)) },
    {
      name: 'perspectives.json',
      data: utf8ToBytes(JSON.stringify(payload.perspectivePresets ?? [], null, 2)),
    },
    { name: 'tasks.json', data: utf8ToBytes(JSON.stringify(payload.tasks ?? [], null, 2)) },
    {
      name: 'task_runs.json',
      data: utf8ToBytes(JSON.stringify(payload.taskRuns ?? [], null, 2)),
    },
    { name: 'settings.json', data: utf8ToBytes(JSON.stringify(payload.settings ?? {}, null, 2)) },
    { name: 'models.json', data: utf8ToBytes(JSON.stringify(payload.models ?? [], null, 2)) },
    { name: 'stages.json', data: utf8ToBytes(JSON.stringify(payload.usageLog ?? [], null, 2)) },
  ]);
}

function zipBytesToPayload(buf: Uint8Array): BackupPayloadV1 {
  const entries = extractZipStore(buf);
  const map = new Map(entries.map((e) => [e.name, e.data]));
  const manifestRaw = map.get('manifest.json');
  if (!manifestRaw) {
    throw new Error('Archive is missing manifest.json');
  }
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(bytesToUtf8(manifestRaw));
  } catch {
    throw new Error('Archive manifest is not valid JSON');
  }
  if (manifest.format !== BACKUP_FORMAT) {
    throw new Error('Not an OFLN backup archive');
  }

  const readJson = (name: string): unknown => {
    const b = map.get(name);
    if (!b) return undefined;
    try {
      return JSON.parse(bytesToUtf8(b));
    } catch {
      throw new Error(`Archive entry ${name} is not valid JSON`);
    }
  };

  const assembled = {
    format: BACKUP_FORMAT,
    schemaVersion: Number(manifest.schemaVersion) || 1,
    kind: (manifest.kind as string) || 'full',
    exportedAt:
      typeof manifest.exportedAt === 'number' ? manifest.exportedAt : Date.now(),
    appVersion:
      typeof manifest.appVersion === 'string' ? manifest.appVersion : 'unknown',
    chats: readJson('chats.json'),
    personas: readJson('personas.json'),
    perspectivePresets: readJson('perspectives.json'),
    tasks: readJson('tasks.json'),
    taskRuns: readJson('task_runs.json'),
    settings: readJson('settings.json'),
    models: readJson('models.json'),
    usageLog: readJson('stages.json'),
  };

  const parsed = parseBackupPayload(assembled);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.payload;
}

async function saveBytesWithUserPicker(opts: {
  bytes: Uint8Array;
  fileName: string;
  mimeType: string;
}): Promise<{ savedUri?: string | null; fileName: string }> {
  // Unique cache path so concurrent/failed exports cannot collide.
  const safeName = opts.fileName.replace(/[^\w.\-]+/g, '_') || 'ofln-backup.bin';
  const dest = `${RNFS.CachesDirectoryPath}/ofln_export_${Date.now()}_${safeName}`;
  await RNFS.writeFile(dest, bytesToBase64(opts.bytes), 'base64');
  try {
    const result = await saveDocuments({
      sourceUris: [toFileUri(dest)],
      fileName: opts.fileName,
      mimeType: opts.mimeType,
      copy: true,
    });
    const first = Array.isArray(result) ? result[0] : result;
    if (first?.error) {
      throw new Error(first.error);
    }
    return {
      savedUri: first?.uri ?? null,
      fileName: first?.name || opts.fileName,
    };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      throw new Error('EXPORT_CANCELLED');
    }
    throw err;
  } finally {
    await cleanupPath(dest);
  }
}

export async function exportChatsBackup(): Promise<ExportBackupResult> {
  const payload = await buildChatsPayload();
  const fileName = buildBackupFileName('chats');
  const saved = await saveBytesWithUserPicker({
    bytes: utf8ToBytes(JSON.stringify(payload, null, 2)),
    fileName,
    mimeType: 'application/json',
  });
  return {
    kind: 'chats',
    fileName: saved.fileName,
    savedUri: saved.savedUri,
    chatCount: payload.chats?.length ?? 0,
    modelCount: 0,
  };
}

export async function exportFullBackup(): Promise<ExportBackupResult> {
  const payload = await buildFullPayload();
  const fileName = buildBackupFileName('full');
  const saved = await saveBytesWithUserPicker({
    bytes: fullPayloadToZipBytes(payload),
    fileName,
    mimeType: 'application/zip',
  });
  return {
    kind: 'full',
    fileName: saved.fileName,
    savedUri: saved.savedUri,
    chatCount: payload.chats?.length ?? 0,
    modelCount: payload.models?.length ?? 0,
  };
}

async function loadImportBytes(): Promise<{
  bytes: Uint8Array;
  localPath: string | null;
}> {
  const result = await pick({
    type: [
      types.allFiles,
      types.json,
      types.zip,
      'application/json',
      'application/zip',
      'application/x-zip-compressed',
    ],
    allowMultiSelection: false,
  });
  const picked = Array.isArray(result) ? result[0] : result;
  if (!picked?.uri) {
    throw new Error('No file selected');
  }

  const name = picked.name || 'backup.bin';
  let localPath: string | null = null;
  try {
    const copies = await keepLocalCopy({
      files: [
        {
          uri: picked.uri,
          fileName: name.replace(/[^\w.\-]+/g, '_') || 'backup.bin',
        },
      ],
      destination: 'cachesDirectory',
    });
    const first = Array.isArray(copies) ? copies[0] : copies;
    if (first?.status === 'success' && first.localUri) {
      localPath = uriToLocalPath(String(first.localUri));
    } else if (first?.status === 'error') {
      // Prefer a clear message when SAF copy fails.
      console.warn('keepLocalCopy failed', first.copyError);
    }
  } catch {
    /* fall through */
  }

  const uri = String(picked.uri);
  if (!localPath) {
    if (uri.startsWith('content://')) {
      throw new Error(
        'Could not open the selected file. Save it to device storage and try again.',
      );
    }
    if (uri.startsWith('file://') || uri.startsWith('/')) {
      localPath = uriToLocalPath(uri);
    } else {
      throw new Error('Unsupported file location for import');
    }
  }

  const pathToRead = localPath;

  let size = 0;
  try {
    const st = await RNFS.stat(pathToRead);
    size = Number(st.size) || 0;
  } catch {
    await cleanupPath(localPath);
    throw new Error(
      'Could not read the backup file. Check the file still exists and try again.',
    );
  }
  if (size > BACKUP_MAX_IMPORT_BYTES) {
    await cleanupPath(localPath);
    throw new Error(
      `Backup is too large (${Math.round(size / (1024 * 1024))} MB). Max ${Math.round(BACKUP_MAX_IMPORT_BYTES / (1024 * 1024))} MB.`,
    );
  }
  if (size === 0) {
    await cleanupPath(localPath);
    throw new Error('Backup file is empty');
  }

  const b64 = await RNFS.readFile(pathToRead, 'base64');
  const bytes = base64ToBytes(b64);
  if (bytes.length > BACKUP_MAX_IMPORT_BYTES) {
    await cleanupPath(localPath);
    throw new Error('Backup is too large to import safely');
  }
  if (bytes.length === 0) {
    await cleanupPath(localPath);
    throw new Error('Backup file is empty');
  }
  return { bytes, localPath };
}

function decodePayloadFromBytes(bytes: Uint8Array): BackupPayloadV1 {
  if (looksLikeZip(bytes)) {
    return zipBytesToPayload(bytes);
  }
  let text: string;
  try {
    text = bytesToUtf8(bytes);
  } catch {
    throw new Error('Could not read backup file as text or ZIP');
  }
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new Error('Backup is not valid JSON or ZIP');
  }
  const parsed = parseBackupPayload(obj);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.payload;
}

async function applySettings(
  settings: BackupSettingsV1 | undefined,
  mode: BackupImportMode,
): Promise<{ applied: boolean; themeMode: 'light' | 'dark' | null }> {
  if (!settings) return { applied: false, themeMode: null };
  let themeMode: 'light' | 'dark' | null = null;
  if (settings.themeMode === 'light' || settings.themeMode === 'dark') {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, settings.themeMode);
    themeMode = settings.themeMode;
  }
  if (settings.onboardingComplete === true) {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  }
  if (settings.modelSettings && typeof settings.modelSettings === 'object') {
    await importModelSettingsMap(settings.modelSettings, mode);
  }
  return { applied: true, themeMode };
}

export async function importBackup(opts: {
  mode: BackupImportMode;
  downloadModels?: boolean;
  onProgress?: (p: ImportProgress) => void;
  shouldCancelDownloads?: () => boolean;
}): Promise<ImportBackupResult> {
  const warnings: string[] = [];
  opts.onProgress?.({ stage: 'reading' });
  let localPath: string | null = null;

  try {
    const loaded = await loadImportBytes();
    localPath = loaded.localPath;
    const payload = decodePayloadFromBytes(loaded.bytes);

    opts.onProgress?.({ stage: 'applying' });

    const mode = opts.mode;
    let chatsImported = 0;
    let personasImported = 0;
    let perspectivePresetsImported = 0;
    let tasksImported = 0;
    let taskRunsImported = 0;
    let settingsApplied = false;
    let themeMode: 'light' | 'dark' | null = null;

    if (payload.chats && (mode === 'replace' || payload.chats.length > 0)) {
      chatsImported = await chatHistoryService.importChats(payload.chats, mode);
      for (const chat of payload.chats) {
        if (chat.isPerspective && chat.perspectivePresetSnapshot) {
          const meta: PerspectiveChatMeta = {
            presetId: chat.perspectivePresetId,
            presetSnapshot: chat.perspectivePresetSnapshot as PerspectiveChatMeta['presetSnapshot'],
          };
          await setPerspectiveChatMeta(chat.id, meta);
        }
      }
    } else if (payload.kind === 'chats') {
      warnings.push('No conversations found in backup.');
    }

    if (payload.personas) {
      if (mode === 'replace') {
        await replaceAllPersonas(payload.personas);
      } else {
        await mergePersonasImport(payload.personas);
      }
      personasImported = payload.personas.length;
    }

    if (payload.perspectivePresets) {
      if (mode === 'replace') {
        await replaceAllPerspectivePresets(payload.perspectivePresets);
      } else {
        await mergePerspectivePresetsImport(payload.perspectivePresets);
      }
      perspectivePresetsImported = payload.perspectivePresets.length;
    }

    if (payload.tasks) {
      if (mode === 'replace') {
        await replaceAllTasks(payload.tasks);
      } else {
        await mergeTasksImport(payload.tasks);
      }
      tasksImported = payload.tasks.length;
    }

    if (payload.taskRuns) {
      if (mode === 'replace') {
        await replaceAllTaskRuns(payload.taskRuns);
      } else {
        await mergeTaskRunsImport(payload.taskRuns);
      }
      taskRunsImported = payload.taskRuns.length;
    }

    if (payload.settings) {
      const s = await applySettings(payload.settings, mode);
      settingsApplied = s.applied;
      themeMode = s.themeMode;
    }

    if (payload.kind === 'full' && payload.usageLog != null) {
      if (mode === 'replace') {
        await writeUsageLog(payload.usageLog);
      } else {
        const current = (await readUsageLog()) ?? [];
        await writeUsageLog([...current, ...(payload.usageLog ?? [])]);
      }
    }

    const models = payload.models ?? [];
    const modelsWithoutUrl = models
      .filter((m) => !isHttpDownloadUrl(m.downloadUrl ?? undefined))
      .map((m) => m.fileName);

    if (models.length > 0) {
      if (mode === 'replace') {
        await replaceModelCatalogFromBackup(models);
      } else {
        await mergeModelCatalogFromBackup(models);
      }
      for (const m of models) {
        if (isSafeRestoreDownloadUrl(m.downloadUrl ?? undefined)) {
          await registerModelSource({
            fileName: m.fileName,
            downloadUrl: m.downloadUrl as string,
            expectedBytes: m.expectedBytes,
            repoId: m.repoId,
          });
        }
      }
    }

    if (modelsWithoutUrl.length > 0) {
      warnings.push(
        `${modelsWithoutUrl.length} model(s) have no saved download URL and must be added manually: ${modelsWithoutUrl.slice(0, 3).join(', ')}${modelsWithoutUrl.length > 3 ? '…' : ''}`,
      );
    }

    let queueResult: ModelQueueResult | null = null;
    const shouldDownload =
      opts.downloadModels !== false &&
      (payload.kind === 'full' || models.length > 0);
    if (shouldDownload) {
      const queued = toQueuedDownloads(models);
      if (queued.length > 0) {
        queueResult = await runModelDownloadQueue(queued, {
          onProgress: (p) => opts.onProgress?.({ stage: 'models', progress: p }),
          shouldCancel: opts.shouldCancelDownloads,
        });
        if (queueResult.failed.length > 0) {
          warnings.push(
            `${queueResult.failed.length} model download(s) failed. You can retry from Models.`,
          );
        }
      }
    }

    opts.onProgress?.({ stage: 'done' });

    return {
      kind: payload.kind,
      mode,
      chatsImported,
      personasImported,
      perspectivePresetsImported,
      tasksImported,
      taskRunsImported,
      settingsApplied,
      themeMode,
      models: queueResult,
      modelsWithoutUrl,
      warnings,
    };
  } catch (err) {
    if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) {
      throw new Error('IMPORT_CANCELLED');
    }
    throw err;
  } finally {
    await cleanupPath(localPath);
  }
}

export function formatImportSummary(result: ImportBackupResult): string {
  const lines: string[] = [];
  lines.push(
    result.mode === 'replace'
      ? 'Restored from backup (replace).'
      : 'Merged backup into existing data.',
  );
  if (result.chatsImported > 0) {
    lines.push(
      `${result.chatsImported} conversation${result.chatsImported === 1 ? '' : 's'}.`,
    );
  }
  if (result.personasImported > 0) {
    lines.push(
      `${result.personasImported} persona${result.personasImported === 1 ? '' : 's'}.`,
    );
  }
  if (result.perspectivePresetsImported > 0) {
    lines.push(
      `${result.perspectivePresetsImported} perspective preset${result.perspectivePresetsImported === 1 ? '' : 's'}.`,
    );
  }
  if (result.tasksImported > 0) {
    lines.push(
      `${result.tasksImported} task${result.tasksImported === 1 ? '' : 's'}.`,
    );
  }
  if (result.taskRunsImported > 0) {
    lines.push(
      `${result.taskRunsImported} task run${result.taskRunsImported === 1 ? '' : 's'}.`,
    );
  }
  if (result.settingsApplied) {
    lines.push('Settings restored.');
  }
  if (result.models) {
    const { completed, skipped, failed } = result.models;
    if (completed.length) lines.push(`${completed.length} model(s) downloaded.`);
    if (skipped.length) lines.push(`${skipped.length} model(s) already on device.`);
    if (failed.length) lines.push(`${failed.length} model download(s) failed.`);
  }
  if (result.warnings.length) {
    lines.push(...result.warnings);
  }
  if (
    result.chatsImported === 0 &&
    result.personasImported === 0 &&
    result.perspectivePresetsImported === 0 &&
    result.tasksImported === 0 &&
    !result.settingsApplied
  ) {
    lines.push('Nothing new was applied.');
  }
  return lines.join('\n');
}
