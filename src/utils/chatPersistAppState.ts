/**
 * AppState helpers for chat persistence flush (S16).
 * Pure — no native side effects; useAIChat owns the actual save.
 */

import type { AppStateStatus } from 'react-native';

/** True for AppState values that mean the UI is no longer fully foreground. */
export function shouldFlushChatPersist(next: AppStateStatus): boolean {
  return next === 'inactive' || next === 'background';
}

/**
 * Flush once when leaving `active` (e.g. active→inactive).
 * Avoids a second save on the common iOS inactive→background sequence.
 */
export function shouldFlushChatPersistOnTransition(
  prev: AppStateStatus,
  next: AppStateStatus,
): boolean {
  return prev === 'active' && shouldFlushChatPersist(next);
}
