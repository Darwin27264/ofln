import {
  applyConversationTrim,
  buildSummarizationPrompt,
  consolidateWithSummary,
  fitMessagesToCharBudget,
  formatPinnedEarlierSummary,
  partitionForSummarization,
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

  it('clamps oversized system+user (task-style) prompts to fit n_ctx', () => {
    const huge = 'NEWS '.repeat(3000); // ~15k chars
    const messages = [
      { role: 'system', content: 'You are a concise analyst.' },
      { role: 'user', content: `Summarize:\n\n${huge}` },
    ];
    // n_ctx=512, n_predict=128 → (512-128-192)*3.0 = 576 chars budget
    const trimmed = trimConversation(messages, 512, 128);
    expect(trimmed).toHaveLength(2);
    expect(trimmed[0]).toEqual(messages[0]);
    expect(typeof trimmed[1].content).toBe('string');
    expect((trimmed[1].content as string).length).toBeLessThan(messages[1].content.length);
    expect((trimmed[1].content as string).length).toBeLessThanOrEqual(700);
    expect(trimmed[1].content as string).toContain('[…truncated for context…]');
  });

  it('clamps ~5k char prompts under emulator n_ctx=1024', () => {
    // Reproduces Morning Brief failure: settings.n_ctx=2048 but loaded n_ctx=1024.
    const body = 'x'.repeat(4933);
    const messages = [
      { role: 'system', content: 'You are a concise analyst on this phone.' },
      { role: 'user', content: body },
    ];
    const trimmed = trimConversation(messages, 1024, 256);
    const userLen = (trimmed[1].content as string).length;
    // Budget ≈ (1024-256-192)*3 = 1728, minus system chars.
    expect(userLen).toBeLessThan(4933);
    expect(userLen).toBeLessThanOrEqual(1800);
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
      { role: 'user', content: 'u1-' + 'x'.repeat(2000) },
      { role: 'assistant', content: 'a1-' + 'y'.repeat(2000) },
      { role: 'user', content: 'u2-short' },
      { role: 'assistant', content: 'a2-short' },
      { role: 'user', content: 'latest' },
    ];

    // n_ctx=1024 / n_predict=256 → room for recent short turns, not the padded oldest.
    const trimmed = trimConversation(messages, 1024, 256);
    expect(trimmed[0].content).toBe('S');
    expect(trimmed[trimmed.length - 1].content).toBe('latest');
    expect(trimmed.some((m) => String(m.content).startsWith('u2'))).toBe(true);
    expect(trimmed.some((m) => String(m.content).startsWith('u1'))).toBe(false);
  });

  it('keeps the real user topic when the transcript ends on an assistant', () => {
    const topic = 'Meaning of life is to suffer';
    const messages = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'old topic' },
      { role: 'assistant', content: 'old reply' },
      { role: 'user', content: topic },
      {
        role: 'assistant',
        content: 'A long skeptic reply that must not become the trim anchor.',
      },
    ];

    const trimmed = trimConversation(messages, 64, 48);
    expect(trimmed[0].content).toBe('SYS');
    expect(trimmed.some((m) => m.content === topic)).toBe(true);
    expect(trimmed[trimmed.length - 1].role).toBe('assistant');
    expect(trimmed.some((m) => m.content === 'old topic')).toBe(false);
  });
});

describe('fitMessagesToCharBudget', () => {
  it('truncates the last user message when over budget', () => {
    const messages = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'x'.repeat(500) },
    ];
    const fitted = fitMessagesToCharBudget(messages, 120);
    expect(fitted[0].content).toBe('SYS');
    expect((fitted[1].content as string).length).toBeLessThanOrEqual(120);
    expect(fitted[1].content as string).toContain('[…truncated for context…]');
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

describe('context summarization helpers', () => {
  const sampleMessages = [
    { role: 'system', content: 'You are ofln.' },
    { role: 'user', content: 'My favorite color is green.' },
    { role: 'assistant', content: 'Noted that your favorite color is green.' },
    { role: 'user', content: 'I am planning a trip to Kyoto.' },
    { role: 'assistant', content: 'Kyoto has beautiful shrines.' },
    { role: 'user', content: 'Recommend 3 hotels.' },
    { role: 'assistant', content: '1. Hotel Granvia\n2. The Thousand\n3. Ace Hotel' },
    { role: 'user', content: 'What about budget options?' },
    { role: 'assistant', content: 'For budget, consider Piece Hostel Kyoto.' },
  ];

  it('returns null if conversation does not have enough turns to summarize', () => {
    const shortList = sampleMessages.slice(0, 5);
    expect(partitionForSummarization(shortList, 6)).toBeNull();
  });

  it('partitions earlier turns and preserves recent turns', () => {
    const partition = partitionForSummarization(sampleMessages, 4);
    expect(partition).not.toBeNull();
    if (!partition) return;

    expect(partition.systemMessage.content).toBe('You are ofln.');
    expect(partition.earlierTurnsToSummarize.length).toBe(4);
    expect(partition.recentTurnsToKeep.length).toBe(4);
    expect(partition.recentTurnsToKeep[partition.recentTurnsToKeep.length - 1].content).toContain('Piece Hostel');
  });

  it('builds a clean on-device summarization prompt', () => {
    const turns = [
      { role: 'user', content: 'My dog is named Buster.' },
      { role: 'assistant', content: 'Great name!' },
    ];
    const prompt = buildSummarizationPrompt(turns);
    expect(prompt).toContain('User: My dog is named Buster.');
    expect(prompt).toContain('Assistant: Great name!');
    expect(prompt).toContain('Context Summary:');
  });

  it('formats pinned earlier summary and consolidates transcript correctly', () => {
    const sys = { role: 'system', content: 'System instruction.' };
    const recent = [
      { role: 'user', content: 'What is my dog name?' },
      { role: 'assistant', content: 'Your dog is Buster.' },
    ];
    const summary = '- User has a dog named Buster.';
    const formatted = formatPinnedEarlierSummary(summary);
    expect(formatted).toBe('Earlier in this chat:\n- User has a dog named Buster.');

    const consolidated = consolidateWithSummary(sys, summary, recent, (c) => ({
      role: 'system',
      content: c,
    }));

    expect(consolidated.length).toBe(4);
    expect(consolidated[0]).toEqual(sys);
    expect(consolidated[1].content).toContain('Earlier in this chat:');
    expect(consolidated[1].content).toContain('Buster');
    expect(consolidated[2]).toEqual(recent[0]);
    expect(consolidated[3]).toEqual(recent[1]);
  });
});

