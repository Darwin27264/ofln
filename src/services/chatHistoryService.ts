/**
 * Chat history service — SQLite via op-sqlite, same public API.
 * One-time migrate from AsyncStorage `@chat_history` with backup key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { open, type DB } from '@op-engineering/op-sqlite';
import {
  CHAT_HISTORY_ASYNC_BACKUP_KEY,
  CHAT_HISTORY_KEY,
  CHAT_HISTORY_MIGRATED_KEY,
  MAX_CHAT_HISTORY,
  buildTitleAndPreview,
  chatToRow,
  isChatConversation,
  parseChatHistoryJson,
  rowToChat,
  sortChatsForDisplay,
  trimChatsToMax,
  filterChatsBySearchQuery,
  normalizeChatSearchQuery,
  escapeSqlLikePattern,
  type ChatRow,
} from './chatHistoryHelpers';
import { sanitizeChatForBackup } from '../utils/backupSchema';
import type { PerspectivePresetSnapshot } from './perspectiveService';

export interface MessageAttachment {
  type: 'image' | 'pdf';
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mimeType?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  thought?: string;
  showThought?: boolean;
  tokensPerSecond?: number;
  attachments?: MessageAttachment[];
  /** Persona stamped when this assistant reply was generated. */
  personaId?: string;
  personaName?: string;
  personaTagline?: string;
  personaAvatar?: string;
  personaAvatarUri?: string;
  /** Perspective debate seat attribution (optional). */
  perspectiveSeatId?: string;
  perspectiveSeatLabel?: string;
  perspectiveModelFileName?: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  preview: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  customTitle?: string;
  /** True when this chat was started as a Perspective debate. */
  isPerspective?: boolean;
  perspectivePresetId?: string;
  perspectivePresetSnapshot?: PerspectivePresetSnapshot;
}

const DB_NAME = 'ofln_chats.sqlite';

