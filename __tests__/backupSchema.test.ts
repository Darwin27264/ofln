jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  crc32,
  createZipStore,
  extractZipStore,
  looksLikeZip,
  utf8ToBytes,
  bytesToUtf8,
} from '../src/utils/zipStore';
import {
  BACKUP_FORMAT,
  BACKUP_SCHEMA_VERSION,
  parseBackupPayload,
  mergeChatsById,
  sanitizeChatForBackup,
  sortModelsSmallestFirst,
  buildBackupFileName,
  safeBackupModelFileName,
  isSafeRestoreDownloadUrl,
} from '../src/utils/backupSchema';
import type { ChatConversation } from '../src/services/chatHistoryService';
import { buildNewSourceMonitorTask } from '../src/services/taskService';

describe('zipStore', () => {
  it('round-trips STORE zip with CRC and multiple entries', () => {
    const entries = [
      { name: 'manifest.json', data: utf8ToBytes('{"ok":true}') },
      { name: 'chats.json', data: utf8ToBytes('[]') },
    ];
    const zip = createZipStore(entries);
    expect(looksLikeZip(zip)).toBe(true);
    const out = extractZipStore(zip);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('manifest.json');
    expect(bytesToUtf8(out[0].data)).toBe('{"ok":true}');
    expect(bytesToUtf8(out[1].data)).toBe('[]');
  });

  it('rejects path traversal names on create', () => {
    expect(() =>
      createZipStore([{ name: '../evil.json', data: utf8ToBytes('x') }]),
    ).toThrow(/Unsafe/);
  });

  it('crc32 is stable for known vector', () => {
    // CRC of "123456789" is the classic check value 0xCBF43926
    expect(crc32(utf8ToBytes('123456789'))).toBe(0xcbf43926);
  });
});

