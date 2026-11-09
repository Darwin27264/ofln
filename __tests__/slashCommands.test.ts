jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 8 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 3 * 1024 ** 3),
  },
}));

import {
  SLASH_COMMANDS,
  filterSlashCommands,
  parseSlashCommand,
  buildHelpMarkdown,
  buildStatsMarkdown,
  buildContextMarkdown,
  buildExportMarkdown,
} from '../src/utils/slashCommands';

describe('slashCommands', () => {
  describe('filterSlashCommands', () => {
    it('returns empty array when input does not start with /', () => {
      expect(filterSlashCommands('hello')).toEqual([]);
      expect(filterSlashCommands('')).toEqual([]);
    });

    it('returns empty array if input contains space after command', () => {
      expect(filterSlashCommands('/demo ')).toEqual([]);
    });

    it('returns all commands when input is exactly /', () => {
      const results = filterSlashCommands('/');
      expect(results.length).toBe(SLASH_COMMANDS.length);
    });

    it('filters commands by prefix', () => {
      const statsMatch = filterSlashCommands('/st');
      expect(statsMatch.some((c) => c.name === 'stats')).toBe(true);

      const ctxMatch = filterSlashCommands('/con');
      expect(ctxMatch.some((c) => c.name === 'context')).toBe(true);
    });

    it('filters commands by alias', () => {
      const devMatch = filterSlashCommands('/dev');
      expect(devMatch.some((c) => c.name === 'stats')).toBe(true);

      const tokensMatch = filterSlashCommands('/tok');
      expect(tokensMatch.some((c) => c.name === 'context')).toBe(true);
    });
  });

  describe('parseSlashCommand', () => {
    it('returns null for non-command input', () => {
      expect(parseSlashCommand('hello world')).toBeNull();
      expect(parseSlashCommand('')).toBeNull();
    });

    it('returns null for unknown command', () => {
      expect(parseSlashCommand('/unknowncommand123')).toBeNull();
    });

    it('parses commands without args', () => {
      const parsed = parseSlashCommand('/stats');
      expect(parsed).not.toBeNull();
      expect(parsed?.command.name).toBe('stats');
      expect(parsed?.args).toBe('');
    });

    it('parses commands with args', () => {
      const parsed = parseSlashCommand('/demo stream');
      expect(parsed).not.toBeNull();
      expect(parsed?.command.name).toBe('demo');
      expect(parsed?.args).toBe('stream');
    });

    it('parses aliases accurately', () => {
      const parsed = parseSlashCommand('/device');
      expect(parsed).not.toBeNull();
      expect(parsed?.command.name).toBe('stats');
    });
  });

  describe('buildHelpMarkdown', () => {
    it('includes all commands in table', () => {
      const md = buildHelpMarkdown();
      expect(md).toContain('/stats');
      expect(md).toContain('/context');
      expect(md).toContain('/clear');
      expect(md).toContain('/export');
      expect(md).toContain('/demo');
      expect(md).toContain('/temp');
    });
  });

  describe('buildStatsMarkdown', () => {
    it('formats stats with hardware and model info', async () => {
      const md = await buildStatsMarkdown({
        selectedModelName: 'test-model.gguf',
        accelLabel: 'Metal',
        accelDetail: 'GPU Offload',
      });
      expect(md).toContain('System & Hardware Diagnostics');
      expect(md).toContain('test-model.gguf');
      expect(md).toContain('Metal');
    });
  });

  describe('buildContextMarkdown', () => {
    it('formats context breakdown accurately', () => {
      const md = buildContextMarkdown({
        messages: [
          { role: 'user', content: 'Hello there' },
          { role: 'assistant', content: 'Hi, how can I help?' },
        ],
        n_ctx: 2048,
      });

      expect(md).toContain('Context Window Utilization');
      expect(md).toContain('2,048');
      expect(md).toContain('2');
    });
  });

  describe('buildExportMarkdown', () => {
    it('generates markdown transcript with correct turn count', () => {
      const res = buildExportMarkdown({
        messages: [
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: '2+2 is 4.' },
        ],
        chatTitle: 'Math Chat',
      });

      expect(res.turnsCount).toBe(2);
      expect(res.markdown).toContain('# Math Chat');
      expect(res.markdown).toContain('What is 2+2?');
      expect(res.markdown).toContain('2+2 is 4.');
    });
  });
});
