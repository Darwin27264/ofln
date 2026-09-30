/**
 * Native Android bridge for robust AlarmManager task scheduling and notifications.
 * Provides safe fallbacks for iOS and development environments.
 */

import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { getTasks, saveTask, ScheduledTask } from './taskService';
import { computeNextRunAfter } from '../utils/taskScheduleHelpers';

interface TaskSchedulerNative {
  scheduleTaskAlarm(taskId: string, triggerAtMillis: number): Promise<boolean>;
  cancelTaskAlarm(taskId: string): Promise<boolean>;
  canScheduleExactAlarms(): Promise<boolean>;
  openExactAlarmSettings(): Promise<boolean>;
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
  isIgnoringBatteryOptimizations(): Promise<boolean>;
  openBatteryOptimizationSettings(): Promise<boolean>;
}

const NativeScheduler: TaskSchedulerNative | null =
  Platform.OS === 'android' && NativeModules.TaskScheduler
    ? (NativeModules.TaskScheduler as TaskSchedulerNative)
    : null;

interface IosTaskNotifications {
  checkPermission(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  postNotification(
    title: string,
    message: string,
    taskId: string | null,
    runId: string | null,
    isSuccess: boolean,
  ): Promise<boolean>;
}

const IosNotifications: IosTaskNotifications | null =
  Platform.OS === 'ios' && NativeModules.TaskNotifications
    ? (NativeModules.TaskNotifications as IosTaskNotifications)
    : null;

type PermissionAlert = (
  title: string,
  message: string,
  buttons: Array<{
    text: string;
    style?: 'cancel' | 'destructive' | 'default';
    onPress?: () => void;
  }>,
) => void;

/**
 * Schedule a task with the native OS AlarmManager at exact timestamp `triggerAtMs`.
 */
export async function scheduleNativeTask(
  taskId: string,
  triggerAtMs: number,
): Promise<boolean> {
  if (!NativeScheduler) return false;
  // Never schedule an alarm in the past
  if (!triggerAtMs || triggerAtMs <= Date.now()) {
    return false;
  }
  try {
    return await NativeScheduler.scheduleTaskAlarm(taskId, triggerAtMs);
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

/** Open the system Alarms & reminders screen for this app. */
export async function openExactAlarmSettings(): Promise<boolean> {
  if (!NativeScheduler) return false;
  try {
    return await NativeScheduler.openExactAlarmSettings();
  } catch (err) {
    console.warn('[nativeTaskScheduler] openExactAlarmSettings failed', err);
    return false;
  }
}

/** Check if battery optimizations are disabled for this app. */
export async function isIgnoringBatteryOptimizations(): Promise<boolean> {
  if (!NativeScheduler) return true;
  try {
    return await NativeScheduler.isIgnoringBatteryOptimizations();
  } catch {
    return true;
  }
}

/** Open system battery optimization / background restrictions settings. */
export async function openBatteryOptimizationSettings(): Promise<boolean> {
  if (!NativeScheduler) return false;
  try {
    return await NativeScheduler.openBatteryOptimizationSettings();
  } catch (err) {
    console.warn('[nativeTaskScheduler] openBatteryOptimizationSettings failed', err);
    return false;
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
    const now = Date.now();

    for (const task of tasks) {
      if (task.enabled && task.lastStatus !== 'running') {
        let triggerAt = task.nextRunAt;
        if (!triggerAt || triggerAt <= now) {
          // Compute the true next future occurrence — never set artificial immediate alarms
          triggerAt = computeNextRunAfter(task.schedule, now);
          task.nextRunAt = triggerAt;
          await saveTask(task, { skipSchedule: true });
        }
        const ok = await scheduleNativeTask(task.id, triggerAt);
        if (ok) scheduledCount += 1;
      } else if (!task.enabled) {
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
  if (Platform.OS === 'ios') {
    if (!IosNotifications) return false;
    try {
      return await IosNotifications.checkPermission();
    } catch {
      return false;
    }
  }
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
  if (Platform.OS === 'ios') {
    if (!IosNotifications) return false;
    try {
      return await IosNotifications.requestPermission();
    } catch (err) {
      console.warn('[nativeTaskScheduler] iOS notification request failed', err);
      return false;
    }
  }
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
 * Ask for task notifications, then for exact alarms on Android 12+ when they are off.
 * Call this when a scheduled task is saved or turned on.
 */
export async function ensureEnabledTaskPermissions(alert: PermissionAlert): Promise<void> {
  const notificationsGranted = await checkNotificationPermission();
  if (!notificationsGranted) {
    await requestNotificationPermission();
  }

  if (Platform.OS !== 'android') return;
  const exact = await canScheduleExactAlarms();
  if (!exact) {
    alert(
      'Allow exact alarms',
      'ofln needs Alarms & reminders so this task runs at the time you set. Without it, Android may delay the run.',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Open settings',
          onPress: () => {
            void openExactAlarmSettings();
          },
        },
      ],
    );
    return;
  }

  const ignoringBattery = await isIgnoringBatteryOptimizations();
  if (!ignoringBattery) {
    alert(
      'Background execution',
      'To ensure tasks run reliably when the app is closed or cleared from the background, set battery usage to Unrestricted in system settings.',
      [
        { text: 'Later', style: 'cancel' },
        {
          text: 'Settings',
          onPress: () => {
            void openBatteryOptimizationSettings();
          },
        },
      ],
    );
  }
}

export async function postNativeTaskNotification(params: {
  title: string;
  message: string;
  taskId?: string | null;
  runId?: string | null;
  isSuccess: boolean;
}): Promise<boolean> {
  if (IosNotifications) {
    try {
      return await IosNotifications.postNotification(
        params.title,
        params.message,
        params.taskId || null,
        params.runId || null,
        params.isSuccess,
      );
    } catch (err) {
      console.warn('[nativeTaskScheduler] iOS postNotification failed', err);
      return false;
    }
  }
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
