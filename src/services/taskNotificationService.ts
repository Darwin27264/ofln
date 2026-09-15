/**
 * Formats and dispatches user notifications upon task execution completion or failure.
 */

import { postNativeTaskNotification } from './nativeTaskScheduler';
import type { ScheduledTask, TaskRun } from './taskService';

function cleanNotificationSnippet(text: string | null | undefined, maxLen = 140): string {
  if (!text) return '';
  const cleaned = text
    .replace(/^#+\s+/gm, '') // strip markdown headers
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1') // strip bold/italics
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // strip links
    .replace(/\s+/g, ' ') // collapse whitespaces
    .trim();

  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export async function notifyTaskFinished(
  task: ScheduledTask,
  run: TaskRun,
): Promise<boolean> {
  const isSuccess = run.status === 'success';
  const isPending = run.status === 'pending_analysis';

  let title: string;
  let message: string;

  if (isSuccess) {
    title = `Task Completed: ${task.name}`;
    message =
      cleanNotificationSnippet(run.resultText) ||
      'Analysis finished successfully.';
  } else if (isPending) {
    title = `Task Ready for Analysis: ${task.name}`;
    message = 'Content fetched. Open app to complete offline analysis.';
  } else {
    title = `Task Failed: ${task.name}`;
    message = run.error ? cleanNotificationSnippet(run.error) : 'Task encountered an error.';
  }

  return await postNativeTaskNotification({
    title,
    message,
    taskId: task.id,
    runId: run.id,
    isSuccess: isSuccess || isPending,
  });
}
