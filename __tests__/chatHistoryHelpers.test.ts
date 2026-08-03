jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  MAX_CHAT_HISTORY,
  buildTitleAndPreview,
  chatMatchesDatePeriod,
  chatToRow,
  escapeSqlLikePattern,
  filterChatsByDatePeriod,
  filterChatsBySearchQuery,
  parseChatHistoryJson,
  rowToChat,
  sortChatsForDisplay,
  trimChatsToMax,
} from '../src/services/chatHistoryHelpers';
import type { ChatConversation } from '../src/services/chatHistoryService';

function makeChat(
  id: string,
  createdAt: number,
  opts: Partial<ChatConversation> = {},
): ChatConversation {
  return {
    id,
    title: opts.title ?? id,
    preview: opts.preview ?? '',
    messages: opts.messages ?? [{ role: 'user', content: 'hi' }],
    createdAt,
    updatedAt: opts.updatedAt ?? createdAt,
    pinned: opts.pinned,
    customTitle: opts.customTitle,
  };
}

describe('parseChatHistoryJson', () => {
  it('returns empty for null / invalid', () => {
    expect(parseChatHistoryJson(null)).toEqual([]);
    expect(parseChatHistoryJson('not-json')).toEqual([]);
    expect(parseChatHistoryJson('{}')).toEqual([]);
  });

  it('keeps valid chats and drops corrupt entries', () => {
    const good = makeChat('a', 1);
    const raw = JSON.stringify([good, { id: 1 }, null, 'x']);
    const parsed = parseChatHistoryJson(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('a');
  });
});

describe('trimChatsToMax', () => {
  it('keeps the newest MAX by createdAt', () => {
    const chats = [
      makeChat('old', 1),
      makeChat('mid', 50),
      makeChat('new', 100),
    ];
    const trimmed = trimChatsToMax(chats, 2);
    expect(trimmed.map((c) => c.id)).toEqual(['new', 'mid']);
  });

  it('defaults to MAX_CHAT_HISTORY', () => {
    const chats = Array.from({ length: MAX_CHAT_HISTORY + 5 }, (_, i) =>
      makeChat(`c${i}`, i),
    );
    expect(trimChatsToMax(chats)).toHaveLength(MAX_CHAT_HISTORY);
  });
});

describe('sortChatsForDisplay', () => {
  it('puts pinned first, then newest createdAt', () => {
    const chats = [
      makeChat('a', 10),
      makeChat('b', 30, { pinned: true }),
      makeChat('c', 20, { pinned: true }),
      makeChat('d', 40),
    ];
    expect(sortChatsForDisplay(chats).map((c) => c.id)).toEqual([
      'b',
      'c',
      'd',
      'a',
    ]);
  });
});

describe('buildTitleAndPreview', () => {
  it('uses first user / assistant content', () => {
    const { defaultTitle, preview } = buildTitleAndPreview([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'Hello world from the user' },
      { role: 'assistant', content: 'Reply text here' },
    ]);
    expect(defaultTitle).toBe('Hello world from the user');
    expect(preview).toBe('Reply text here');
  });
});

describe('chatToRow / rowToChat', () => {
  it('round-trips message shape', () => {
    const chat = makeChat('x', 99, {
      pinned: true,
      customTitle: 'Mine',
      messages: [
        {
          role: 'user',
          content: 'hi',
          attachments: [{ type: 'image', uri: 'file://a.jpg' }],
        },
        { role: 'assistant', content: 'yo', thought: 't', tokensPerSecond: 12 },
      ],
    });
    const row = chatToRow(chat);
    expect(row.pinned).toBe(1);
    expect(row.custom_title).toBe('Mine');
    const back = rowToChat(row);
    expect(back).toEqual(chat);
  });

  it('returns null for corrupt messages_json', () => {
    expect(
      rowToChat({
        id: 'x',
        title: 't',
        preview: '',
        messages_json: '{',
        created_at: 1,
        updated_at: 1,
        pinned: 0,
        custom_title: null,
      }),
    ).toBeNull();
  });
});

