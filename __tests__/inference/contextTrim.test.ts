import {
  applyConversationTrim,
  trimConversation,
} from '../../src/services/inference/contextTrim';

describe('trimConversation', () => {
  it('returns short conversations unchanged', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    expect(trimConversation(messages, 2048, 256)).toEqual(messages);
  });

  it('always keeps system + current user when budget is exhausted', () => {
    const messages = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'old-1' },
      { role: 'assistant', content: 'old-a' },
      { role: 'user', content: 'current' },
    ];

    const trimmed = trimConversation(messages, 64, 48);
    expect(trimmed[0]).toEqual(messages[0]);
    expect(trimmed[trimmed.length - 1]).toEqual(messages[messages.length - 1]);
    expect(trimmed.length).toBe(2);
  });

  it('keeps newest history first within budget', () => {
    const messages = [
      { role: 'system', content: 'S' },
      { role: 'user', content: 'u1-' + 'x'.repeat(200) },
      { role: 'assistant', content: 'a1-' + 'y'.repeat(200) },
      { role: 'user', content: 'u2-short' },
      { role: 'assistant', content: 'a2-short' },
      { role: 'user', content: 'latest' },
    ];

    // Fits recent short turns + one padded assistant; drops the oldest padded user.
    const trimmed = trimConversation(messages, 280, 64);
    expect(trimmed[0].content).toBe('S');
    expect(trimmed[trimmed.length - 1].content).toBe('latest');
    expect(trimmed.some((m) => String(m.content).startsWith('u2'))).toBe(true);
    expect(trimmed.some((m) => String(m.content).startsWith('u1'))).toBe(false);
  });
});

describe('applyConversationTrim', () => {
  it('reports droppedCount 0 when nothing is removed', () => {
    const messages = [
      { role: 'system', content: 'You are helpful.' },
      { role: 'user', content: 'Hi' },
    ];
    const result = applyConversationTrim(messages, 2048, 256);
    expect(result.messages).toEqual(messages);
    expect(result.droppedCount).toBe(0);
  });

  it('reports how many messages were dropped', () => {
    const messages = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'old-1' },
      { role: 'assistant', content: 'old-a' },
      { role: 'user', content: 'current' },
    ];
    const result = applyConversationTrim(messages, 64, 48);
    expect(result.messages).toEqual([messages[0], messages[3]]);
    expect(result.droppedCount).toBe(2);
  });
});
