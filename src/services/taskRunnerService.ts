/**
 * Run Source Monitor & Scheduled LLM tasks: fetch → on-device LLM analysis → persist → notify.
 * Robust execution with structured logging, safe model fallback, and Android 12+ background compatibility.
 */

import { AppState, Platform } from 'react-native';
import RNFS from 'react-native-fs';
import BackgroundJob from 'react-native-background-actions';

import { nativeCompletion } from './aiChatService';
import { getModelSettings } from './modelSettingsService';
import {
  buildPersonaSystemPrompt,
  getPersonas,
  type Persona,
} from './personaService';
import { llamaProvider } from '../providers/llamaProvider';
import { fetchSourceText } from './sourceFetchService';
import { listStoredGgufModels } from './modelStorageService';
import {
  computeNextRunAfter,
  generateTaskRunId,
  getAllTaskRuns,
  getDueTasks,
  getTaskById,
  saveTask,
  saveTaskRun,
  type SourceMonitorTask,
  type TaskRun,
  type TaskTriggerType,
} from './taskService';
import { createTaskLogger, type TaskLogger } from './taskLogger';
import { notifyTaskFinished } from './taskNotificationService';
import type { ChatMessage, StreamCallbacks } from '../types/ai';

let runnerBusy = false;
const activeRunningTasks = new Set<string>();
const recentRunTimestamps = new Map<string, number>();
const DEBOUNCE_COOLDOWN_MS = 60_000;

export function isTaskRunnerBusy(): boolean {
  return runnerBusy || activeRunningTasks.size > 0;
}

function wrapFetchedForPrompt(taskName: string, sourceUrl: string, text: string): string {
  return (
    `[Source monitor: ${taskName}]\n` +
    `[URL: ${sourceUrl}]\n` +
    `[Fetched content]\n${text}\n` +
    `[End fetched content]`
  );
}

async function resolvePersona(personaId?: string | null): Promise<Persona | null> {
  if (!personaId) return null;
  const personas = await getPersonas();
  return personas.find((p) => p.id === personaId) ?? null;
}

async function ensureModelLoaded(
  modelFileName: string | null | undefined,
  fallbackFileName: string | null | undefined,
  logger?: TaskLogger,
): Promise<{ fileName: string; loadedByRunner: boolean }> {
  const status = llamaProvider.getStatus();
  const currentPath = status.modelPath;
  const currentName = currentPath
    ? currentPath.split(/[/\\]/).pop() || null
    : null;

  let preferred =
    (modelFileName && modelFileName.trim()) ||
    (fallbackFileName && fallbackFileName.trim()) ||
    currentName;

  if (!preferred) {
    logger?.info('Model not specified on task. Discovering installed models...');
    try {
      const stored = await listStoredGgufModels();
      if (stored && stored.length > 0) {
        preferred = stored[0].fileName;
        logger?.info(`Auto-detected model: ${preferred}`);
      }
    } catch {
      /* ignore */
    }
  }

  if (!preferred) {
    throw new Error('No model available. Download a GGUF model in the Models tab first.');
  }

  let path = `${RNFS.DocumentDirectoryPath}/${preferred}`;
  let exists = await RNFS.exists(path);
  if (!exists) {
    logger?.warn(`Target model missing: ${preferred}. Looking for alternative installed models...`);
    try {
      const stored = await listStoredGgufModels();
      if (stored && stored.length > 0) {
        preferred = stored[0].fileName;
        path = `${RNFS.DocumentDirectoryPath}/${preferred}`;
        exists = await RNFS.exists(path);
        logger?.info(`Fallback model selected: ${preferred}`);
      }
    } catch {
      /* ignore */
    }
  }

  if (!exists) {
    throw new Error(`Model file missing: ${preferred}`);
  }

  if (
    llamaProvider.isReady() &&
    currentName === preferred &&
    llamaProvider.getNativeContext()
  ) {
    logger?.info(`Using currently active model: ${preferred}`);
    return { fileName: preferred, loadedByRunner: false };
  }

  logger?.info(`Loading model into memory: ${preferred}...`);
  const ok = await llamaProvider.loadModel({ modelPath: path });
  if (!ok || !llamaProvider.getNativeContext()) {
    const err = llamaProvider.getStatus().error || 'Model failed to load';
    throw new Error(err);
  }
  logger?.success(`Model loaded successfully: ${preferred}`);
  return { fileName: preferred, loadedByRunner: true };
}

