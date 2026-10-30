jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  appendFile: jest.fn(async () => {}),
  readFile: jest.fn(async () => '=== App environment ===\nApp: ofln 1.1\n\n=== Error ===\n'),
  exists: jest.fn(async () => true),
  unlink: jest.fn(async () => {}),
}));

import {
  sanitizeLogContext,
  getSanitizedDiagnosticsString,
} from '../src/utils/errorLogger';

describe('Error Logger Privacy Audit (R3)', () => {
  it('redacts sensitive chat prompt and message content from log context', () => {
    const rawContext = {
      modelName: 'Qwen3.5-2B-Q4_0.gguf',
      generationId: 'gen-123',
      prompt: 'This is my secret private chat prompt that should never be logged',
      userInput: 'Tell me a secret',
      userText: 'Hello world from user input',
      chatContent: 'Confidential message',
      token: 'hf_secret_token_value_abc',
      safeMetric: 42,
    };

    const sanitized = sanitizeLogContext(rawContext);
    expect(sanitized).toBeDefined();
    expect(sanitized!.modelName).toBe('Qwen3.5-2B-Q4_0.gguf');
    expect(sanitized!.generationId).toBe('gen-123');
    expect(sanitized!.safeMetric).toBe(42);

    // Chat content and tokens must be redacted
    expect(sanitized!.prompt).toContain('[REDACTED_CHAT_CONTENT_');
    expect(sanitized!.prompt).not.toContain('secret private chat');
    expect(sanitized!.userInput).toContain('[REDACTED_CHAT_CONTENT_');
    expect(sanitized!.userInput).not.toContain('secret');
    expect(sanitized!.userText).toContain('[REDACTED_CHAT_CONTENT_');
    expect(sanitized!.chatContent).toContain('[REDACTED_CHAT_CONTENT_');
    expect(sanitized!.token).toContain('[REDACTED_CHAT_CONTENT_');
  });

  it('redacts nested sensitive fields', () => {
    const nested = {
      meta: {
        prompt: 'Nested private prompt',
        status: 'ok',
      },
    };

    const sanitized = sanitizeLogContext(nested);
    expect(sanitized?.meta?.prompt).toContain('[REDACTED_CHAT_CONTENT_');
    expect(sanitized?.meta?.status).toBe('ok');
  });

  it('generates a clean sanitized diagnostics string for bug reports', async () => {
    const diag = await getSanitizedDiagnosticsString();
    expect(diag).toContain('=== App environment ===');
    expect(diag).toContain('Privacy Assurance: Local-only, telemetry-free diagnostics');
  });
});