class ChatHistoryService {
  private initialized = false;
  private db: DB | null = null;
  /** sqlite when native linked; async = AsyncStorage fallback until rebuild. */
  private backend: 'sqlite' | 'async' = 'async';

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const db = open({ name: DB_NAME });
      await db.execute('PRAGMA journal_mode = WAL;');
      await db.execute(`
        CREATE TABLE IF NOT EXISTS chats (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          preview TEXT NOT NULL DEFAULT '',
          messages_json TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          pinned INTEGER NOT NULL DEFAULT 0,
          custom_title TEXT
        );
      `);
      await db.execute(
        'CREATE INDEX IF NOT EXISTS idx_chats_created_at ON chats(created_at DESC);',
      );
      this.db = db;
      this.backend = 'sqlite';
      await this.migrateFromAsyncStorageIfNeeded();
    } catch (error) {
      console.warn(
        'Chat history SQLite unavailable — using AsyncStorage until native rebuild',
        error,
      );
      this.db = null;
      this.backend = 'async';
      try {
        const history = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
        if (!history) {
          await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([]));
        }
      } catch (e) {
        console.error('Error initializing AsyncStorage chat history:', e);
      }
    }

    this.initialized = true;
  }

  /**
   * Migrate once: backup `@chat_history` → `@chat_history_async_backup`, insert rows, set flag.
   * Idempotent — skips when `CHAT_HISTORY_MIGRATED_KEY` is set or DB already has rows + flag.
   */
  private async migrateFromAsyncStorageIfNeeded(): Promise<void> {
    if (!this.db) return;

    try {
      const migrated = await AsyncStorage.getItem(CHAT_HISTORY_MIGRATED_KEY);
      if (migrated === 'true' || migrated === '1') return;

      const raw = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
      const chats = trimChatsToMax(parseChatHistoryJson(raw));

      // Always snapshot current AsyncStorage payload (even empty) before switching.
      await AsyncStorage.setItem(
        CHAT_HISTORY_ASYNC_BACKUP_KEY,
        raw ?? JSON.stringify([]),
      );

      if (chats.length > 0) {
        const db = this.db;
        await db.transaction(async (tx) => {
          for (const chat of chats) {
            const row = chatToRow(chat);
            await tx.execute(
              `INSERT OR REPLACE INTO chats
                (id, title, preview, messages_json, created_at, updated_at, pinned, custom_title)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
              [
                row.id,
                row.title,
                row.preview,
                row.messages_json,
                row.created_at,
                row.updated_at,
                row.pinned,
                row.custom_title,
              ],
            );
          }
        });
      }

      await AsyncStorage.setItem(CHAT_HISTORY_MIGRATED_KEY, 'true');
    } catch (error) {
      console.error('Chat history migration failed — will retry next launch', error);
      // Leave migrated flag unset so we retry; SQLite may be partially filled (OR REPLACE is ok).
    }
  }

  private async enforceMaxChats(): Promise<void> {
    if (!this.db) return;
    const { rows } = await this.db.execute('SELECT COUNT(*) AS c FROM chats;');
    const count = Number(rows?.[0]?.c ?? 0);
    if (!(count > MAX_CHAT_HISTORY)) return;
    const excess = count - MAX_CHAT_HISTORY;
    await this.db.execute(
      `DELETE FROM chats WHERE id IN (
         SELECT id FROM chats ORDER BY created_at ASC LIMIT ?
       );`,
      [excess],
    );
  }

  async saveChat(messages: Message[], chatId?: string | null): Promise<string> {
    await this.initialize();

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Invalid messages array provided to saveChat');
    }

    if (this.backend === 'async') {
      return this.saveChatAsync(messages, chatId);
    }

    const db = this.db!;
    const { defaultTitle, preview } = buildTitleAndPreview(messages);
    const now = Date.now();

    try {
      if (chatId) {
        const { rows } = await db.execute(
          'SELECT * FROM chats WHERE id = ? LIMIT 1;',
          [chatId],
        );
        const existing = rows?.[0] ? rowToChat(rows[0] as ChatRow) : null;

        if (existing) {
          const messagesChanged =
            existing.messages.length !== messages.length ||
            JSON.stringify(existing.messages) !== JSON.stringify(messages);
          const newUpdatedAt = messagesChanged ? now : existing.updatedAt;
          await db.execute(
            `UPDATE chats SET
              title = ?, preview = ?, messages_json = ?, updated_at = ?,
              pinned = ?, custom_title = ?
             WHERE id = ?;`,
            [
              existing.customTitle || defaultTitle,
              preview,
              JSON.stringify(messages),
              newUpdatedAt,
              existing.pinned ? 1 : 0,
              existing.customTitle ?? null,
              chatId,
            ],
          );
        } else {
          await db.execute(
            `INSERT INTO chats
              (id, title, preview, messages_json, created_at, updated_at, pinned, custom_title)
             VALUES (?, ?, ?, ?, ?, ?, 0, NULL);`,
            [chatId, defaultTitle, preview, JSON.stringify(messages), now, now],
          );
        }
      } else {
        chatId = `chat_${now}_${Math.random().toString(36).substr(2, 9)}`;
        await db.execute(
          `INSERT INTO chats
            (id, title, preview, messages_json, created_at, updated_at, pinned, custom_title)
           VALUES (?, ?, ?, ?, ?, ?, 0, NULL);`,
          [chatId, defaultTitle, preview, JSON.stringify(messages), now, now],
        );
      }

      await this.enforceMaxChats();
      return chatId;
    } catch (error) {
      console.error('Error saving chat:', error);
      throw error;
    }
  }

  async getChat(chatId: string): Promise<ChatConversation | null> {
    await this.initialize();
    if (this.backend === 'async') return this.getChatAsync(chatId);

    try {
      const { rows } = await this.db!.execute(
        'SELECT * FROM chats WHERE id = ? LIMIT 1;',
        [chatId],
      );
      if (!rows?.[0]) return null;
      return rowToChat(rows[0] as ChatRow);
    } catch (error) {
      console.error('Error getting chat:', error);
      return null;
    }
  }

  async deleteChat(chatId: string): Promise<boolean> {
    await this.initialize();
    if (this.backend === 'async') return this.deleteChatAsync(chatId);

    try {
      await this.db!.execute('DELETE FROM chats WHERE id = ?;', [chatId]);
      return true;
    } catch (error) {
      console.error('Error deleting chat:', error);
      return false;
    }
  }

  async deleteMultipleChats(chatIds: string[]): Promise<boolean> {
    await this.initialize();
    if (this.backend === 'async') return this.deleteMultipleChatsAsync(chatIds);
    if (!chatIds.length) return true;

    try {
      await this.db!.transaction(async (tx) => {
        for (const id of chatIds) {
          await tx.execute('DELETE FROM chats WHERE id = ?;', [id]);
        }
      });
      return true;
    } catch (error) {
      console.error('Error deleting multiple chats:', error);
      return false;
    }
  }

  async clearAllChats(): Promise<boolean> {
    await this.initialize();
    if (this.backend === 'async') return this.clearAllChatsAsync();

    try {
      await this.db!.execute('DELETE FROM chats;');
      return true;
    } catch (error) {
      console.error('Error clearing chat history:', error);
      return false;
    }
  }

  async renameChat(chatId: string, newTitle: string): Promise<boolean> {
    await this.initialize();
    if (this.backend === 'async') return this.renameChatAsync(chatId, newTitle);

    try {
      const trimmed = newTitle.trim();
      const { rows } = await this.db!.execute(
        'SELECT title FROM chats WHERE id = ? LIMIT 1;',
        [chatId],
      );
      if (!rows?.[0]) return false;
      const fallbackTitle = String(rows[0].title ?? 'New Chat');
      await this.db!.execute(
        'UPDATE chats SET custom_title = ?, title = ? WHERE id = ?;',
        [trimmed || null, trimmed || fallbackTitle, chatId],
      );
      return true;
    } catch (error) {
      console.error('Error renaming chat:', error);
      return false;
    }
  }

  async togglePinChat(chatId: string): Promise<boolean> {
    await this.initialize();
    if (this.backend === 'async') return this.togglePinChatAsync(chatId);

    try {
      const { rows } = await this.db!.execute(
        'SELECT pinned FROM chats WHERE id = ? LIMIT 1;',
        [chatId],
      );
      if (!rows?.[0]) return false;
      const next = rows[0].pinned === 1 ? 0 : 1;
      await this.db!.execute('UPDATE chats SET pinned = ? WHERE id = ?;', [
        next,
        chatId,
      ]);
      return true;
    } catch (error) {
      console.error('Error toggling pin chat:', error);
      return false;
    }
  }

  async getAllChats(): Promise<ChatConversation[]> {
    await this.initialize();
    if (this.backend === 'async') return this.getAllChatsAsync();

    try {
      const { rows } = await this.db!.execute(
        'SELECT * FROM chats ORDER BY created_at DESC;',
      );
      const chats: ChatConversation[] = [];
      for (const row of rows ?? []) {
        const chat = rowToChat(row as ChatRow);
        if (chat) chats.push(chat);
      }
      return sortChatsForDisplay(chats);
    } catch (error) {
      console.error('Error loading chat history:', error);
      return [];
    }
  }

  /**
   * Bulk import for backup restore.
   * mode replace = clear then insert; merge = upsert by id (import wins).
   * @returns number of chats written (not necessarily net gain on merge)
   */
  async importChats(
    chats: ChatConversation[],
    mode: 'merge' | 'replace' = 'merge',
  ): Promise<number> {
    await this.initialize();
    // Re-validate + strip attachment URIs even if caller already parsed (defense in depth).
    const valid = trimChatsToMax(
      chats
        .filter(isChatConversation)
        .map((c) => sanitizeChatForBackup(c)),
    );
    if (valid.length === 0) return 0;

    if (this.backend === 'async') {
      if (mode === 'replace') {
        await this.writeAsyncHistory(valid);
        return valid.length;
      }
      const existing = await this.readAsyncHistory();
      const map = new Map<string, ChatConversation>();
      for (const c of existing) map.set(c.id, c);
      for (const c of valid) map.set(c.id, c);
      const merged = trimChatsToMax(
        [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt),
      );
      await this.writeAsyncHistory(merged);
      return valid.length;
    }

    const db = this.db!;
    try {
      await db.transaction(async (tx) => {
        if (mode === 'replace') {
          await tx.execute('DELETE FROM chats;');
        }
        for (const chat of valid) {
          const row = chatToRow(chat);
          await tx.execute(
            `INSERT OR REPLACE INTO chats
              (id, title, preview, messages_json, created_at, updated_at, pinned, custom_title)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
            [
              row.id,
              row.title,
              row.preview,
              row.messages_json,
              row.created_at,
              row.updated_at,
              row.pinned,
              row.custom_title,
            ],
          );
        }
      });
      await this.enforceMaxChats();
      return valid.length;
    } catch (error) {
      console.error('Error importing chats:', error);
      throw error;
    }
  }

  /**
   * Search title / custom title / preview / message JSON.
   * Empty query → same as getAllChats. SQLite uses LIKE; AsyncStorage filters in JS.
   */
  async searchChats(query: string): Promise<ChatConversation[]> {
    await this.initialize();
    const normalized = normalizeChatSearchQuery(query);
    if (!normalized) return this.getAllChats();

    if (this.backend === 'async') {
      return sortChatsForDisplay(
        filterChatsBySearchQuery(await this.readAsyncHistory(), normalized),
      );
    }

    try {
      const pattern = `%${escapeSqlLikePattern(normalized)}%`;
      const { rows } = await this.db!.execute(
        `SELECT * FROM chats
         WHERE lower(title) LIKE lower(?) ESCAPE '\\'
            OR lower(COALESCE(custom_title, '')) LIKE lower(?) ESCAPE '\\'
            OR lower(preview) LIKE lower(?) ESCAPE '\\'
            OR lower(messages_json) LIKE lower(?) ESCAPE '\\'
         ORDER BY created_at DESC;`,
        [pattern, pattern, pattern, pattern],
      );
      const chats: ChatConversation[] = [];
      for (const row of rows ?? []) {
        const chat = rowToChat(row as ChatRow);
        if (chat) chats.push(chat);
      }
      return sortChatsForDisplay(chats);
    } catch (error) {
      console.error('Error searching chats — falling back to in-memory filter', error);
      return sortChatsForDisplay(
        filterChatsBySearchQuery(await this.getAllChats(), normalized),
      );
    }
  }

  // —— AsyncStorage fallback (pre-rebuild / Jest without native) ——

  private async readAsyncHistory(): Promise<ChatConversation[]> {
    const historyJson = await AsyncStorage.getItem(CHAT_HISTORY_KEY);
    return parseChatHistoryJson(historyJson);
  }

  private async writeAsyncHistory(history: ChatConversation[]): Promise<void> {
    const trimmed = trimChatsToMax(history);
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(trimmed));
  }

  private async saveChatAsync(
    messages: Message[],
    chatId?: string | null,
  ): Promise<string> {
    const history = await this.readAsyncHistory();
    const { defaultTitle, preview } = buildTitleAndPreview(messages);
    const now = Date.now();

    if (chatId) {
      const index = history.findIndex((chat) => chat.id === chatId);
      if (index !== -1) {
        const existingChat = history[index];
        const messagesChanged =
          existingChat.messages.length !== messages.length ||
          JSON.stringify(existingChat.messages) !== JSON.stringify(messages);
        history[index] = {
          ...existingChat,
          title: existingChat.customTitle || defaultTitle,
          preview,
          messages,
          updatedAt: messagesChanged ? now : existingChat.updatedAt,
          pinned: existingChat.pinned,
          customTitle: existingChat.customTitle,
        };
      } else {
        history.unshift({
          id: chatId,
          title: defaultTitle,
          preview,
          messages,
          createdAt: now,
          updatedAt: now,
          pinned: false,
        });
      }
    } else {
      chatId = `chat_${now}_${Math.random().toString(36).substr(2, 9)}`;
      history.unshift({
        id: chatId,
        title: defaultTitle,
        preview,
        messages,
        createdAt: now,
        updatedAt: now,
        pinned: false,
      });
    }

    history.sort((a, b) => b.createdAt - a.createdAt);
    await this.writeAsyncHistory(history);
    return chatId;
  }

  private async getChatAsync(chatId: string): Promise<ChatConversation | null> {
    const history = await this.readAsyncHistory();
    return history.find((chat) => chat.id === chatId) || null;
  }

  private async deleteChatAsync(chatId: string): Promise<boolean> {
    const history = await this.readAsyncHistory();
    await this.writeAsyncHistory(history.filter((c) => c.id !== chatId));
    return true;
  }

  private async deleteMultipleChatsAsync(chatIds: string[]): Promise<boolean> {
    const set = new Set(chatIds);
    const history = await this.readAsyncHistory();
    await this.writeAsyncHistory(history.filter((c) => !set.has(c.id)));
    return true;
  }

  private async clearAllChatsAsync(): Promise<boolean> {
    await AsyncStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify([]));
    return true;
  }

  private async renameChatAsync(chatId: string, newTitle: string): Promise<boolean> {
    const history = await this.readAsyncHistory();
    const chatIndex = history.findIndex((chat) => chat.id === chatId);
    if (chatIndex === -1) return false;
    const trimmed = newTitle.trim();
    history[chatIndex] = {
      ...history[chatIndex],
      customTitle: trimmed || undefined,
      title: trimmed || history[chatIndex].title,
    };
    await this.writeAsyncHistory(history);
    return true;
  }

  private async togglePinChatAsync(chatId: string): Promise<boolean> {
    const history = await this.readAsyncHistory();
    const chatIndex = history.findIndex((chat) => chat.id === chatId);
    if (chatIndex === -1) return false;
    history[chatIndex] = {
      ...history[chatIndex],
      pinned: !history[chatIndex].pinned,
    };
    await this.writeAsyncHistory(history);
    return true;
  }

  private async getAllChatsAsync(): Promise<ChatConversation[]> {
    return sortChatsForDisplay(await this.readAsyncHistory());
  }
}

export const chatHistoryService = new ChatHistoryService();
