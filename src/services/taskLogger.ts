/**
 * Modular in-memory / persistent logger for scheduled task execution.
 * Captures milestone traces with timestamps, levels, and diagnostic details.
 */

export type TaskLogLevel = 'info' | 'warn' | 'error' | 'success';

export interface TaskRunLogEntry {
  timestamp: number;
  level: TaskLogLevel;
  message: string;
  details?: string;
}

export interface TaskLogger {
  entries: TaskRunLogEntry[];
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
  success(message: string, details?: unknown): void;
  getEntries(): TaskRunLogEntry[];
}

function stringifyDetails(details?: unknown): string | undefined {
  if (details === undefined || details === null) return undefined;
  if (typeof details === 'string') return details;
  if (details instanceof Error) {
    // Prefer stack; when native bridges only say "Unknown error", keep message
    // but surface any extra enumerable fields via JSON.
    const stack = details.stack?.trim();
    if (stack && !/^Error: Unknown error$/i.test(stack.split('\n')[0] || '')) {
      return stack;
    }
    try {
      const own = Object.getOwnPropertyNames(details).filter((k) => k !== 'stack');
      if (own.length > 0) {
        const dumped: Record<string, unknown> = {};
        for (const k of own) {
          dumped[k] = (details as unknown as Record<string, unknown>)[k];
        }
        const s = JSON.stringify(dumped, null, 2);
        if (s && s !== '{}' && s !== '{\n  "message": "Unknown error"\n}') {
          return `${details.message || 'Unknown error'}\n${s}`;
        }
      }
    } catch {
      /* fall through */
    }
    return stack || details.message;
  }
  try {
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

export function createTaskLogger(
  initialEntries: TaskRunLogEntry[] = [],
): TaskLogger {
  const entries: TaskRunLogEntry[] = [...initialEntries];

  const add = (level: TaskLogLevel, message: string, details?: unknown) => {
    const entry: TaskRunLogEntry = {
      timestamp: Date.now(),
      level,
      message: message.trim(),
      details: stringifyDetails(details),
    };
    entries.push(entry);
    if (__DEV__) {
      const tag = `[TaskLogger:${level.toUpperCase()}]`;
      if (level === 'error') {
        console.error(tag, message, details);
      } else if (level === 'warn') {
        console.warn(tag, message, details);
      } else {
        console.log(tag, message, details ?? '');
      }
    }
  };

  return {
    entries,
    info: (msg, details) => add('info', msg, details),
    warn: (msg, details) => add('warn', msg, details),
    error: (msg, details) => add('error', msg, details),
    success: (msg, details) => add('success', msg, details),
    getEntries: () => [...entries],
  };
}

export function formatLogEntryTime(ms: number): string {
  try {
    const d = new Date(ms);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  } catch {
    return String(ms);
  }
}

export function formatLogsForClipboard(
  logs: TaskRunLogEntry[] | undefined,
): string {
  if (!logs || logs.length === 0) return 'No execution logs available.';
  return logs
    .map((e) => {
      const time = formatLogEntryTime(e.timestamp);
      const lvl = e.level.toUpperCase().padEnd(7, ' ');
      const main = `[${time}] ${lvl} ${e.message}`;
      return e.details ? `${main}\n  Details: ${e.details}` : main;
    })
    .join('\n');
}
