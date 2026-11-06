/**
 * Pure schedule helpers for Source Monitor tasks.
 * No AsyncStorage / RN — unit-testable.
 */

export type TaskCadence = 'daily' | 'weekly';

export type TaskSchedule = {
  cadence: TaskCadence;
  /** Local hour 0–23 */
  hour: number;
  /** Local minute 0–59 */
  minute: number;
  /**
   * For weekly: one or more days, 0 = Sunday … 6 = Saturday.
   * Sorted ascending, unique.
   */
  weekdays?: number[];
};

/** Legacy single-day field still accepted on read. */
type ScheduleInput = Partial<TaskSchedule> & { weekday?: number };

export function clampHour(hour: number): number {
  if (!Number.isFinite(hour)) return 9;
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

export function clampMinute(minute: number): number {
  if (!Number.isFinite(minute)) return 0;
  return Math.min(59, Math.max(0, Math.floor(minute)));
}

export function clampWeekday(weekday: number | undefined): number {
  if (weekday == null || !Number.isFinite(weekday)) return 1;
  return Math.min(6, Math.max(0, Math.floor(weekday)));
}

/** Normalize to a unique sorted list of weekdays; default Monday. */
export function normalizeWeekdays(
  weekdays: number[] | undefined,
  legacyWeekday?: number,
): number[] {
  const raw =
    Array.isArray(weekdays) && weekdays.length > 0
      ? weekdays
      : legacyWeekday != null
        ? [legacyWeekday]
        : [1];
  const set = new Set<number>();
  for (const w of raw) {
    if (Number.isFinite(w)) set.add(clampWeekday(w));
  }
  if (set.size === 0) set.add(1);
  return [...set].sort((a, b) => a - b);
}

export function normalizeSchedule(
  input: ScheduleInput | null | undefined,
): TaskSchedule {
  const cadence: TaskCadence = input?.cadence === 'weekly' ? 'weekly' : 'daily';
  return {
    cadence,
    hour: clampHour(input?.hour ?? 9),
    minute: clampMinute(input?.minute ?? 0),
    weekdays:
      cadence === 'weekly'
        ? normalizeWeekdays(input?.weekdays, input?.weekday)
        : undefined,
  };
}

function atLocalTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setSeconds(0, 0);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/**
 * Next run timestamp (ms) at or after `fromMs` for the given local schedule.
 * If `fromMs` lands exactly on a slot, returns that slot; otherwise the next one.
 */
export function computeNextRunAt(
  schedule: TaskSchedule,
  fromMs: number = Date.now(),
): number {
  const s = normalizeSchedule(schedule);
  const from = new Date(fromMs);

  if (s.cadence === 'daily') {
    let candidate = atLocalTime(from, s.hour, s.minute);
    if (candidate.getTime() < fromMs) {
      candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
    }
    return candidate.getTime();
  }

  const targets = new Set(normalizeWeekdays(s.weekdays));
  const day = new Date(from);
  for (let i = 0; i < 8; i++) {
    const candidate = atLocalTime(day, s.hour, s.minute);
    if (targets.has(candidate.getDay()) && candidate.getTime() >= fromMs) {
      return candidate.getTime();
    }
    day.setDate(day.getDate() + 1);
  }
  // Fallback: one week ahead on the first selected day
  const fallback = atLocalTime(from, s.hour, s.minute);
  fallback.setDate(fallback.getDate() + 7);
  return fallback.getTime();
}

/** After a completed run, schedule the next occurrence strictly after `afterMs`. */
export function computeNextRunAfter(
  schedule: TaskSchedule,
  afterMs: number = Date.now(),
): number {
  return computeNextRunAt(schedule, afterMs + 1000);
}

const WEEKDAY_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatScheduleSummary(schedule: TaskSchedule): string {
  const s = normalizeSchedule(schedule);
  const hh = String(s.hour).padStart(2, '0');
  const mm = String(s.minute).padStart(2, '0');
  const time = `${hh}:${mm}`;
  if (s.cadence === 'weekly') {
    const days = normalizeWeekdays(s.weekdays);
    if (days.length === 7) {
      return `Every day at ${time}`;
    }
    if (days.length === 1) {
      return `Every ${WEEKDAY_LABELS[days[0]]} at ${time}`;
    }
    const labels = days.map((d) => WEEKDAY_SHORT[d]);
    if (labels.length === 2) {
      return `Every ${labels[0]} & ${labels[1]} at ${time}`;
    }
    return `Every ${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]} at ${time}`;
  }
  return `Every day at ${time}`;
}

export function formatNextRun(nextRunAt: number, nowMs: number = Date.now()): string {
  if (!Number.isFinite(nextRunAt) || nextRunAt <= 0) return 'Not scheduled';
  const diff = nextRunAt - nowMs;
  if (diff <= 0) return 'Due now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 14) return `in ${days}d`;
  try {
    return new Date(nextRunAt).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date(nextRunAt).toISOString();
  }
}

/**
 * Hermes-safe parsed http(s) URL.
 * Avoids reading `URL.protocol` / credential fields — unimplemented or unreliable on Hermes.
 */
export type SafeHttpUrl = {
  href: string;
  protocol: 'http:' | 'https:';
  hostname: string;
  toString(): string;
};

/**
 * Parse and validate an http(s) URL without relying on Hermes `URL.protocol`.
 * Rejects non-http schemes and URLs with embedded credentials.
 */
export function assertSafeHttpUrl(url: string): SafeHttpUrl {
  const trimmed = (url || '').trim();
  if (!trimmed || /\s/.test(trimmed)) {
    throw new Error('Invalid URL');
  }

  const schemeMatch = trimmed.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):(?:\/\/)?/);
  if (!schemeMatch) {
    throw new Error('Invalid URL');
  }
  const scheme = schemeMatch[1].toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    throw new Error('Only http(s) URLs are supported');
  }
  if (!trimmed.toLowerCase().startsWith(`${scheme}://`)) {
    throw new Error('Invalid URL');
  }

  // userinfo@host — reject credentials (Hermes URL.username/password may be unavailable)
  const afterScheme = trimmed.slice(scheme.length + 3); // after "http://" or "https://"
  const authorityEnd = afterScheme.search(/[/?#]/);
  const authority = authorityEnd === -1 ? afterScheme : afterScheme.slice(0, authorityEnd);
  if (!authority) {
    throw new Error('Invalid URL');
  }
  if (authority.includes('@')) {
    throw new Error('URLs with credentials are not allowed');
  }

  // Host: IPv6 in brackets, or hostname / IPv4; optional :port
  const hostPortMatch = authority.match(
    /^(?:\[([0-9a-fA-F:.]+)\]|([a-zA-Z0-9](?:[a-zA-Z0-9\-._~%]*[a-zA-Z0-9])?))(?::(\d{1,5}))?$/,
  );
  if (!hostPortMatch) {
    throw new Error('Invalid URL');
  }
  const hostname = (hostPortMatch[1] || hostPortMatch[2] || '').trim();
  if (!hostname) {
    throw new Error('Invalid URL');
  }
  if (hostPortMatch[3]) {
    const port = Number(hostPortMatch[3]);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('Invalid URL');
    }
  }

  const protocol: 'http:' | 'https:' = scheme === 'https' ? 'https:' : 'http:';
  return {
    href: trimmed,
    protocol,
    hostname,
    toString() {
      return trimmed;
    },
  };
}

export function isValidHttpUrl(url: string): boolean {
  try {
    assertSafeHttpUrl(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rewrite known homepage URLs to their canonical RSS/Atom feeds.
 * HN homepage HTML is noisy and burns context; /rss is what Morning Brief wants.
 */
export function preferSourceFeedUrl(url: string): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return trimmed;
  const m = trimmed.match(/^(https?):\/\/([^\/?#]+)(\/[^?#]*)?/i);
  if (!m) return trimmed;
  const host = m[2].toLowerCase().replace(/^www\./, '');
  const pathNorm = (m[3] || '/').replace(/\/+$/, '') || '/';
  if (host === 'news.ycombinator.com' && pathNorm === '/') {
    return 'https://news.ycombinator.com/rss';
  }
  return trimmed;
}
