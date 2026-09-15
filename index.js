/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import { backgroundFetchHeadlessTask } from './src/services/backgroundTaskService';
import { runTaskById, processDueTasks } from './src/services/taskRunnerService';
import { syncAllScheduledTasks } from './src/services/nativeTaskScheduler';

AppRegistry.registerComponent(appName, () => App);

// Native Android Headless Task for exact AlarmManager execution and boot reschedule
const taskRunnerHeadlessHandler = async (taskData) => {
  const action = taskData?.action;
  const taskId = taskData?.taskId;

  try {
    if (action === 'RESCHEDULE_ALL') {
      await syncAllScheduledTasks();
    } else if (taskId) {
      await runTaskById(taskId, {
        skipForegroundService: true,
        forceAnalysis: true,
        trigger: 'scheduled_native',
      });
    } else {
      await processDueTasks({
        skipForegroundService: true,
        forceAnalysis: true,
        trigger: 'scheduled_native',
      });
    }
  } catch (err) {
    console.warn('[TaskRunnerHeadless] execution error', err);
  }
};

AppRegistry.registerHeadlessTask('TaskRunnerHeadless', () => taskRunnerHeadlessHandler);

// Fallback periodic wake for Source Monitor (WorkManager / BackgroundFetch).
BackgroundFetch.registerHeadlessTask(backgroundFetchHeadlessTask);
