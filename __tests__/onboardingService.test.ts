jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 6 * 1024 ** 3),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ONBOARDING_COMPLETE_KEY,
  ONBOARDING_MODEL_CANDIDATES,
  hasCompletedOnboarding,
  markOnboardingComplete,
  pickRecommendedOnboardingModel,
  shouldShowOnboardingOnLaunch,
} from '../src/services/onboardingService';

const GB = 1024 ** 3;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('pickRecommendedOnboardingModel', () => {
  it('defaults to the smallest candidate when RAM is unknown', () => {
    const pick = pickRecommendedOnboardingModel(ONBOARDING_MODEL_CANDIDATES, null);
    expect(pick.id).toBe('qwen35-08b-q40');
  });

  it('prefers Fits over Tight on mid-range RAM', () => {
    // 6 GB device — 0.8B and 2B Fit; 4B may be Tight. Prefer Fits (first Fits in list = 0.8B).
    const pick = pickRecommendedOnboardingModel(ONBOARDING_MODEL_CANDIDATES, 6 * GB);
    expect(pick.id).toBe('qwen35-08b-q40');
  });

  it('picks Fits when only the lightest fits', () => {
    // ~2 GB device — only 0.8B Fits
    const pick = pickRecommendedOnboardingModel(ONBOARDING_MODEL_CANDIDATES, 2 * GB);
    expect(pick.id).toBe('qwen35-08b-q40');
  });

  it('still returns a candidate when everything is Tight / Won’t fit', () => {
    const hugeOnly = [
      {
        id: 'huge',
        name: 'Huge',
        repoId: 'x/y',
        fileName: 'huge.gguf',
        size: '8 GB',
        description: 'too big',
      },
    ];
    const pick = pickRecommendedOnboardingModel(hugeOnly, 3 * GB);
    expect(pick.id).toBe('huge');
  });
});

describe('onboarding complete flag (launch gate)', () => {
  it('shows onboarding only until marked complete', async () => {
    expect(await shouldShowOnboardingOnLaunch()).toBe(true);
    expect(await hasCompletedOnboarding()).toBe(false);

    const ok = await markOnboardingComplete();
    expect(ok).toBe(true);
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBe('true');
    expect(await hasCompletedOnboarding()).toBe(true);
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
  });

  it('stays off across repeated launch checks after first completion', async () => {
    await markOnboardingComplete();
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
  });

  it('treats remaking complete as idempotent (About review must not clear)', async () => {
    await markOnboardingComplete();
    await markOnboardingComplete();
    expect(await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY)).toBe('true');
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
  });

  it('accepts legacy "1" as completed', async () => {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, '1');
    expect(await hasCompletedOnboarding()).toBe(true);
    expect(await shouldShowOnboardingOnLaunch()).toBe(false);
  });
});
