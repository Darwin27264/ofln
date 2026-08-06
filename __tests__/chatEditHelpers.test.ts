import { buildMessagesAfterUserEdit } from '../src/utils/chatEditHelpers';
import type { ChatMessage } from '../src/types/ai';

const system: ChatMessage = { role: 'system', content: 'sys' };
const u1: ChatMessage = { role: 'user', content: 'hello' };
const a1: ChatMessage = { role: 'assistant', content: 'hi there' };
const u2: ChatMessage = { role: 'user', content: 'follow up' };
const a2: ChatMessage = { role: 'assistant', content: 'ok' };

describe('buildMessagesAfterUserEdit', () => {
  const thread = [system, u1, a1, u2, a2];

  it('updates user text and drops later turns', () => {
    const next = buildMessagesAfterUserEdit(thread, 1, '  hello edited  ');
    expect(next).toEqual([
      system,
      { role: 'user', content: 'hello edited' },
    ]);
  });

  it('keeps earlier context when editing a later user turn', () => {
    const next = buildMessagesAfterUserEdit(thread, 3, 'new follow up');
    expect(next).toEqual([
      system,
      u1,
      a1,
      { role: 'user', content: 'new follow up' },
    ]);
  });

  it('returns null for non-user index', () => {
    expect(buildMessagesAfterUserEdit(thread, 2, 'x')).toBeNull();
    expect(buildMessagesAfterUserEdit(thread, 0, 'x')).toBeNull();
  });

  it('returns null for empty content without attachments', () => {
    expect(buildMessagesAfterUserEdit(thread, 1, '   ')).toBeNull();
  });

  it('allows empty text when user has attachments', () => {
    const withImage: ChatMessage[] = [
      system,
      {
        role: 'user',
        content: 'caption',
        attachments: [{ type: 'image', uri: 'file://a.jpg' }],
      },
      a1,
    ];
    const next = buildMessagesAfterUserEdit(withImage, 1, '  ');
    expect(next).toEqual([
      system,
      {
        role: 'user',
        content: '',
        attachments: [{ type: 'image', uri: 'file://a.jpg' }],
      },
    ]);
  });
});
