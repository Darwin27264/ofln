/**
 * @format
 */

import {AppRegistry} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import BackgroundFetch from 'react-native-background-fetch';
import {backgroundFetchHeadlessTask} from './src/services/backgroundTaskService';

AppRegistry.registerComponent(appName, () => App);

// Android headless wake for Source Monitor (WorkManager).
BackgroundFetch.registerHeadlessTask(backgroundFetchHeadlessTask);
