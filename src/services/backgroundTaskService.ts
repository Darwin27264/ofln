/**
 * OS background scheduling for Source Monitor tasks.
 * Android: WorkManager via react-native-background-fetch + FGS for long runs.
 * iOS: BGTaskScheduler via background-fetch (short window; LLM may defer).
 */

import { AppState, Platform } from 'react-native';
import BackgroundFetch, {
  type BackgroundFetchStatus,
} from 'react-native-background-fetch';

import { hasActiveDownloads } from '../api/model';
import { processDueTasks } from './taskRunnerService';

const HEADLESS_TASK_ID = 'ofln-source-monitor';

let configured = false;
let appStateSub: { remove: () => void } | null = null;

async function onBackgroundEvent(taskId: string): Promise<void> {
  try {
    await processDueTasks({
      // Headless / BG: allow FGS on Android inside runner
      skipForegroundService: false,
      forceAnalysis: Platform.OS === 'android',
    });
  } catch (e) {
    console.warn('[backgroundTask] processDueTasks failed', e);
  } finally {
    BackgroundFetch.finish(taskId);
  }
}

function onBackgroundTimeout(taskId: string): void {
  console.warn('[backgroundTask] timeout', taskId);
  BackgroundFetch.finish(taskId);
}

/**
 * Configure periodic OS wake. Safe to call multiple times.
 */
export async function initBackgroundTaskScheduling(): Promise<BackgroundFetchStatus | null> {
  if (configured) {
    return BackgroundFetch.status();
  }

  try {
    const status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15,
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
        requiresCharging: false,
        requiresDeviceIdle: false,
        requiresBatteryNotLow: false,
        requiresStorageNotLow: false,
      },
      onBackgroundEvent,
      onBackgroundTimeout,
    );
    configured = true;

    // Catch-up when returning to foreground
    if (!appStateSub) {
      appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          if (hasActiveDownloads()) {
            return;
          }
          void processDueTasks({
            skipForegroundService: true,
            forceAnalysis: true,
          });
        }
      });
    }

    return status;
  } catch (e) {
    console.warn('[backgroundTask] configure failed', e);
    return null;
  }
}

/**
 * Headless Android entry — registered from index.js.
 */
export const backgroundFetchHeadlessTask = async (event: {
  taskId: string;
  timeout?: boolean;
}) => {
  const taskId = event?.taskId || HEADLESS_TASK_ID;
  if (event?.timeout) {
    onBackgroundTimeout(taskId);
    return;
  }
  await onBackgroundEvent(taskId);
};

export async function scheduleBackgroundFetch(): Promise<void> {
  try {
    await BackgroundFetch.scheduleTask({
      taskId: HEADLESS_TASK_ID,
      delay: 15 * 60 * 1000,
      periodic: true,
      forceAlarmManager: false,
      enableHeadless: true,
    });
  } catch (e) {
    console.warn('[backgroundTask] scheduleTask failed', e);
  }
}
