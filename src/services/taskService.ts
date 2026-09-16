/**
 * Scheduled tasks — local CRUD via AsyncStorage.
 * Kinds: source_monitor (fetch URL + LLM) and llm_prompt (LLM only).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  computeNextRunAfter,
  computeNextRunAt,
  isValidHttpUrl,
  normalizeSchedule,
  type TaskSchedule,
} from '../utils/taskScheduleHelpers';
import type { TaskRunLogEntry } from './taskLogger';
import {
  scheduleNativeTask,
  cancelNativeTask,
} from './nativeTaskScheduler';

const TASKS_KEY = '@ofln_tasks';
const TASK_RUNS_KEY = '@ofln_task_runs';

export const TASK_RUNS_PER_TASK = 20;
export const TASK_RESULT_MAX_CHARS = 24000;
export const TASK_FETCH_STORE_MAX_CHARS = 16000;

export type TaskKind = 'source_monitor' | 'llm_prompt';

export type TaskLastStatus =
  | 'idle'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type TaskRunStatus =
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped'
  | 'pending_analysis';

export interface ScheduledTask {
  id: string;
  name: string;
  kind: TaskKind;
  enabled: boolean;
  /** Required for source_monitor; empty for llm_prompt. */
  sourceUrl: string;
  schedule: TaskSchedule;
  /** Analysis instructions (source_monitor) or the full user prompt (llm_prompt). */
  analysisPrompt: string;
  personaId?: string | null;
  modelFileName?: string | null;
  nextRunAt: number;
  lastRunAt?: number | null;
  lastStatus: TaskLastStatus;
  createdAt: number;
  updatedAt: number;
}

/** @deprecated Prefer ScheduledTask — kept for existing imports. */
export type SourceMonitorTask = ScheduledTask;

export type TaskTriggerType =
  | 'manual'
  | 'scheduled_native'
  | 'background_fetch'
  | 'catch_up'
  | 'boot_completed';

export interface TaskRun {
  id: string;
  taskId: string;
  taskName: string;
  startedAt: number;
  finishedAt?: number | null;
  status: TaskRunStatus;
  error?: string | null;
  fetchedText?: string | null;
  resultText?: string | null;
  sourceUrl: string;
  modelFileName?: string | null;
  logs?: TaskRunLogEntry[];
  trigger?: TaskTriggerType;
}

