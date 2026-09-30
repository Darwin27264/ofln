/**
 * OFLN backup format (schema v1) — ChatGPT-style versioned JSON / ZIP.
 * Pure helpers for validation, merge, and attachment safety.
 */

import type { ChatConversation, Message } from '../services/chatHistoryService';
import { isChatConversation, trimChatsToMax } from '../services/chatHistoryHelpers';
import type { Persona } from '../services/personaService';
import type { ModelSettings } from '../services/modelSettingsService';
import {
  isPerspectivePreset,
  type PerspectivePreset,
} from '../services/perspectiveService';
import {
  isSourceMonitorTask,
  isTaskRun,
  type SourceMonitorTask,
  type TaskRun,
} from '../services/taskService';

/** Magic — distinguish OFLN backups from arbitrary JSON/ZIP. */
export const BACKUP_FORMAT = 'ofln-backup' as const;

/** Increment only for breaking changes. Importers accept ≤ CURRENT. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Refuse huge files that would OOM on mid-range phones. */
export const BACKUP_MAX_IMPORT_BYTES = 48 * 1024 * 1024; // 48 MB

export type BackupKind = 'chats' | 'full';

export type BackupImportMode = 'merge' | 'replace';

export type BackupModelEntry = {
  fileName: string;
  /** HF (or other) download URL when known — used to re-fetch on another device. */
  downloadUrl?: string | null;
  repoId?: string | null;
  expectedBytes?: number | null;
  /** Size of file on source device at export (for sort / preflight). */
  sizeBytes?: number | null;
  /** Optional SHA-256 digest for verified download integrity. */
  sha256?: string | null;
};

export type BackupManifestV1 = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  kind: BackupKind;
  exportedAt: number;
  appVersion: string;
  /** Present in zip full backups. */
  files?: string[];
};

export type BackupSettingsV1 = {
  themeMode?: 'light' | 'dark' | null;
  onboardingComplete?: boolean | null;
  /** Per-model inference settings keyed by file name. */
  modelSettings?: Record<string, Partial<ModelSettings>>;
};

export type BackupPayloadV1 = {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  kind: BackupKind;
  exportedAt: number;
  appVersion: string;
  chats?: ChatConversation[];
  personas?: Persona[];
  /** Perspective debate presets (optional; older backups omit). */
  perspectivePresets?: PerspectivePreset[];
  /** Source Monitor tasks (optional; older backups omit). */
  tasks?: SourceMonitorTask[];
  /** Recent task runs, capped on export (optional). */
  taskRuns?: TaskRun[];
  settings?: BackupSettingsV1;
  models?: BackupModelEntry[];
  /** Stages / performance log (opaque JSON array when valid). */
  usageLog?: unknown[] | null;
};

export function isPersona(value: unknown): value is Persona {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id.trim().length > 0 &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    typeof p.createdAt === 'number'
  );
}

export function isBackupModelEntry(value: unknown): value is BackupModelEntry {
  if (!value || typeof value !== 'object') return false;
  const m = value as Record<string, unknown>;
  return typeof m.fileName === 'string' && m.fileName.trim().length > 0;
}

/**
 * Strip device-local attachment URIs so imports don't point at missing files.
 * Text/thought content is preserved.
 */
export function sanitizeMessagesForBackup(messages: Message[]): Message[] {
  return messages.map((msg) => {
    if (!msg.attachments?.length) return msg;
    const { attachments: _drop, ...rest } = msg;
    return rest;
  });
}

export function sanitizeChatForBackup(chat: ChatConversation): ChatConversation {
  return {
    ...chat,
    messages: sanitizeMessagesForBackup(
      Array.isArray(chat.messages) ? chat.messages : [],
    ),
  };
}

/** Hosts that must never be fetched during restore (loopback, LAN, link-local, metadata). */
function isBlockedRestoreHost(host: string): boolean {
  if (
    !host ||
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.localhost') ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (/^\d+$/.test(host)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a > 255 || b > 255 || Number(ipv4[3]) > 255 || Number(ipv4[4]) > 255) {
      return true;
    }
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (
    host.includes(':') &&
    (host.startsWith('fe80:') || host.startsWith('fc') || host.startsWith('fd'))
  ) {
    return true;
  }
  return false;
}

