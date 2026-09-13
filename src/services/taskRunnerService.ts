/**
 * Run Source Monitor tasks: fetch → on-device LLM analysis → persist.
 */

import { Platform } from 'react-native';
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
import {
  computeNextRunAfter,
  generateTaskRunId,
  getDueTasks,
  getTaskById,
  saveTask,
  saveTaskRun,
  type SourceMonitorTask,
  type TaskRun,
} from './taskService';
import type { ChatMessage, StreamCallbacks } from '../types/ai';

let runnerBusy = false;

export function isTaskRunnerBusy(): boolean {
  return runnerBusy;
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
): Promise<{ fileName: string; loadedByRunner: boolean }> {
  const status = llamaProvider.getStatus();
  const currentPath = status.modelPath;
  const currentName = currentPath
    ? currentPath.split(/[/\\]/).pop() || null
    : null;

  const preferred =
    (modelFileName && modelFileName.trim()) ||
    (fallbackFileName && fallbackFileName.trim()) ||
    currentName;

  if (!preferred) {
    throw new Error('No model available. Download a GGUF in Models first.');
  }

  const path = `${RNFS.DocumentDirectoryPath}/${preferred}`;
  const exists = await RNFS.exists(path);
  if (!exists) {
    throw new Error(`Model file missing: ${preferred}`);
  }

  if (
    llamaProvider.isReady() &&
    currentName === preferred &&
    llamaProvider.getNativeContext()
  ) {
    return { fileName: preferred, loadedByRunner: false };
  }

  const ok = await llamaProvider.loadModel({ modelPath: path });
  if (!ok || !llamaProvider.getNativeContext()) {
    const err = llamaProvider.getStatus().error || 'Model failed to load';
    throw new Error(err);
  }
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
  /** When true, skip FGS (already inside one / foreground UI). */
  skipForegroundService?: boolean;
  /** Fallback model if task has none set. */
  fallbackModelFileName?: string | null;
};