export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function generateTaskRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function truncateStored(text: string | null | undefined, max: number): string | null {
  if (text == null) return null;
  const t = String(text);
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[…truncated ${t.length - max} characters]`;
}

export function normalizeTaskKind(kind: unknown): TaskKind {
  return kind === 'llm_prompt' ? 'llm_prompt' : 'source_monitor';
}

export function taskKindLabel(kind: TaskKind): string {
  return kind === 'llm_prompt' ? 'Prompt' : 'Webpage';
}

export function isScheduledTask(value: unknown): value is ScheduledTask {
  if (!value || typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  const kind = normalizeTaskKind(t.kind);
  if (
    typeof t.id !== 'string' ||
    t.id.trim().length === 0 ||
    typeof t.name !== 'string' ||
    t.name.trim().length === 0 ||
    typeof t.createdAt !== 'number' ||
    typeof t.enabled !== 'boolean'
  ) {
    return false;
  }
  if (kind === 'source_monitor') {
    return typeof t.sourceUrl === 'string';
  }
  return typeof t.analysisPrompt === 'string' || t.analysisPrompt == null;
}

/** @deprecated Prefer isScheduledTask */
export const isSourceMonitorTask = isScheduledTask;

export function isTaskRun(value: unknown): value is TaskRun {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === 'string' &&
    r.id.trim().length > 0 &&
    typeof r.taskId === 'string' &&
    typeof r.startedAt === 'number' &&
    typeof r.status === 'string'
  );
}

export async function getTasks(): Promise<ScheduledTask[]> {
  try {
    const raw = await AsyncStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isScheduledTask).map((t) => ({
      ...t,
      kind: normalizeTaskKind(t.kind),
      sourceUrl: typeof t.sourceUrl === 'string' ? t.sourceUrl : '',
      analysisPrompt: typeof t.analysisPrompt === 'string' ? t.analysisPrompt : '',
      schedule: normalizeSchedule(t.schedule),
      lastStatus: t.lastStatus || 'idle',
      nextRunAt:
        typeof t.nextRunAt === 'number' && t.nextRunAt > 0
          ? t.nextRunAt
          : computeNextRunAt(normalizeSchedule(t.schedule)),
    }));
  } catch (e) {
    console.error('Error loading tasks:', e);
    return [];
  }
}

export async function getTaskById(id: string): Promise<ScheduledTask | null> {
  const tasks = await getTasks();
  return tasks.find((t) => t.id === id) ?? null;
}

export async function saveTask(
  task: ScheduledTask,
  options?: { skipSchedule?: boolean },
): Promise<ScheduledTask> {
  if (!task?.id || !task.name?.trim()) {
    throw new Error('Invalid task: name is required');
  }
  const kind = normalizeTaskKind(task.kind);
  const prompt = (task.analysisPrompt || '').trim();
  if (!prompt) {
    throw new Error(
      kind === 'llm_prompt'
        ? 'Invalid task: prompt is required'
        : 'Invalid task: analysis prompt is required',
    );
  }
  if (kind === 'source_monitor' && !isValidHttpUrl(task.sourceUrl)) {
    throw new Error('Invalid task: source URL must be http(s)');
  }

  const schedule = normalizeSchedule(task.schedule);
  const now = Date.now();
  const normalized: ScheduledTask = {
    ...task,
    name: task.name.trim(),
    kind,
    sourceUrl: kind === 'source_monitor' ? task.sourceUrl.trim() : '',
    analysisPrompt: prompt,
    schedule,
    nextRunAt:
      typeof task.nextRunAt === 'number' && task.nextRunAt > 0
        ? task.nextRunAt
        : computeNextRunAt(schedule, now),
    lastStatus: task.lastStatus || 'idle',
    updatedAt: now,
    createdAt: task.createdAt || now,
  };

  const tasks = await getTasks();
  const idx = tasks.findIndex((t) => t.id === normalized.id);
  if (idx >= 0) {
    tasks[idx] = normalized;
  } else {
    tasks.push(normalized);
  }
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  if (!options?.skipSchedule) {
    if (
      normalized.enabled &&
      normalized.lastStatus !== 'running' &&
      normalized.nextRunAt > Date.now()
    ) {
      void scheduleNativeTask(normalized.id, normalized.nextRunAt);
    } else if (!normalized.enabled) {
      void cancelNativeTask(normalized.id);
    }
  }
  return normalized;
}

export async function removeTask(id: string): Promise<void> {
  void cancelNativeTask(id);
  const tasks = (await getTasks()).filter((t) => t.id !== id);
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  const runs = (await getAllTaskRuns()).filter((r) => r.taskId !== id);
  await AsyncStorage.setItem(TASK_RUNS_KEY, JSON.stringify(runs));
}

export async function setTaskEnabled(
  id: string,
  enabled: boolean,
): Promise<ScheduledTask | null> {
  const task = await getTaskById(id);
  if (!task) return null;
  const schedule = normalizeSchedule(task.schedule);
  const next: ScheduledTask = {
    ...task,
    enabled,
    schedule,
    // Keep list order stable when only toggling — don't bump updatedAt.
    nextRunAt: enabled
      ? computeNextRunAt(schedule, Date.now())
      : task.nextRunAt,
  };
  const tasks = await getTasks();
  const idx = tasks.findIndex((t) => t.id === next.id);
  if (idx >= 0) {
    tasks[idx] = next;
  } else {
    tasks.push(next);
  }
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  if (enabled && next.nextRunAt > Date.now()) {
    void scheduleNativeTask(next.id, next.nextRunAt);
  } else {
    void cancelNativeTask(next.id);
  }
  return next;
}

export async function replaceAllTasks(tasks: ScheduledTask[]): Promise<void> {
  const cleaned = (tasks || []).filter(isScheduledTask).map((t) => ({
    ...t,
    kind: normalizeTaskKind(t.kind),
    schedule: normalizeSchedule(t.schedule),
  }));
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(cleaned));
}

export async function mergeTasksImport(incoming: ScheduledTask[]): Promise<void> {
  const existing = await getTasks();
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const t of incoming.filter(isScheduledTask)) {
    byId.set(t.id, {
      ...t,
      kind: normalizeTaskKind(t.kind),
      schedule: normalizeSchedule(t.schedule),
    });
  }
  await AsyncStorage.setItem(TASKS_KEY, JSON.stringify([...byId.values()]));
}

export async function getAllTaskRuns(): Promise<TaskRun[]> {
  try {
    const raw = await AsyncStorage.getItem(TASK_RUNS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isTaskRun).map((r) => ({
      ...r,
      sourceUrl: typeof r.sourceUrl === 'string' ? r.sourceUrl : '',
    }));
  } catch (e) {
    console.error('Error loading task runs:', e);
    return [];
  }
}

export async function getRunsForTask(taskId: string): Promise<TaskRun[]> {
  const runs = await getAllTaskRuns();
  return runs
    .filter((r) => r.taskId === taskId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export async function getTaskRunById(id: string): Promise<TaskRun | null> {
  const runs = await getAllTaskRuns();
  return runs.find((r) => r.id === id) ?? null;
}

export async function saveTaskRun(run: TaskRun): Promise<TaskRun> {
  const normalized: TaskRun = {
    ...run,
    sourceUrl: run.sourceUrl || '',
    fetchedText: truncateStored(run.fetchedText, TASK_FETCH_STORE_MAX_CHARS),
    resultText: truncateStored(run.resultText, TASK_RESULT_MAX_CHARS),
    logs: Array.isArray(run.logs) ? run.logs.slice(-100) : run.logs,
  };
  const all = await getAllTaskRuns();
  const idx = all.findIndex((r) => r.id === normalized.id);
  if (idx >= 0) {
    all[idx] = normalized;
  } else {
    all.push(normalized);
  }
  const byTask = new Map<string, TaskRun[]>();
  for (const r of all) {
    const list = byTask.get(r.taskId) || [];
    list.push(r);
    byTask.set(r.taskId, list);
  }
  const capped: TaskRun[] = [];
  for (const [, list] of byTask) {
    list.sort((a, b) => b.startedAt - a.startedAt);
    capped.push(...list.slice(0, TASK_RUNS_PER_TASK));
  }
  capped.sort((a, b) => b.startedAt - a.startedAt);
  await AsyncStorage.setItem(TASK_RUNS_KEY, JSON.stringify(capped));
  return normalized;
}

export async function replaceAllTaskRuns(runs: TaskRun[]): Promise<void> {
  const cleaned = (runs || []).filter(isTaskRun).map((r) => ({
    ...r,
    sourceUrl: r.sourceUrl || '',
    fetchedText: truncateStored(r.fetchedText, TASK_FETCH_STORE_MAX_CHARS),
    resultText: truncateStored(r.resultText, TASK_RESULT_MAX_CHARS),
  }));
  await AsyncStorage.setItem(TASK_RUNS_KEY, JSON.stringify(cleaned));
}

export async function mergeTaskRunsImport(incoming: TaskRun[]): Promise<void> {
  const existing = await getAllTaskRuns();
  const byId = new Map(existing.map((r) => [r.id, r]));
  for (const r of incoming.filter(isTaskRun)) {
    byId.set(r.id, r);
  }
  await replaceAllTaskRuns([...byId.values()]);
}

export async function getDueTasks(nowMs: number = Date.now()): Promise<ScheduledTask[]> {
  const tasks = await getTasks();
  return tasks.filter(
    (t) =>
      t.enabled &&
      t.lastStatus !== 'running' &&
      typeof t.nextRunAt === 'number' &&
      t.nextRunAt <= nowMs,
  );
}

export async function countEnabledTasks(): Promise<number> {
  const tasks = await getTasks();
  return tasks.filter((t) => t.enabled).length;
}

const DEFAULT_SOURCE_PROMPT =
  'Summarize the important updates from this source. Call out anything new, urgent, or actionable.';
const DEFAULT_LLM_PROMPT =
  'Write a short original poem for this morning. Keep it warm and vivid, about 8–12 lines.';

export function buildNewScheduledTask(
  partial: Partial<ScheduledTask> & { name: string },
): ScheduledTask {
  const kind = normalizeTaskKind(partial.kind ?? 'llm_prompt');
  const schedule = normalizeSchedule(partial.schedule);
  const now = Date.now();
  const defaultPrompt =
    kind === 'llm_prompt' ? DEFAULT_LLM_PROMPT : DEFAULT_SOURCE_PROMPT;
  return {
    id: partial.id || generateTaskId(),
    name: partial.name.trim(),
    kind,
    enabled: partial.enabled !== false,
    sourceUrl:
      kind === 'source_monitor' ? (partial.sourceUrl || '').trim() : '',
    schedule,
    analysisPrompt: partial.analysisPrompt?.trim() || defaultPrompt,
    personaId: partial.personaId ?? null,
    modelFileName: partial.modelFileName ?? null,
    nextRunAt:
      typeof partial.nextRunAt === 'number' && partial.nextRunAt > 0
        ? partial.nextRunAt
        : computeNextRunAt(schedule, now),
    lastRunAt: partial.lastRunAt ?? null,
    lastStatus: partial.lastStatus || 'idle',
    createdAt: partial.createdAt || now,
    updatedAt: now,
  };
}

/** @deprecated Prefer buildNewScheduledTask */
export function buildNewSourceMonitorTask(
  partial: Partial<ScheduledTask> & { name: string; sourceUrl?: string },
): ScheduledTask {
  return buildNewScheduledTask({
    ...partial,
    kind: partial.kind ?? 'source_monitor',
    sourceUrl: partial.sourceUrl || '',
  });
}

export { computeNextRunAfter, computeNextRunAt };