export function isHttpDownloadUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * URLs allowed for auto-download during restore.
 * HTTPS only; no credentials; blocks common local/metadata hosts.
 */
export function isSafeRestoreDownloadUrl(
  url: string | null | undefined,
): boolean {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (isBlockedRestoreHost(host)) return false;
    // Path must look like a GGUF fetch (HF resolve or direct .gguf); not open-ended.
    const path = u.pathname.toLowerCase();
    if (!path.endsWith('.gguf') && !/\/resolve\//.test(path)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Safe basename for model entries in backups / restore. */
export function safeBackupModelFileName(
  fileName: string | null | undefined,
): string | null {
  const base = (fileName || '').replace(/^.*[/\\]/, '').trim();
  if (!base || base === '.' || base === '..') return null;
  if (base.includes('..') || base.includes('/') || base.includes('\\')) {
    return null;
  }
  if (base.length > 240) return null;
  const lower = base.toLowerCase();
  if (!lower.endsWith('.gguf')) return null;
  if (lower.endsWith('.partial') || lower.endsWith('.chunk')) return null;
  // Allow typical HF GGUF names (letters, digits, .-_())
  if (!/^[A-Za-z0-9][A-Za-z0-9._()\- ]*\.gguf$/i.test(base)) return null;
  return base;
}

/** Prefer smallest first so the device is usable sooner after restore. */
export function sortModelsSmallestFirst(
  models: BackupModelEntry[],
): BackupModelEntry[] {
  return [...models].sort((a, b) => {
    const sa =
      typeof a.expectedBytes === 'number' && a.expectedBytes > 0
        ? a.expectedBytes
        : typeof a.sizeBytes === 'number' && a.sizeBytes > 0
          ? a.sizeBytes
          : Number.MAX_SAFE_INTEGER;
    const sb =
      typeof b.expectedBytes === 'number' && b.expectedBytes > 0
        ? b.expectedBytes
        : typeof b.sizeBytes === 'number' && b.sizeBytes > 0
          ? b.sizeBytes
          : Number.MAX_SAFE_INTEGER;
    if (sa !== sb) return sa - sb;
    return a.fileName.localeCompare(b.fileName);
  });
}

/**
 * Merge imported chats into existing by id.
 * Import wins on id collision (restore is the source of truth for that chat).
 */
export function mergeChatsById(
  existing: ChatConversation[],
  incoming: ChatConversation[],
): ChatConversation[] {
  const map = new Map<string, ChatConversation>();
  for (const c of existing) {
    if (isChatConversation(c)) map.set(c.id, c);
  }
  for (const c of incoming) {
    if (isChatConversation(c)) {
      map.set(c.id, sanitizeChatForBackup(c));
    }
  }
  return trimChatsToMax(
    [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt),
  );
}

export function mergePersonasById(
  existing: Persona[],
  incoming: Persona[],
): Persona[] {
  const map = new Map<string, Persona>();
  for (const p of existing) {
    if (isPersona(p)) map.set(p.id, p);
  }
  for (const p of incoming) {
    if (isPersona(p)) map.set(p.id, p);
  }
  return [...map.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export type ParseBackupResult =
  | { ok: true; payload: BackupPayloadV1 }
  | { ok: false; error: string };

/**
 * Validate a decoded backup object (single JSON chats or full payload).
 * Accepts schemaVersion 1 only for now; unknown higher → clear error.
 * Extra fields are ignored (forward-compatible readers).
 */
export function parseBackupPayload(raw: unknown): ParseBackupResult {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Backup is not a valid object' };
  }
  const o = raw as Record<string, unknown>;

  if (o.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'Not an OFLN backup (missing or unknown format marker)',
    };
  }

  const schemaVersion = Number(o.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion < 1) {
    return { ok: false, error: 'Invalid or missing schemaVersion' };
  }
  if (schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `This backup uses schema v${schemaVersion}, but the app supports up to v${BACKUP_SCHEMA_VERSION}. Update OFLN to import it.`,
    };
  }

  const kind = o.kind;
  if (kind !== 'chats' && kind !== 'full') {
    return { ok: false, error: 'Unknown backup kind (expected chats or full)' };
  }

  const exportedAt =
    typeof o.exportedAt === 'number' && Number.isFinite(o.exportedAt)
      ? o.exportedAt
      : Date.now();
  const appVersion =
    typeof o.appVersion === 'string' && o.appVersion.trim()
      ? o.appVersion
      : 'unknown';

  const chatsIncluded = Array.isArray(o.chats);
  const chatsRaw = chatsIncluded ? o.chats : [];
  const chats = chatsRaw
    .filter(isChatConversation)
    .map((c) => sanitizeChatForBackup(c));

  if (kind === 'chats' && (!chatsIncluded || (chats.length === 0 && chatsRaw.length > 0))) {
    return {
      ok: false,
      error: 'Chat backup contained no valid conversations',
    };
  }

  const personas = Array.isArray(o.personas)
    ? o.personas.filter(isPersona)
    : undefined;

  const perspectivePresets = Array.isArray(o.perspectivePresets)
    ? o.perspectivePresets.filter(isPerspectivePreset)
    : undefined;

  const tasks = Array.isArray(o.tasks)
    ? o.tasks.filter(isSourceMonitorTask)
    : undefined;

  const taskRuns = Array.isArray(o.taskRuns)
    ? o.taskRuns.filter(isTaskRun).slice(0, 200)
    : undefined;

  let settings: BackupSettingsV1 | undefined;
  if (o.settings && typeof o.settings === 'object') {
    const s = o.settings as Record<string, unknown>;
    const themeMode =
      s.themeMode === 'light' || s.themeMode === 'dark' ? s.themeMode : null;
    const modelSettings =
      s.modelSettings && typeof s.modelSettings === 'object'
        ? (s.modelSettings as Record<string, Partial<ModelSettings>>)
        : undefined;
    settings = {
      themeMode,
      onboardingComplete:
        typeof s.onboardingComplete === 'boolean'
          ? s.onboardingComplete
          : null,
      modelSettings,
    };
  }

  const models = Array.isArray(o.models)
    ? o.models
        .filter(isBackupModelEntry)
        .map((m) => {
          const fileName = safeBackupModelFileName(m.fileName);
          if (!fileName) return null;
          const downloadUrl =
            typeof m.downloadUrl === 'string' ? m.downloadUrl.trim() : null;
          return {
            fileName,
            downloadUrl: isSafeRestoreDownloadUrl(downloadUrl)
              ? downloadUrl
              : isHttpDownloadUrl(downloadUrl)
                ? null // keep name, drop unsafe URL so we never auto-fetch it
                : null,
            repoId: typeof m.repoId === 'string' ? m.repoId.slice(0, 200) : null,
            expectedBytes:
              typeof m.expectedBytes === 'number' &&
              Number.isFinite(m.expectedBytes) &&
              m.expectedBytes > 0
                ? m.expectedBytes
                : null,
            sizeBytes:
              typeof m.sizeBytes === 'number' &&
              Number.isFinite(m.sizeBytes) &&
              m.sizeBytes > 0
                ? m.sizeBytes
                : null,
          };
        })
        .filter((m): m is NonNullable<typeof m> => m != null)
    : undefined;

  let usageLog: unknown[] | null | undefined;
  if (o.usageLog === null) usageLog = null;
  else if (Array.isArray(o.usageLog)) usageLog = o.usageLog;

  return {
    ok: true,
    payload: {
      format: BACKUP_FORMAT,
      schemaVersion,
      kind,
      exportedAt,
      appVersion,
      chats: chatsIncluded ? chats : undefined,
      personas,
      perspectivePresets,
      tasks,
      taskRuns,
      settings,
      models,
      usageLog,
    },
  };
}

/** Build stable export file names. */
export function buildBackupFileName(
  kind: BackupKind,
  at: Date = new Date(),
): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  return kind === 'chats'
    ? `ofln-chats-${stamp}.json`
    : `ofln-backup-${stamp}.zip`;
}
