/**
 * First-run onboarding gate (S11).
 * Flag only — download/load stay on App / llamaProvider.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { classifyRamFit, type RamFitTier } from './ramFitService';
import { parseSizeToBytes } from '../utils/diskPreflight';

export const ONBOARDING_COMPLETE_KEY = '@has_completed_onboarding';

/** Curated candidates shown during onboarding (subset of Popular models). */
export type OnboardingModelCandidate = {
  id: string;
  name: string;
  repoId: string;
  fileName: string;
  size: string;
  description: string;
};

/**
 * Short list for first-run — prefer small Q4_0 Qwen so phones/emulators succeed.
 * Same repos/filenames as ModelSelection Popular list.
 */
export const ONBOARDING_MODEL_CANDIDATES: OnboardingModelCandidate[] = [
  {
    id: 'qwen35-08b-q40',
    name: 'Qwen3.5 0.8B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-0.8B-GGUF',
    fileName: 'Qwen3.5-0.8B-Q4_0.gguf',
    size: '0.51 GB',
    description: 'Lightest start (~0.5 GB). Best for low-RAM phones and emulators.',
  },
  {
    id: 'qwen35-2b-q40',
    name: 'Qwen3.5 2B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-2B-GGUF',
    fileName: 'Qwen3.5-2B-Q4_0.gguf',
    size: '1.13 GB',
    description: 'Balanced daily driver when your phone has a bit more headroom.',
  },
  {
    id: 'qwen35-4b-q40',
    name: 'Qwen3.5 4B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-4B-GGUF',
    fileName: 'Qwen3.5-4B-Q4_0.gguf',
    size: '2.41 GB',
    description: 'Stronger thinking and code — needs more RAM (~3.5 GB+).',
  },
];

const TIER_RANK: Record<RamFitTier, number> = {
  fits: 0,
  tight: 1,
  wont_fit: 2,
};

/**
 * Pick the best first-run model: prefer Fits, then Tight, else the smallest candidate.
 * Pure — unit-tested; null RAM falls back to first candidate (0.8B).
 */
export function pickRecommendedOnboardingModel(
  candidates: OnboardingModelCandidate[],
  totalMemoryBytes: number | null,
): OnboardingModelCandidate {
  if (candidates.length === 0) {
    throw new Error('pickRecommendedOnboardingModel: empty candidates');
  }
  if (totalMemoryBytes == null || !(totalMemoryBytes > 0)) {
    return candidates[0];
  }

  let best = candidates[0];
  let bestRank = 99;
  for (const c of candidates) {
    const bytes = parseSizeToBytes(c.size);
    if (bytes == null) continue;
    const tier = classifyRamFit(bytes, totalMemoryBytes);
    const rank = TIER_RANK[tier];
    if (rank < bestRank) {
      bestRank = rank;
      best = c;
    }
  }
  return best;
}

export async function hasCompletedOnboarding(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return v === 'true' || v === '1';
  } catch {
    // Fail closed for the gate? Prefer false so first-run still works if storage blips.
    return false;
  }
}

/**
 * Persist “don’t auto-show onboarding on launch”.
 * Verifies the write so a silent storage failure can’t leave the gate open forever
 * after the user thinks they finished.
 * Does not clear — About “Review” only navigates; it never removes this key.
 */
export async function markOnboardingComplete(): Promise<boolean> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    const ok = await hasCompletedOnboarding();
    if (!ok) {
      console.warn('Onboarding complete flag did not persist');
    }
    return ok;
  } catch (e) {
    console.warn('Failed to persist onboarding complete flag', e);
    return false;
  }
}

/** Launch gate — true only until the user finishes or skips once. */
export async function shouldShowOnboardingOnLaunch(): Promise<boolean> {
  return !(await hasCompletedOnboarding());
}