describe('filterChatsBySearchQuery', () => {
  const chats = [
    makeChat('1', 1, {
      title: 'Alpha plan',
      preview: 'about gardens',
      messages: [{ role: 'user', content: 'hello' }],
    }),
    makeChat('2', 2, {
      title: 'Beta',
      customTitle: 'Renamed',
      preview: '',
      messages: [{ role: 'assistant', content: 'quantum notes' }],
    }),
    makeChat('3', 3, {
      title: 'Gamma',
      preview: 'x',
      messages: [{ role: 'user', content: 'unrelated' }],
    }),
  ];

  it('returns all chats for empty query', () => {
    expect(filterChatsBySearchQuery(chats, '  ')).toHaveLength(3);
  });

  it('matches title, preview, custom title, and message body', () => {
    expect(filterChatsBySearchQuery(chats, 'alpha').map((c) => c.id)).toEqual(['1']);
    expect(filterChatsBySearchQuery(chats, 'gardens').map((c) => c.id)).toEqual(['1']);
    expect(filterChatsBySearchQuery(chats, 'renamed').map((c) => c.id)).toEqual(['2']);
    expect(filterChatsBySearchQuery(chats, 'quantum').map((c) => c.id)).toEqual(['2']);
  });

  it('is case-insensitive', () => {
    expect(filterChatsBySearchQuery(chats, 'ALPHA').map((c) => c.id)).toEqual(['1']);
  });
});

describe('escapeSqlLikePattern', () => {
  it('escapes LIKE wildcards', () => {
    expect(escapeSqlLikePattern('100%_done')).toBe('100\\%\\_done');
  });
});

describe('filterChatsByDatePeriod', () => {
  // Fixed "now": Wed 2026-08-05 15:00 local — avoids DST edge flakiness in CI.
  const now = new Date(2026, 7, 5, 15, 0, 0).getTime();
  const day = 24 * 60 * 60 * 1000;
  const todayMorning = new Date(2026, 7, 5, 9, 0, 0).getTime();
  const yesterday = new Date(2026, 7, 4, 18, 0, 0).getTime();
  const sixDaysAgo = now - 6 * day;
  const twentyDaysAgo = now - 20 * day;
  const fortyDaysAgo = now - 40 * day;

  const chats = [
    makeChat('today', todayMorning, { updatedAt: todayMorning }),
    makeChat('yesterday', yesterday, { updatedAt: yesterday }),
    makeChat('week', sixDaysAgo, { updatedAt: sixDaysAgo }),
    makeChat('month', twentyDaysAgo, { updatedAt: twentyDaysAgo }),
    makeChat('old', fortyDaysAgo, { updatedAt: fortyDaysAgo }),
  ];

  it('returns all for all-time', () => {
    expect(filterChatsByDatePeriod(chats, 'all', now)).toHaveLength(5);
  });

  it('filters today / yesterday / rolling windows / older', () => {
    expect(filterChatsByDatePeriod(chats, 'today', now).map((c) => c.id)).toEqual(['today']);
    expect(filterChatsByDatePeriod(chats, 'yesterday', now).map((c) => c.id)).toEqual([
      'yesterday',
    ]);
    expect(filterChatsByDatePeriod(chats, 'last7', now).map((c) => c.id)).toEqual([
      'today',
      'yesterday',
      'week',
    ]);
    expect(filterChatsByDatePeriod(chats, 'last30', now).map((c) => c.id)).toEqual([
      'today',
      'yesterday',
      'week',
      'month',
    ]);
    expect(filterChatsByDatePeriod(chats, 'older', now).map((c) => c.id)).toEqual(['old']);
  });

  it('uses updatedAt over createdAt', () => {
    const chat = makeChat('revived', fortyDaysAgo, { updatedAt: todayMorning });
    expect(chatMatchesDatePeriod(chat, 'today', now)).toBe(true);
    expect(chatMatchesDatePeriod(chat, 'older', now)).toBe(false);
  });
});
