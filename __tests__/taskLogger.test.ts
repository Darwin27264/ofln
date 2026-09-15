/**
 * Unit tests for taskLogger, execution tracing, and notification formatting.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  createTaskLogger,
  formatLogEntryTime,
  formatLogsForClipboard,
} from '../src/services/taskLogger';
import {
  saveTaskRun,
  getTaskRunById,
  type TaskRun,
} from '../src/services/taskService';

describe('taskLogger', () => {
  it('creates a logger and records structured timestamped entries', () => {
    const logger = createTaskLogger();
    logger.info('Starting task', { detail: 'test' });
    logger.warn('Resource warning');
    logger.error('Failed to connect', new Error('Network error'));
    logger.success('Completed step');

    const entries = logger.getEntries();
    expect(entries).toHaveLength(4);

    expect(entries[0].level).toBe('info');
    expect(entries[0].message).toBe('Starting task');
    expect(entries[0].details).toContain('test');
    expect(typeof entries[0].timestamp).toBe('number');

    expect(entries[1].level).toBe('warn');
    expect(entries[1].message).toBe('Resource warning');

    expect(entries[2].level).toBe('error');
    expect(entries[2].message).toBe('Failed to connect');
    expect(entries[2].details).toContain('Network error');

    expect(entries[3].level).toBe('success');
    expect(entries[3].message).toBe('Completed step');
  });

  it('formats time correctly', () => {
    const timeStr = formatLogEntryTime(Date.now());
    expect(timeStr).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('formats logs for clipboard export', () => {
    const logger = createTaskLogger();
    logger.info('Init step');
    logger.success('All done');

    const formatted = formatLogsForClipboard(logger.getEntries());
    expect(formatted).toContain('INFO');
    expect(formatted).toContain('Init step');
    expect(formatted).toContain('SUCCESS');
    expect(formatted).toContain('All done');
  });

  it('handles empty logs for clipboard export', () => {
    expect(formatLogsForClipboard([])).toBe('No execution logs available.');
    expect(formatLogsForClipboard(undefined)).toBe('No execution logs available.');
  });

  it('preserves execution logs and trigger in saveTaskRun', async () => {
    const logger = createTaskLogger();
    logger.info('Step 1');
    logger.success('Step 2');

    const run: TaskRun = {
      id: 'test_run_123',
      taskId: 'task_1',
      taskName: 'Daily Digest',
      startedAt: Date.now(),
      status: 'success',
      sourceUrl: 'https://example.com',
      trigger: 'scheduled_native',
      logs: logger.getEntries(),
    };

    await saveTaskRun(run);
    const retrieved = await getTaskRunById('test_run_123');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.trigger).toBe('scheduled_native');
    expect(retrieved?.logs).toHaveLength(2);
    expect(retrieved?.logs?.[0].message).toBe('Step 1');
    expect(retrieved?.logs?.[1].message).toBe('Step 2');
  });
});
