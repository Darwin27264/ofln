jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('../src/utils/errorLogger', () => ({
  logError: jest.fn(async () => {}),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  BOOT_IN_PROGRESS_KEY,
  MODEL_LOAD_IN_PROGRESS_KEY,
  SUPPRESS_AUTOLOAD_KEY,
  checkAndMarkBootStart,
  clearModelLoadInProgress,
  isModelAutoloadSuppressed,
  markModelLoadInProgress,
} from '../src/services/safeBootService';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('checkAndMarkBootStart', () => {
  it('marks boot_in_progress on a clean launch', async () => {
    const r = await checkAndMarkBootStart();
    expect(r).toEqual({ offerSafeMode: false, priorModelLoadCrash: false });
    expect(await AsyncStorage.getItem(BOOT_IN_PROGRESS_KEY)).toBe('true');
    expect(await isModelAutoloadSuppressed()).toBe(false);
  });

  it('clears sticky boot_in_progress without Safe Mode (false-positive path)', async () => {
    await AsyncStorage.setItem(BOOT_IN_PROGRESS_KEY, 'true');
    const r = await checkAndMarkBootStart();
    expect(r.offerSafeMode).toBe(false);
    expect(r.priorModelLoadCrash).toBe(false);
    expect(await AsyncStorage.getItem(BOOT_IN_PROGRESS_KEY)).toBe('true');
  });

  it('offers Safe Mode only when model_load_in_progress was left set', async () => {
    await AsyncStorage.setItem(MODEL_LOAD_IN_PROGRESS_KEY, 'true');
    const r = await checkAndMarkBootStart();
    expect(r.offerSafeMode).toBe(true);
    expect(r.priorModelLoadCrash).toBe(true);
    expect(await AsyncStorage.getItem(MODEL_LOAD_IN_PROGRESS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(SUPPRESS_AUTOLOAD_KEY)).toBe('true');
    expect(await isModelAutoloadSuppressed()).toBe(true);
  });

  it('prefers model-load crash over sticky boot flag', async () => {
    await AsyncStorage.setItem(BOOT_IN_PROGRESS_KEY, 'true');
    await AsyncStorage.setItem(MODEL_LOAD_IN_PROGRESS_KEY, 'true');
    const r = await checkAndMarkBootStart();
    expect(r.offerSafeMode).toBe(true);
    expect(r.priorModelLoadCrash).toBe(true);
    expect(await isModelAutoloadSuppressed()).toBe(true);
  });
});

describe('mark/clear model_load_in_progress', () => {
  it('sets and clears the load flag', async () => {
    await markModelLoadInProgress();
    expect(await AsyncStorage.getItem(MODEL_LOAD_IN_PROGRESS_KEY)).toBe('true');
    await clearModelLoadInProgress();
    expect(await AsyncStorage.getItem(MODEL_LOAD_IN_PROGRESS_KEY)).toBeNull();
  });
});