async function runAnalysisCompletion(opts: {
  modelFileName: string;
  persona: Persona | null;
  userContent: string;
  heuristicUserText?: string;
}): Promise<string> {
  const settings = await getModelSettings(opts.modelFileName);
  const systemPrompt = buildPersonaSystemPrompt(
    opts.persona,
    settings.systemPrompt,
  );

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: opts.userContent },
  ];

  const ctx = llamaProvider.getNativeContext();
  if (!ctx) {
    throw new Error('Model context is not ready');
  }

  const noop: StreamCallbacks = {};
  const result = await nativeCompletion(
    ctx,
    messages,
    opts.modelFileName,
    settings,
    noop,
    undefined,
    {
      heuristicMode: 'balanced',
      heuristicUserText: opts.heuristicUserText || opts.userContent,
    },
  );

  const text = (result?.text || '').trim();
  if (!text) {
    throw new Error('Model returned an empty analysis');
  }
  return text;
}

export type RunTaskOptions = {
  /** Prefer LLM even on short iOS BG windows (may fail). */
  forceAnalysis?: boolean;
  /** When true, skip FGS (already inside one / foreground UI / headless). */
  skipForegroundService?: boolean;
  /** Fallback model if task has none set. */
  fallbackModelFileName?: string | null;
  /** Origin trigger for logging and notification context. */
  trigger?: TaskTriggerType;
};

