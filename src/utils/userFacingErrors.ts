/**
 * Calm, user-facing copy for model load / download failures.
 * Raw native / JNI / stack dumps stay in logs via formatLoadError — never in alerts.
 */

import { formatLoadError } from '../services/inferencePerfParams';

export type UserFacingErrorKind =
  | 'oom'
  | 'corrupt'
  | 'auth'
  | 'disk'
  | 'not_found'
  | 'network'
  | 'cancelled'
  | 'generic_load'
  | 'generic_download';

export type UserFacingError = {
  kind: UserFacingErrorKind;
  title: string;
  message: string;
};

const COPY: Record<Exclude<UserFacingErrorKind, 'cancelled'>, UserFacingError> = {
  oom: {
    kind: 'oom',
    title: 'Not enough memory',
    message:
      'This model needs more RAM than your phone can spare. Try a smaller GGUF, or lower context size in Model Settings.',
  },
  corrupt: {
    kind: 'corrupt',
    title: "Couldn't open model",
    message:
      'The file may be incomplete or damaged. Delete it and download again, or pick another model.',
  },
  auth: {
    kind: 'auth',
    title: 'Access required',
    message:
      'This model is gated on Hugging Face. Add a token with access from Models → HF token, then try again.',
  },
  disk: {
    kind: 'disk',
    title: 'Storage full',
    message: 'There is not enough free space on this device. Free up storage, then try again.',
  },
  not_found: {
    kind: 'not_found',
    title: 'Model not found',
    message: 'That model or file could not be found. Check the name or URL and try again.',
  },
  network: {
    kind: 'network',
    title: 'Connection problem',
    message: 'The download could not finish. Check your connection and try again.',
  },
  generic_load: {
    kind: 'generic_load',
    title: "Couldn't load model",
    message: 'Something went wrong while loading. Try again, or choose a smaller model.',
  },
  generic_download: {
    kind: 'generic_download',
    title: 'Download failed',
    message: "Couldn't finish downloading. Check your connection and try again.",
  },
};

/** Strip stacks / JNI noise if a raw string ever leaks toward the UI. */
export function sanitizeErrorText(raw: string, maxLen = 220): string {
  let s = (raw || '').trim();
  if (!s) return '';

  // Drop common stack / bridge dumps.
  s = s
    .replace(/\n\s*at\s+.+$/gm, '')
    .replace(/nativeStackAndroid[\s\S]*$/i, '')
    .replace(/com\.facebook\.react\.[\w.$]+/gi, '')
    .replace(/java\.lang\.[\w.$]+/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (s.length > maxLen) {
    s = `${s.slice(0, maxLen - 1).trim()}…`;
  }
  return s;
}

function rawErrorText(err: unknown, hint?: string | null): string {
  const parts: string[] = [];
  if (hint) parts.push(hint);
  if (err != null) parts.push(formatLoadError(err));
  return sanitizeErrorText(parts.filter(Boolean).join(' | ')).toLowerCase();
}

export function isDownloadCancelled(err: unknown): boolean {
  if (!err) return false;
  const msg = formatLoadError(err).toLowerCase();
  return (
    msg.includes('download was cancelled') ||
    msg.includes('cancelled by user') ||
    msg.includes('download was paused')
  );
}

export function classifyLoadError(
  err: unknown,
  statusError?: string | null,
): UserFacingErrorKind {
  const t = rawErrorText(err, statusError);
  if (!t) return 'generic_load';

  if (
    /\b(oom|out of memory|cannot allocate|failed to allocate|not enough memory|too large for the android emulator)\b/.test(
      t,
    ) ||
    t.includes('enomem')
  ) {
    return 'oom';
  }
  if (
    /\b(corrupt|incomplete|damaged|invalid gguf|magic|chat formatting failed|failed to open|truncate)\b/.test(
      t,
    )
  ) {
    return 'corrupt';
  }
  if (
    /\b(permission|access denied|eacces|eperm)\b/.test(t) &&
    !/\b(401|403|unauthorized|authentication|gated)\b/.test(t)
  ) {
    // File permission quirks — treat as corrupt/open failure for load path.
    return 'corrupt';
  }
  if (/\b(enospc|no space|disk full|storage full|not enough.*(space|storage))\b/.test(t)) {
    return 'disk';
  }
  if (/\b(401|403|unauthorized|authentication|gated|access denied)\b/.test(t)) {
    return 'auth';
  }
  if (/\b(404|not found|no such file|does not exist)\b/.test(t)) {
    return 'not_found';
  }
  return 'generic_load';
}

export function classifyDownloadError(err: unknown): UserFacingErrorKind {
  if (isDownloadCancelled(err)) return 'cancelled';

  const t = rawErrorText(err);
  if (!t) return 'generic_download';

  if (/\b(401|403|unauthorized|authentication|gated|access denied)\b/.test(t)) {
    return 'auth';
  }
  if (/\b(enospc|no space|disk full|storage full|not enough.*(space|storage))\b/.test(t)) {
    return 'disk';
  }
  if (/\b(404|not found)\b/.test(t) || /status code:\s*404/.test(t)) {
    return 'not_found';
  }
  if (
    /\b(network|timeout|timed out|econnreset|enotfound|econnrefused|unreachable|offline|socket)\b/.test(
      t,
    ) ||
    /status code:\s*5\d\d/.test(t)
  ) {
    return 'network';
  }
  if (t.includes('not enough memory') || /\b(oom|out of memory)\b/.test(t)) {
    return 'oom';
  }
  if (
    t.includes("couldn't open model") ||
    t.includes('could not open model') ||
    /\b(corrupt|incomplete|damaged|size mismatch)\b/.test(t)
  ) {
    return 'corrupt';
  }
  return 'generic_download';
}

export function toUserFacingLoadError(
  err?: unknown,
  statusError?: string | null,
): UserFacingError {
  const kind = classifyLoadError(err, statusError);
  return { ...COPY[kind === 'cancelled' ? 'generic_load' : kind] };
}

export function toUserFacingDownloadError(err: unknown): UserFacingError | null {
  const kind = classifyDownloadError(err);
  if (kind === 'cancelled') return null;
  return { ...COPY[kind] };
}

/** HF API / listing helpers (status codes without a thrown Error). */
export function userFacingHttpError(status: number): UserFacingError {
  if (status === 401 || status === 403) return { ...COPY.auth };
  if (status === 404) return { ...COPY.not_found };
  if (status >= 500) return { ...COPY.network };
  return { ...COPY.generic_download };
}
