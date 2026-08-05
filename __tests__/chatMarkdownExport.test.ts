import {
  buildChatMarkdown,
  isExportableMessage,
} from '../src/utils/chatMarkdownExport';

describe('isExportableMessage', () => {
  it('skips system and empty placeholders', () => {
    expect(isExportableMessage({ role: 'system', content: 'sys' })).toBe(false);
    expect(isExportableMessage({ role: 'assistant', content: '' })).toBe(false);
    expect(isExportableMessage({ role: 'assistant', content: '  ' })).toBe(false);
  });

  it('keeps user/assistant with content or thought', () => {
    expect(isExportableMessage({ role: 'user', content: 'Hi' })).toBe(true);
    expect(
      isExportableMessage({ role: 'assistant', content: '', thought: 'plan' }),
    ).toBe(true);
  });
});

describe('buildChatMarkdown', () => {
  it('builds a titled document and skips system', () => {
    const md = buildChatMarkdown(
      [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there', thought: 'greet' },
      ],
      { title: 'My Chat', exportedAt: '2026-08-03' },
    );

    expect(md).toContain('# My Chat');
    expect(md).toContain('Exported from OFLN — 2026-08-03');
    expect(md).not.toContain('You are helpful');
    expect(md).toContain('## User');
    expect(md).toContain('Hello');
    expect(md).toContain('## Assistant');
    expect(md).toContain('Hi there');
    expect(md).toContain('### Thinking');
    expect(md).toContain('greet');
    expect(md.endsWith('\n')).toBe(true);
  });

  it('handles empty chats calmly', () => {
    const md = buildChatMarkdown([{ role: 'system', content: 'sys' }], {
      title: 'Empty',
    });
    expect(md).toContain('# Empty');
    expect(md).toContain('_No messages to export._');
  });
});
