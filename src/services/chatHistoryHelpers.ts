/**
 * Pure helpers for chat history (S12) — unit-testable without native SQLite.
 */

import type { ChatConversation, Message } from './chatHistoryService';

export const CHAT_HISTORY_KEY = '@chat_history';
/** Snapshot of AsyncStorage JSON taken once before SQLite migration. */
export const CHAT_HISTORY_ASYNC_BACKUP_KEY = '@chat_history_async_backup';
/** AsyncStorage flag: migration to SQLite finished (idempotent). */
export const CHAT_HISTORY_MIGRATED_KEY = '@chat_history_migrated_v1';
export const MAX_CHAT_HISTORY = 100;

export function isChatConversation(value: unknown): value is ChatConversation {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.title === 'string' &&
    typeof c.preview === 'string' &&
    Array.isArray(c.messages) &&
    typeof c.createdAt === 'number' &&
    typeof c.updatedAt === 'number'
  );
}

/** Parse AsyncStorage / backup JSON into valid chats (drops corrupt entries). */
export function parseChatHistoryJson(raw: string | null | undefined): ChatConversation[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatConversation).map((c) => ({
      ...c,
      pinned: Boolean(c.pinned),
      customTitle: c.customTitle || undefined,
      messages: Array.isArray(c.messages) ? (c.messages as Message[]) : [],
    }));
  } catch {
    return [];
  }
}

export function sortChatsForDisplay(chats: ChatConversation[]): ChatConversation[] {
  return [...chats].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.createdAt - a.createdAt;
  });
}

/** Keep newest MAX by createdAt (matches pre-SQLite splice behavior). */
export function trimChatsToMax(
  chats: ChatConversation[],
  max: number = MAX_CHAT_HISTORY,
): ChatConversation[] {
  if (chats.length <= max) return chats;
  const byCreated = [...chats].sort((a, b) => b.createdAt - a.createdAt);
  return byCreated.slice(0, max);
}

export function buildTitleAndPreview(messages: Message[]): {
  defaultTitle: string;
  preview: string;
} {
  const userMessages = messages.filter((m) => m.role === 'user');
  const assistantMessages = messages.filter((m) => m.role === 'assistant');
  return {
    defaultTitle: userMessages[0]?.content.slice(0, 50) || 'New Chat',
    preview: assistantMessages[0]?.content.slice(0, 100) || '',
  };
}

export type ChatRow = {
  id: string;
  title: string;
  preview: string;
  messages_json: string;
  created_at: number;
  updated_at: number;
  pinned: number;
  custom_title: string | null;
};

export function chatToRow(chat: ChatConversation): ChatRow {
  return {
    id: chat.id,
    title: chat.title,
    preview: chat.preview,
    messages_json: JSON.stringify(chat.messages ?? []),
    created_at: chat.createdAt,
    updated_at: chat.updatedAt,
    pinned: chat.pinned ? 1 : 0,
    custom_title: chat.customTitle ?? null,
  };
}

export function rowToChat(row: ChatRow): ChatConversation | null {
  try {
    const messages = JSON.parse(row.messages_json || '[]');
    if (!Array.isArray(messages)) return null;
    return {
      id: row.id,
      title: row.title,
      preview: row.preview ?? '',
      messages,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      pinned: row.pinned === 1,
      customTitle: row.custom_title || undefined,
    };
  } catch {
    return null;
  }
}

/** Trim + collapse whitespace; empty → no filter. */
export function normalizeChatSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Escape `%` / `_` / `\` for SQLite LIKE. */
export function escapeSqlLikePattern(raw: string): string {
  return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

/**
 * Match title, custom title, preview, and message content (snippets).
 * Case-insensitive substring.
 */
export function chatMatchesSearchQuery(
  chat: ChatConversation,
  normalizedQuery: string,
): boolean {
  if (!normalizedQuery) return true;
  const haystacks: string[] = [
    chat.title ?? '',
    chat.customTitle ?? '',
    chat.preview ?? '',
  ];
  for (const m of chat.messages ?? []) {
    if (m.content) haystacks.push(m.content);
    if (m.thought) haystacks.push(m.thought);
  }
  return haystacks.some((h) => h.toLowerCase().includes(normalizedQuery));
}

export function filterChatsBySearchQuery(
  chats: ChatConversation[],
  query: string,
): ChatConversation[] {
  const q = normalizeChatSearchQuery(query);
  if (!q) return chats;
  return chats.filter((c) => chatMatchesSearchQuery(c, q));
}

/** Common chat/history period filters (Photos / Files / messaging apps). */
export type HistoryDatePeriod =
  | 'all'
  | 'today'
  | 'yesterday'
  | 'last7'
  | 'last30'
  | 'older';

export const HISTORY_DATE_PERIODS: ReadonlyArray<{
  id: HistoryDatePeriod;
  label: string;
}> = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'last7', label: 'Last 7 days' },
  { id: 'last30', label: 'Last 30 days' },
  { id: 'older', label: 'Older' },
];

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Match on last activity (`updatedAt`), falling back to `createdAt`. */
export function chatMatchesDatePeriod(
  chat: ChatConversation,
  period: HistoryDatePeriod,
  nowMs: number = Date.now(),
): boolean {
  if (period === 'all') return true;

  const ts = chat.updatedAt || chat.createdAt;
  const todayStart = startOfLocalDay(nowMs);
  const dayMs = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - dayMs;
  const last7Start = todayStart - 6 * dayMs;
  const last30Start = todayStart - 29 * dayMs;

  switch (period) {
    case 'today':
      return ts >= todayStart;
    case 'yesterday':
      return ts >= yesterdayStart && ts < todayStart;
    case 'last7':
      return ts >= last7Start;
    case 'last30':
      return ts >= last30Start;
    case 'older':
      return ts < last30Start;
    default:
      return true;
  }
}

export function filterChatsByDatePeriod(
  chats: ChatConversation[],
  period: HistoryDatePeriod,
  nowMs: number = Date.now(),
): ChatConversation[] {
  if (period === 'all') return chats;
  return chats.filter((c) => chatMatchesDatePeriod(c, period, nowMs));
}
