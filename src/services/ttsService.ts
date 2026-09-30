/**
 * OS text-to-speech via react-native-tts native module.
 *
 * IMPORTANT: Do not `import 'react-native-tts'` — its default export constructs
 * NativeEventEmitter at load and throws when TextToSpeech isn’t linked yet
 * (metro-only reload after npm install). Call through NativeModules only,
 * same pattern as keepAwakeService.
 */

import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { prepareSpeechText } from '../utils/speechText';

type NativeTts = {
  getInitStatus?: () => Promise<boolean>;
  speak: (utterance: string, options: Record<string, unknown>) => Promise<unknown> | unknown;
  stop: (onWordBoundary?: boolean) => Promise<unknown> | unknown;
};

export type SpeechStatus = {
  speaking: boolean;
  /** When speak fails or finishes */
  reason?: 'empty' | 'unavailable' | 'error' | 'stopped' | 'finished';
};

type StatusListener = (status: SpeechStatus) => void;

let statusListener: StatusListener | null = null;
let eventWired = false;
let emitter: NativeEventEmitter | null = null;
let speaking = false;
/** Device has the RN module but no OS TTS engine (common on bare emulators). */
let engineMissing = false;

function isNoEngineError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /no tts engine/i.test(msg);
}

function markEngineMissing(e: unknown): void {
  if (!isNoEngineError(e)) return;
  engineMissing = true;
}

function getNative(): NativeTts | null {
  try {
    if (engineMissing) return null;
    const mod = NativeModules.TextToSpeech as NativeTts | undefined | null;
    if (!mod || typeof mod.speak !== 'function' || typeof mod.stop !== 'function') {
      return null;
    }
    return mod;
  } catch {
    return null;
  }
}

function ensureEvents(native: NativeTts): void {
  if (eventWired) return;
  try {
    // RN ≥0.65 NativeEventEmitter warns unless the native module implements these.
    const host = native as NativeTts & {
      addListener?: (eventType: string) => void;
      removeListeners?: (count: number) => void;
    };
    if (typeof host.addListener !== 'function') {
      host.addListener = () => {};
    }
    if (typeof host.removeListeners !== 'function') {
      host.removeListeners = () => {};
    }
    emitter = new NativeEventEmitter(host as never);
    const end = () => {
      speaking = false;
      statusListener?.({ speaking: false, reason: 'finished' });
    };
    const cancel = () => {
      speaking = false;
      statusListener?.({ speaking: false, reason: 'stopped' });
    };
    const err = () => {
      speaking = false;
      statusListener?.({ speaking: false, reason: 'error' });
    };
    emitter.addListener('tts-finish', end);
    emitter.addListener('tts-cancel', cancel);
    emitter.addListener('tts-error', err);
    eventWired = true;
  } catch (e) {
    if (__DEV__) console.warn('[tts] event wire failed', e);
  }
}

/** Native TextToSpeech module is linked (full rebuild). */
export function isTtsAvailable(): boolean {
  return getNative() != null;
}

export function isSpeaking(): boolean {
  return speaking;
}

/** Subscribe to speak start / end (Conversation UI toggle icon). */
export function setSpeechStatusListener(listener: StatusListener | null): void {
  statusListener = listener;
}

/** Stop any in-progress OS utterance. Safe if unlinked / no engine. */
export async function stopSpeaking(): Promise<void> {
  const wasSpeaking = speaking;
  speaking = false;

  // Nothing to stop — avoid native calls (emulators without a TTS engine throw).
  if (!wasSpeaking) {
    return;
  }

  const native = getNative();
  if (!native) {
    statusListener?.({ speaking: false, reason: 'stopped' });
    return;
  }
  try {
    if (Platform.OS === 'ios') {
      await Promise.resolve(native.stop(false));
    } else {
      await Promise.resolve(native.stop());
    }
  } catch (e) {
    markEngineMissing(e);
    if (__DEV__ && !isNoEngineError(e)) {
      console.warn('[tts] stop failed', e);
    }
  } finally {
    statusListener?.({ speaking: false, reason: 'stopped' });
  }
}

export type SpeakResult =
  | { ok: true; text: string; reason?: undefined }
  | { ok: false; reason: 'empty' | 'unavailable' | 'error' };

/**
 * Speak assistant content after stripThinkBlocks + markdown soften.
 * Stops any previous utterance first.
 */
export async function speakText(raw: string): Promise<SpeakResult> {
  const text = prepareSpeechText(raw);
  if (!text) {
    return { ok: false, reason: 'empty' };
  }

  const native = getNative();
  if (!native) {
    return { ok: false, reason: 'unavailable' };
  }

  try {
    ensureEvents(native);
    await stopSpeaking();
    if (typeof native.getInitStatus === 'function') {
      try {
        await native.getInitStatus();
      } catch (e) {
        markEngineMissing(e);
        if (engineMissing) {
          statusListener?.({ speaking: false, reason: 'unavailable' });
          return { ok: false, reason: 'unavailable' };
        }
      }
    }
    speaking = true;
    statusListener?.({ speaking: true });
    // Android expects androidParams bag; iOS accepts plain options.
    if (Platform.OS === 'android') {
      await Promise.resolve(native.speak(text, {}));
    } else {
      await Promise.resolve(native.speak(text, {}));
    }
    return { ok: true, text };
  } catch (e) {
    speaking = false;
    markEngineMissing(e);
    if (isNoEngineError(e)) {
      statusListener?.({ speaking: false, reason: 'unavailable' });
      return { ok: false, reason: 'unavailable' };
    }
    if (__DEV__) console.warn('[tts] speak failed', e);
    statusListener?.({ speaking: false, reason: 'error' });
    return { ok: false, reason: 'error' };
  }
}

/** Test-only: reset module listeners between Jest cases. */
export function __resetTtsServiceForTests(): void {
  statusListener = null;
  eventWired = false;
  emitter = null;
  speaking = false;
  engineMissing = false;
}
