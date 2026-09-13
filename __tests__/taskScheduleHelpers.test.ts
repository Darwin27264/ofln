/**
 * Pure helpers for Source Monitor fetch / schedule — Jest coverage.
 */

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import {
  clampHour,
  clampMinute,
  computeNextRunAt,
  computeNextRunAfter,
  formatScheduleSummary,
  isValidHttpUrl,
  normalizeSchedule,
} from '../src/utils/taskScheduleHelpers';
import {
  htmlToPlainText,
  truncateSourceText,
} from '../src/services/sourceFetchService';
import {
  isSourceMonitorTask,
  isScheduledTask,
  isTaskRun,
  buildNewSourceMonitorTask,
  buildNewScheduledTask,
} from '../src/services/taskService';

describe('taskScheduleHelpers', () => {
  it('normalizes schedule defaults', () => {
    expect(normalizeSchedule(null)).toEqual({
      cadence: 'daily',
      hour: 9,
      minute: 0,
      weekdays: undefined,
    });
    expect(
      normalizeSchedule({ cadence: 'weekly', hour: 25, minute: -1, weekday: 9 }),
    ).toEqual({
      cadence: 'weekly',
      hour: 23,
      minute: 0,
      weekdays: [6],
    });
    expect(
      normalizeSchedule({
        cadence: 'weekly',
        hour: 8,
        minute: 0,
        weekdays: [1, 3, 1, 5],
      }),
    ).toEqual({
      cadence: 'weekly',
      hour: 8,
      minute: 0,
      weekdays: [1, 3, 5],
    });
  });

  it('clamps hour and minute', () => {
    expect(clampHour(30)).toBe(23);
    expect(clampMinute(-5)).toBe(0);
  });

  it('computes next daily run in the future', () => {
    // Wednesday 2026-09-09 10:00 local — use fixed ms via Date construction
    const from = new Date(2026, 8, 9, 10, 0, 0, 0).getTime();
    const next = computeNextRunAt({ cadence: 'daily', hour: 9, minute: 0 }, from);
    expect(next).toBeGreaterThan(from);
    const d = new Date(next);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  it('returns same slot when from lands exactly on it', () => {
    const from = new Date(2026, 8, 9, 9, 0, 0, 0).getTime();
    const next = computeNextRunAt({ cadence: 'daily', hour: 9, minute: 0 }, from);
    expect(next).toBe(from);
  });

  it('computeNextRunAfter skips the immediate slot', () => {
    const from = new Date(2026, 8, 9, 9, 0, 0, 0).getTime();
    const next = computeNextRunAfter({ cadence: 'daily', hour: 9, minute: 0 }, from);
    expect(next).toBeGreaterThan(from);
  });

  it('formats schedule summary', () => {
    expect(formatScheduleSummary({ cadence: 'daily', hour: 8, minute: 5 })).toBe(
      'Every day at 08:05',
    );
    expect(
      formatScheduleSummary({ cadence: 'weekly', hour: 18, minute: 30, weekdays: [1] }),
    ).toBe('Every Monday at 18:30');
    expect(
      formatScheduleSummary({
        cadence: 'weekly',
        hour: 9,
        minute: 0,
        weekdays: [1, 3, 5],
      }),
    ).toBe('Every Mon, Wed & Fri at 09:00');
  });

  it('picks next run across multiple weekdays', () => {
    // Wednesday 2026-09-09 10:00 local
    const from = new Date(2026, 8, 9, 10, 0, 0, 0).getTime();
    const next = computeNextRunAt(
      { cadence: 'weekly', hour: 9, minute: 0, weekdays: [1, 5] },
      from,
    );
    const d = new Date(next);
    // Next is Friday Sep 11
    expect(d.getDay()).toBe(5);
    expect(d.getDate()).toBe(11);
    expect(d.getHours()).toBe(9);
  });

  it('validates http(s) urls', () => {
    expect(isValidHttpUrl('https://example.com/feed')).toBe(true);
    expect(isValidHttpUrl('ftp://example.com')).toBe(false);
    expect(isValidHttpUrl('not a url')).toBe(false);
  });
});

describe('sourceFetchService helpers', () => {
  it('strips html to plain text', () => {
    const html =
      '<html><head><style>.x{color:red}</style><script>evil()</script></head>' +
      '<body><h1>Hello</h1><p>World &amp; friends</p></body></html>';
    const text = htmlToPlainText(html);
    expect(text).toContain('Hello');
    expect(text).toContain('World & friends');
    expect(text).not.toContain('evil');
    expect(text).not.toContain('color:red');
  });

  it('truncates long source text', () => {
    const long = 'a'.repeat(100);
    const { text, truncated } = truncateSourceText(long, 50);
    expect(truncated).toBe(true);
    expect(text.length).toBeGreaterThan(50);
    expect(text).toContain('truncated');
  });
});

describe('taskService validators', () => {
  it('accepts a built llm prompt task', () => {
    const task = buildNewScheduledTask({
      name: 'Morning poem',
      kind: 'llm_prompt',
    });
    expect(isScheduledTask(task)).toBe(true);
    expect(task.kind).toBe('llm_prompt');
    expect(task.sourceUrl).toBe('');
    expect(task.analysisPrompt.length).toBeGreaterThan(0);
    expect(task.nextRunAt).toBeGreaterThan(0);
  });

  it('accepts a built source monitor task', () => {
    const task = buildNewSourceMonitorTask({
      name: 'News',
      sourceUrl: 'https://example.com',
    });
    expect(isSourceMonitorTask(task)).toBe(true);
    expect(task.kind).toBe('source_monitor');
    expect(task.nextRunAt).toBeGreaterThan(0);
  });

  it('rejects invalid task shapes', () => {
    expect(isScheduledTask({})).toBe(false);
    expect(isTaskRun({ id: 'x' })).toBe(false);
  });
});
