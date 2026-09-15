/**
 * Native Android bridge for robust AlarmManager task scheduling and notifications.
 * Provides safe fallbacks for iOS and development environments.
 */

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getTasks, ScheduledTask } from './taskService';

interface TaskSchedulerNative {
  scheduleTaskAlarm(taskId: string, triggerAtMillis: number): Promise<boolean>;
  cancelTaskAlarm(taskId: string): Promise<boolean>;
  canScheduleExactAlarms(): Promise<boolean>;
  postNotification(
    title: string,
    message: string,
    taskId: string | null,
    runId: string | null,
    isSuccess: boolean,
  ): Promise<boolean>;
  checkNotificationPermission(): Promise<boolean>;
  requestNotificationPermission(): Promise<boolean>;
  getInitialNotification(): Promise<{
    openPage?: string;
    taskId?: string;
    runId?: string;
  } | null>;
}

const NativeScheduler: TaskSchedulerNative | null =
  Platform.OS === 'android' && NativeModules.TaskScheduler
    ? (NativeModules.TaskScheduler as TaskSchedulerNative)
    : null;

/**
 * Schedule a task with the native OS AlarmManager at exact timestamp `triggerAtMs`.
 */
export async function scheduleNativeTask(
  taskId: string,
  triggerAtMs: number,
): Promise<boolean> {
  if (!NativeScheduler) return false;
  try {
    const delay = triggerAtMs - Date.now();
    // If due in the past or immediately, trigger within 1 second
    const target = delay > 0 ? triggerAtMs : Date.now() + 1000;
    return await NativeScheduler.scheduleTaskAlarm(taskId, target);
  } catch (err) {
    console.warn('[nativeTaskScheduler] scheduleTaskAlarm failed', taskId, err);
    return false;
  }
}

/**
 * Cancel an existing OS alarm for a task.
 */
export async function cancelNativeTask(taskId: string): Promise<boolean> {
  if (!NativeScheduler) return false;
  try {
    return await NativeScheduler.cancelTaskAlarm(taskId);
  } catch (err) {
    console.warn('[nativeTaskScheduler] cancelTaskAlarm failed', taskId, err);
    return false;
  }
}

/**
 * Check if Android 12+ device permits scheduling exact alarms.
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (!NativeScheduler) return true;
  try {
    return await NativeScheduler.canScheduleExactAlarms();
  } catch {
    return true;
  }
}

/**
 * Sync all tasks in storage with the native Android AlarmManager.
 * Arms alarms for all enabled tasks and cancels any disabled ones.
 */
export async function syncAllScheduledTasks(): Promise<number> {
  if (!NativeScheduler) return 0;
  try {
    const tasks = await getTasks();
    let scheduledCount = 0;

    for (const task of tasks) {
      if (task.enabled) {
        let triggerAt = task.nextRunAt;
        if (!triggerAt || triggerAt <= Date.now()) {
          // If due time is expired or unset, schedule immediately / next slot
          triggerAt = Date.now() + 2000;
        }
        await scheduleNativeTask(task.id, triggerAt);
        scheduledCount += 1;
      } else {
        await cancelNativeTask(task.id);
      }
    }

    return scheduledCount;
  } catch (err) {
    console.warn('[nativeTaskScheduler] syncAllScheduledTasks failed', err);
    return 0;
  }
}

/**
 * Check if the app has permission to post notifications (Android 13+).
 */
export async function checkNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;

  try {
    const hasPermission = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return hasPermission;
  } catch {
    if (NativeScheduler) {
      return await NativeScheduler.checkNotificationPermission();
    }
    return true;
  }
}

/**
 * Request notification permission from the user (Android 13+).
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;

  try {
    const status = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      {
        title: 'Task Notifications',
        message: 'Allow OFLN to notify you when scheduled offline tasks complete.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    return status === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    if (NativeScheduler) {
      return await NativeScheduler.requestNotificationPermission();
    }
    return false;
  }
}

/**
 * Post a native Android notification when a task completes or fails.
 */
export async function postNativeTaskNotification(params: {
  title: string;
  message: string;
  taskId?: string | null;
  runId?: string | null;
  isSuccess: boolean;
}): Promise<boolean> {
  if (!NativeScheduler) return false;
  try {
    return await NativeScheduler.postNotification(
      params.title,
      params.message,
      params.taskId || null,
      params.runId || null,
      params.isSuccess,
    );
  } catch (err) {
    console.warn('[nativeTaskScheduler] postNotification failed', err);
    return false;
  }
}

/**
 * Check if the app was launched by tapping a task completion notification.
 */
export async function getInitialTaskNotification(): Promise<{
  openPage?: string;
  taskId?: string;
  runId?: string;
} | null> {
  if (!NativeScheduler) return null;
  try {
    return await NativeScheduler.getInitialNotification();
  } catch {
    return null;
  }
}