async function runOneTaskInternal(
  task: SourceMonitorTask,
  options: RunTaskOptions = {},
): Promise<TaskRun> {
  const startedAt = Date.now();
  const runId = generateTaskRunId();
  const trigger = options.trigger || 'manual';
  const logger = createTaskLogger();
  const nextOccurrence = computeNextRunAfter(task.schedule, startedAt);

  logger.info(`Task execution started: "${task.name}"`, {
    taskId: task.id,
    kind: task.kind,
    trigger,
  });

  let run: TaskRun = {
    id: runId,
    taskId: task.id,
    taskName: task.name,
    startedAt,
    status: 'running',
    sourceUrl: task.sourceUrl,
    modelFileName: task.modelFileName || null,
    trigger,
    logs: logger.getEntries(),
  };

  await saveTaskRun(run);
  // Advance nextRunAt immediately so no subsequent processDueTasks or catch-up considers it due
  await saveTask(
    {
      ...task,
      lastStatus: 'running',
      nextRunAt: nextOccurrence,
      updatedAt: startedAt,
    },
    { skipSchedule: true },
  );

  let loadedByRunner = false;
  try {
    const isLlmOnly = task.kind === 'llm_prompt';
    let fetchedText: string | null = null;

    if (!isLlmOnly) {
      logger.info(`Fetching source text from ${task.sourceUrl}...`);
      const fetchStart = Date.now();
      const fetched = await fetchSourceText(task.sourceUrl);
      fetchedText = fetched.text;
      const fetchDuration = Date.now() - fetchStart;
      logger.success(
        `Fetched ${(fetchedText || '').length} characters in ${fetchDuration}ms`,
      );
      run = {
        ...run,
        fetchedText,
        logs: logger.getEntries(),
      };
      await saveTaskRun(run);
    }

    const isIosBg =
      Platform.OS === 'ios' &&
      !options.forceAnalysis &&
      !options.skipForegroundService;

    // iOS background windows are short — for source_monitor, store fetch and defer LLM.
    // For llm_prompt there is nothing to prefetch; defer the whole run as pending_analysis.
    if (isIosBg && !BackgroundJob.isRunning()) {
      logger.warn(
        'iOS background execution window is limited; deferring LLM inference until app is active.',
      );
      run = {
        ...run,
        status: 'pending_analysis',
        finishedAt: Date.now(),
        fetchedText,
        logs: logger.getEntries(),
      };
      await saveTaskRun(run);
      await saveTask({
        ...task,
        lastStatus: 'success',
        lastRunAt: Date.now(),
        nextRunAt: computeNextRunAfter(task.schedule, Date.now()),
        updatedAt: Date.now(),
      });
      void notifyTaskFinished(task, run);
      return run;
    }

    logger.info('Resolving persona and model configuration...');
    const persona = await resolvePersona(task.personaId);
    if (persona) {
      logger.info(`Using persona: "${persona.name}"`);
    }

    const { fileName, loadedByRunner: didLoad } = await ensureModelLoaded(
      task.modelFileName,
      options.fallbackModelFileName,
      logger,
    );
    loadedByRunner = didLoad;

    const userContent = isLlmOnly
      ? task.analysisPrompt.trim()
      : `${task.analysisPrompt.trim() || 'Summarize the important updates.'}\n\n` +
        wrapFetchedForPrompt(task.name, task.sourceUrl, fetchedText || '');

    logger.info(`Starting LLM inference with model: ${fileName}...`);
    const inferStart = Date.now();
    const resultText = await runAnalysisCompletion({
      modelFileName: fileName,
      persona,
      userContent,
      heuristicUserText: task.analysisPrompt,
    });
    const inferDuration = Date.now() - inferStart;
    logger.success(
      `Inference finished: generated ${resultText.length} characters in ${inferDuration}ms`,
    );

    logger.info('Saving results and scheduling next occurrence...');
    recentRunTimestamps.set(task.id, Date.now());
    run = {
      ...run,
      status: 'success',
      resultText,
      modelFileName: fileName,
      finishedAt: Date.now(),
      logs: logger.getEntries(),
    };
    await saveTaskRun(run);
    await saveTask({
      ...task,
      lastStatus: 'success',
      lastRunAt: Date.now(),
      nextRunAt: nextOccurrence,
      modelFileName: task.modelFileName || fileName,
      updatedAt: Date.now(),
    });

    logger.success('Task finished successfully.');
    run.logs = logger.getEntries();
    await saveTaskRun(run);

    void notifyTaskFinished(task, run);
    return run;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(`Task execution failed: ${message}`, e);
    recentRunTimestamps.set(task.id, Date.now());

    run = {
      ...run,
      status: 'failed',
      error: message,
      finishedAt: Date.now(),
      logs: logger.getEntries(),
    };
    await saveTaskRun(run);
    await saveTask({
      ...task,
      lastStatus: 'failed',
      lastRunAt: Date.now(),
      nextRunAt: nextOccurrence,
      updatedAt: Date.now(),
    });

    void notifyTaskFinished(task, run);
    return run;
  } finally {
    if (loadedByRunner) {
      try {
        // Only unload if we loaded solely for this task and nothing else needs it.
        // Free RAM after background runs on Android so memory is not held.
        if (
          Platform.OS === 'android' &&
          (AppState.currentState !== 'active' || !options.skipForegroundService)
        ) {
          logger.info('Unloading model to free memory after background run.');
          await llamaProvider.unloadModel();
        }
      } catch {
        /* ignore */
      }
    }
  }
}

const fgsOptions = {
  taskName: 'OFLN Tasks',
  taskTitle: 'OFLN',
  taskDesc: 'Running scheduled task…',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#D48E2F',
  linkingURI: 'ofln://tasks',
  parameters: {
    delay: 1000,
  },
};