async function runOneTaskInternal(
  task: SourceMonitorTask,
  options: RunTaskOptions = {},
): Promise<TaskRun> {
  const startedAt = Date.now();
  const runId = generateTaskRunId();
  let run: TaskRun = {
    id: runId,
    taskId: task.id,
    taskName: task.name,
    startedAt,
    status: 'running',
    sourceUrl: task.sourceUrl,
    modelFileName: task.modelFileName || null,
  };

  await saveTaskRun(run);
  await saveTask({
    ...task,
    lastStatus: 'running',
    updatedAt: Date.now(),
  });

  let loadedByRunner = false;
  try {
    const isLlmOnly = task.kind === 'llm_prompt';
    let fetchedText: string | null = null;

    if (!isLlmOnly) {
      const fetched = await fetchSourceText(task.sourceUrl);
      fetchedText = fetched.text;
      run = {
        ...run,
        fetchedText,
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
      run = {
        ...run,
        status: 'pending_analysis',
        finishedAt: Date.now(),
        fetchedText,
      };
      await saveTaskRun(run);
      await saveTask({
        ...task,
        lastStatus: 'success',
        lastRunAt: Date.now(),
        nextRunAt: computeNextRunAfter(task.schedule, Date.now()),
        updatedAt: Date.now(),
      });
      return run;
    }

    const persona = await resolvePersona(task.personaId);
    const { fileName, loadedByRunner: didLoad } = await ensureModelLoaded(
      task.modelFileName,
      options.fallbackModelFileName,
    );
    loadedByRunner = didLoad;

    const userContent = isLlmOnly
      ? task.analysisPrompt.trim()
      : `${task.analysisPrompt.trim() || 'Summarize the important updates.'}\n\n` +
        wrapFetchedForPrompt(task.name, task.sourceUrl, fetchedText || '');

    const resultText = await runAnalysisCompletion({
      modelFileName: fileName,
      persona,
      userContent,
      heuristicUserText: task.analysisPrompt,
    });

    run = {
      ...run,
      status: 'success',
      resultText,
      modelFileName: fileName,
      finishedAt: Date.now(),
    };
    await saveTaskRun(run);
    await saveTask({
      ...task,
      lastStatus: 'success',
      lastRunAt: Date.now(),
      nextRunAt: computeNextRunAfter(task.schedule, Date.now()),
      modelFileName: task.modelFileName || fileName,
      updatedAt: Date.now(),
    });
    return run;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    run = {
      ...run,
      status: 'failed',
      error: message,
      finishedAt: Date.now(),
    };
    await saveTaskRun(run);
    await saveTask({
      ...task,
      lastStatus: 'failed',
      lastRunAt: Date.now(),
      nextRunAt: computeNextRunAfter(task.schedule, Date.now()),
      updatedAt: Date.now(),
    });
    return run;
  } finally {
    if (loadedByRunner) {
      try {
        // Only unload if we loaded solely for this task and nothing else needs it.
        // Leaving loaded is safer for chat UX; unload to free RAM after BG runs on Android.
        if (Platform.OS === 'android' && !options.skipForegroundService) {
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
  taskDesc: 'Running a scheduled task…',
  taskIcon: {
    name: 'ic_launcher',
    type: 'mipmap',
  },
  color: '#C9A227',
  linkingURI: 'ofln://tasks',
  parameters: {
    delay: 1000,
  },
};

async function withAndroidForegroundService<T>(fn: () => Promise<T>): Promise<T> {
  if (Platform.OS !== 'android') {
    return fn();
  }
  if (BackgroundJob.isRunning()) {
    return fn();
  }

  // On Android, start() returns once the FGS is up; the registered headless
  // task only keeps the service company. Run real work in *this* JS context.
  await BackgroundJob.start(async () => {
    while (BackgroundJob.isRunning()) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }, {
    ...fgsOptions,
    foregroundServiceType: ['dataSync'],
  });

  try {
    return await fn();
  } finally {
    try {
      await BackgroundJob.stop();
    } catch {
      /* ignore */
    }
  }
}

/**
 * Run a single task by id (manual "Run now" or catch-up).
 */
export async function runTaskById(
  taskId: string,
  options: RunTaskOptions = {},
): Promise<TaskRun | null> {
  if (runnerBusy) {
    throw new Error('Another task is already running');
  }
  const task = await getTaskById(taskId);
  if (!task) return null;

  runnerBusy = true;
  try {
    const exec = () => runOneTaskInternal(task, options);
    if (options.skipForegroundService || Platform.OS !== 'android') {
      return await exec();
    }
    return await withAndroidForegroundService(exec);
  } finally {
    runnerBusy = false;
  }
}

/**
 * Finish runs stuck in pending_analysis (iOS BG deferred LLM).
 */
export async function finishPendingAnalysisRuns(
  options: RunTaskOptions = {},
): Promise<number> {
  const { getAllTaskRuns } = await import('./taskService');
  const pending = (await getAllTaskRuns()).filter(
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
    try {
      const persona = await resolvePersona(task.personaId);
      const { fileName } = await ensureModelLoaded(
        task.modelFileName,
        options.fallbackModelFileName,
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
      await saveTaskRun({
        ...run,
        status: 'success',
        resultText,
        modelFileName: fileName,
        finishedAt: Date.now(),
        error: null,
      });
      await saveTask({
        ...task,
        lastStatus: 'success',
        lastRunAt: Date.now(),
        updatedAt: Date.now(),
      });
      finished += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await saveTaskRun({
        ...run,
        status: 'failed',
        error: message,
        finishedAt: Date.now(),
      });
      await saveTask({
        ...task,
        lastStatus: 'failed',
        lastRunAt: Date.now(),
        updatedAt: Date.now(),
      });
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
      await runTaskById(task.id, options);
      count += 1;
    } catch (e) {
      console.warn('[taskRunner] due task failed', task.id, e);
    }
  }
  await finishPendingAnalysisRuns(options);
  return count;
}