describe('backupSchema', () => {
  const sampleChat: ChatConversation = {
    id: 'chat_1',
    title: 'Hello',
    preview: 'Hi',
    messages: [
      {
        role: 'user',
        content: 'Hi',
        attachments: [{ type: 'image', uri: 'file:///secret.jpg' }],
      },
      { role: 'assistant', content: 'Hey', personaId: 'p1', personaName: 'Ada' },
    ],
    createdAt: 100,
    updatedAt: 200,
  };

  it('parses valid chats backup and strips attachments', () => {
    const raw = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      kind: 'chats',
      exportedAt: 1,
      appVersion: '1.1',
      chats: [sampleChat],
    };
    const r = parseBackupPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.chats).toHaveLength(1);
    expect(r.payload.chats![0].messages[0].attachments).toBeUndefined();
    expect(r.payload.chats![0].messages[0].content).toBe('Hi');
    expect(r.payload.chats![0].messages[1].personaName).toBe('Ada');
  });

  it('accepts optional tasks and taskRuns on full backup', () => {
    const task = buildNewSourceMonitorTask({
      name: 'Blog',
      sourceUrl: 'https://example.com',
    });
    const raw = {
      format: BACKUP_FORMAT,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      kind: 'full',
      exportedAt: 1,
      appVersion: '1.1',
      chats: [],
      tasks: [task],
      taskRuns: [
        {
          id: 'run_1',
          taskId: task.id,
          taskName: task.name,
          startedAt: 1,
          status: 'success',
          sourceUrl: task.sourceUrl,
          resultText: 'ok',
        },
      ],
    };
    const r = parseBackupPayload(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.tasks).toHaveLength(1);
    expect(r.payload.taskRuns).toHaveLength(1);
  });

  it('rejects foreign format and future schema', () => {
    expect(parseBackupPayload({ format: 'other' }).ok).toBe(false);
    expect(
      parseBackupPayload({
        format: BACKUP_FORMAT,
        schemaVersion: 99,
        kind: 'chats',
      }).ok,
    ).toBe(false);
  });

  it('mergeChatsById prefers import on id collision', () => {
    const a: ChatConversation = {
      ...sampleChat,
      id: 'x',
      title: 'Old',
      updatedAt: 1,
      messages: [{ role: 'user', content: 'old' }],
    };
    const b: ChatConversation = {
      ...sampleChat,
      id: 'x',
      title: 'New',
      updatedAt: 2,
      messages: [{ role: 'user', content: 'new' }],
    };
    const merged = mergeChatsById([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].title).toBe('New');
  });

  it('sortModelsSmallestFirst puts small sizes first', () => {
    const sorted = sortModelsSmallestFirst([
      { fileName: 'big.gguf', expectedBytes: 5_000_000_000 },
      { fileName: 'tiny.gguf', expectedBytes: 100_000_000 },
      { fileName: 'mid.gguf', sizeBytes: 500_000_000 },
    ]);
    expect(sorted.map((m) => m.fileName)).toEqual([
      'tiny.gguf',
      'mid.gguf',
      'big.gguf',
    ]);
  });

  it('sanitizeChatForBackup drops attachments only', () => {
    const c = sanitizeChatForBackup(sampleChat);
    expect(c.messages[0].attachments).toBeUndefined();
    expect(c.messages[1].content).toBe('Hey');
  });

  it('buildBackupFileName uses kind', () => {
    const d = new Date(2026, 0, 2, 3, 4, 5);
    expect(buildBackupFileName('chats', d)).toMatch(/^ofln-chats-20260102-030405\.json$/);
    expect(buildBackupFileName('full', d)).toMatch(/^ofln-backup-20260102-030405\.zip$/);
  });

  it('safeBackupModelFileName rejects path traversal', () => {
    expect(safeBackupModelFileName('../../evil.gguf')).toBe('evil.gguf');
    expect(safeBackupModelFileName('foo/bar.gguf')).toBe('bar.gguf');
    expect(safeBackupModelFileName('..')).toBeNull();
    expect(safeBackupModelFileName('nope.bin')).toBeNull();
    expect(safeBackupModelFileName('model.gguf.partial')).toBeNull();
    expect(safeBackupModelFileName('Qwen3.5-0.8B-Q4_K_M.gguf')).toBe(
      'Qwen3.5-0.8B-Q4_K_M.gguf',
    );
  });

  it('isSafeRestoreDownloadUrl allows HF https and blocks unsafe', () => {
    expect(
      isSafeRestoreDownloadUrl(
        'https://huggingface.co/unsloth/Qwen/resolve/main/model.gguf',
      ),
    ).toBe(true);
    expect(
      isSafeRestoreDownloadUrl('https://cdn.example.com/weights/model.gguf'),
    ).toBe(true);
    expect(isSafeRestoreDownloadUrl('http://huggingface.co/a/b/resolve/main/x.gguf')).toBe(
      false,
    );
    expect(isSafeRestoreDownloadUrl('https://127.0.0.1/x.gguf')).toBe(false);
    expect(isSafeRestoreDownloadUrl('https://127.0.0.2/x.gguf')).toBe(false);
    expect(isSafeRestoreDownloadUrl('https://169.254.169.254/latest/x.gguf')).toBe(
      false,
    );
    expect(isSafeRestoreDownloadUrl('https://10.0.0.5/model.gguf')).toBe(false);
    expect(isSafeRestoreDownloadUrl('https://evil.com/not-a-model')).toBe(false);
    expect(
      isSafeRestoreDownloadUrl('https://user:pass@host.com/a.gguf'),
    ).toBe(false);
  });

  it('drops unsafe model URLs while keeping safe basename', () => {
    const r = parseBackupPayload({
      format: BACKUP_FORMAT,
      schemaVersion: 1,
      kind: 'full',
      exportedAt: 1,
      appVersion: '1.1',
      models: [
        {
          fileName: '../evil.gguf',
          downloadUrl: 'http://127.0.0.1/x.gguf',
        },
        {
          fileName: 'good.gguf',
          downloadUrl:
            'https://huggingface.co/org/repo/resolve/main/good.gguf',
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.models).toHaveLength(2);
    expect(r.payload.models![0].fileName).toBe('evil.gguf');
    expect(r.payload.models![0].downloadUrl).toBeNull();
    expect(r.payload.models![1].downloadUrl).toContain('huggingface.co');
  });
});