async function withAndroidForegroundService<T>(fn: () => Promise<T>): Promise<T> {
  if (Platform.OS !== 'android') {
    return fn();
  }
  // Android 12+ blocks starting a foreground service while in the background.
  // HeadlessJsTaskService already holds the CPU WakeLock for background runs.
  // Only use react-native-background-actions if the app is active/foreground.
  if (AppState.currentState !== 'active' || BackgroundJob.isRunning()) {
    return fn();
  }

  let started = false;
  try {
    await BackgroundJob.start(
      async () => {
        while (BackgroundJob.isRunning()) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      },
      {
        ...fgsOptions,
        foregroundServiceType: ['dataSync'],
      },
    );
    started = true;
  } catch (err) {
    console.warn('[taskRunner] Foreground service start skipped or restricted:', err);
  }

  try {
    return await fn();
  } finally {
    if (started) {
      try {
        await BackgroundJob.stop();
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Run a single task by id (manual "Run now", native alarm, or catch-up).
 */
export async function runTaskById(
  taskId: string,
  options: RunTaskOptions = {},
): Promise<TaskRun | null> {
  if (runnerBusy || activeRunningTasks.has(taskId)) {
    console.log(`[taskRunner] Task ${taskId} is already running. Skipping duplicate run.`);
    return null;
  }
  const task = await getTaskById(taskId);
  if (!task) return null;

  // Suppress duplicate automatic runs if the task ran within the cooldown window
  if (options.trigger !== 'manual') {
    const lastRunTime = recentRunTimestamps.get(taskId) || task.lastRunAt || 0;
    if (Date.now() - lastRunTime < DEBOUNCE_COOLDOWN_MS) {
      console.log(
        `[taskRunner] Task "${task.name}" ran ${Math.round((Date.now() - lastRunTime) / 1000)}s ago. Suppressing duplicate trigger.`,
      );
      return null;
    }
  }

  runnerBusy = true;
  activeRunningTasks.add(taskId);
  try {
    const exec = () => runOneTaskInternal(task, options);
    if (options.skipForegroundService || Platform.OS !== 'android') {
      return await exec();
    }
    return await withAndroidForegroundService(exec);
  } finally {
    runnerBusy = false;
    activeRunningTasks.delete(taskId);
  }
}

/**
 * Finish runs stuck in pending_analysis (iOS BG deferred LLM).
 */
export async function finishPendingAnalysisRuns(
  options: RunTaskOptions = {},
): Promise<number> {
  const allRuns = await getAllTaskRuns();
  const pending = allRuns.filter(
    (r) => r.status === 'pending_analysis',
  );
  let finished = 0;
  for (const run of pending) {
    if (runnerBusy) break;
    const task = await getTaskById(run.taskId);
    if (!task) continue;
    // Source monitor needs fetched text; llm_prompt does not.
    if (task.kind !== 'llm_prompt' && !run.fetchedText) continue;
    runnerBusy = true;
    const logger = createTaskLogger(run.logs || []);
    logger.info('Resuming deferred LLM analysis in foreground...');

    try {
      const persona = await resolvePersona(task.personaId);
      const { fileName } = await ensureModelLoaded(
        task.modelFileName,
        options.fallbackModelFileName,
        logger,
      );
      const userContent =
        task.kind === 'llm_prompt'
          ? task.analysisPrompt.trim()
          : `${task.analysisPrompt.trim() || 'Summarize the important updates.'}\n\n` +
            wrapFetchedForPrompt(
              task.name,
              run.sourceUrl,
              run.fetchedText || '',
            );
      const resultText = await runAnalysisCompletion({
        modelFileName: fileName,
        persona,
        userContent,
        heuristicUserText: task.analysisPrompt,
      });

      logger.success('Deferred analysis completed successfully.');
      const updatedRun: TaskRun = {
        ...run,
        status: 'success',
        resultText,
        modelFileName: fileName,
        finishedAt: Date.now(),
        error: null,
        logs: logger.getEntries(),
      };
      await saveTaskRun(updatedRun);
      await saveTask({
        ...task,
        lastStatus: 'success',
        lastRunAt: Date.now(),
        updatedAt: Date.now(),
      });
      void notifyTaskFinished(task, updatedRun);
      finished += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logger.error(`Deferred analysis failed: ${message}`, e);
      const updatedRun: TaskRun = {
        ...run,
        status: 'failed',
        error: message,
        finishedAt: Date.now(),
        logs: logger.getEntries(),
      };
      await saveTaskRun(updatedRun);
      await saveTask({
        ...task,
        lastStatus: 'failed',
        lastRunAt: Date.now(),
        updatedAt: Date.now(),
      });
      void notifyTaskFinished(task, updatedRun);
    } finally {
      runnerBusy = false;
    }
  }
  return finished;
}

/**
 * Process all due enabled tasks (background wake or AppState catch-up).
 */
export async function processDueTasks(
  options: RunTaskOptions = {},
): Promise<number> {
  if (runnerBusy) return 0;
  const due = await getDueTasks();
  if (due.length === 0) {
    await finishPendingAnalysisRuns(options);
    return 0;
  }

  let count = 0;
  for (const task of due) {
    if (runnerBusy) break;
    try {
      await runTaskById(task.id, {
        ...options,
        trigger: options.trigger || 'scheduled_native',
      });
      count += 1;
    } catch (e) {
      console.warn('[taskRunner] due task failed', task.id, e);
    }
  }
  await finishPendingAnalysisRuns(options);
  return count;
}
