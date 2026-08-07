/**
 * Platform speech-to-text (S30) via OS recognition.
 *
 * Lib choice note:
 * - Official `@react-native-voice/voice` is **archived** and broken on New Arch /
 *   bridgeless — do not use it.
 * - We use `@dev-amirzubair/react-native-voice@1.0.4` (fork with TurboModule +
 *   Android DeviceEventEmitter). Thin single-author fork: not abandoned, but not
 *   a large org-maintained package. Wrapper no-ops when unlinked.
 * - Longer-term swap if needed: `expo-speech-recognition` (requires Expo Modules
 *   on bare RN) or a first-party SpeechRecognizer module.
 *
 * Defenses: presence check + lazy require, per-session event epoch, serialized
 * start/stop, explicit mic permission, stop+cancel halt.
 */

import {
  NativeModules,
  PermissionsAndroid,
  Platform,
  TurboModuleRegistry,
} from 'react-native';
import { joinComposerSpeech } from '../utils/speechInput';
import { stopSpeaking } from './ttsService';

type VoiceApi = {
  start: (locale: string, options?: Record<string, unknown>) => Promise<void>;
  stop: () => Promise<void>;
  cancel: () => Promise<void>;
  destroy: () => Promise<void>;
  removeAllListeners: () => void;
  isAvailable: () => Promise<0 | 1 | boolean>;
  isRecognizing?: () => Promise<0 | 1 | boolean>;
  onSpeechStart: ((e: unknown) => void) | null;
  onSpeechEnd: ((e: unknown) => void) | null;
  onSpeechError: ((e: { error?: { code?: string; message?: string } }) => void) | null;
  onSpeechResults: ((e: { value?: string[] }) => void) | null;
  onSpeechPartialResults: ((e: { value?: string[] }) => void) | null;
};

export type ListeningStatus = {
  listening: boolean;
  reason?: 'permission' | 'unavailable' | 'error' | 'stopped' | 'finished';
  message?: string;
};

export type StartListeningResult =
  | { ok: true }
  | { ok: false; reason: 'permission' | 'unavailable' | 'error'; message?: string };

type TranscriptListener = (composerText: string) => void;
type StatusListener = (status: ListeningStatus) => void;

let voiceApi: VoiceApi | null | undefined;
/** Bumped on every stop/start — handler closures capture the active value. */
let sessionEpoch = 0;
let listening = false;
let baseText = '';
let transcriptListener: TranscriptListener | null = null;
let statusListener: StatusListener | null = null;
/** Serialize start/stop so double-taps cannot race. */
let opChain: Promise<unknown> = Promise.resolve();

function enqueueOp<T>(fn: () => Promise<T>): Promise<T> {
  const run = opChain.then(fn, fn);
  opChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isNativeLinked(): boolean {
  try {
    const turbo = TurboModuleRegistry.get?.('Voice');
    if (turbo != null) return true;
  } catch {
    // ignore
  }
  try {
    return NativeModules.Voice != null;
  } catch {
    return false;
  }
}

/** Native Voice module is linked (full rebuild). */
export function isSttAvailable(): boolean {
  return isNativeLinked();
}

export function isListening(): boolean {
  return listening;
}

export function setTranscriptListener(listener: TranscriptListener | null): void {
  transcriptListener = listener;
}

export function setListeningStatusListener(listener: StatusListener | null): void {
  statusListener = listener;
}

function setListeningState(
  next: boolean,
  reason?: ListeningStatus['reason'],
  message?: string,
): void {
  listening = next;
  statusListener?.({ listening: next, reason, message });
}

function bestTranscript(value?: string[]): string {
  if (!value || value.length === 0) return '';
  let best = '';
  for (const v of value) {
    const t = (v ?? '').trim();
    if (t.length > best.length) best = t;
  }
  return best;
}

function emitTranscript(session: number, speech: string): void {
  // Closures pass the epoch from start(); stop bumps sessionEpoch so laters no-op.
  if (session !== sessionEpoch) return;
  if (!speech) return;
  transcriptListener?.(joinComposerSpeech(baseText, speech));
}

/**
 * Benign OS STT codes (Android SpeechRecognizer) / cancel paths.
 * Permission failures must NOT be quiet.
 */
function isQuietSpeechError(code: unknown, message: unknown): boolean {
  const c = String(code ?? '');
  const m = String(message ?? '');
  const both = `${c} ${m}`.toLowerCase();
  if (/permission|insufficient/.test(both)) return false;
  const codeHead = c.match(/^(\d+)/)?.[1];
  if (codeHead && ['5', '6', '7', '8'].includes(codeHead)) return true;
  if (/no.?match|no.?speech|speech.?timeout|client.?side|recognizer.?busy|busy|cancel|abort/.test(both)) {
    return true;
  }
  return false;
}

function getVoiceApi(): VoiceApi | null {
  if (voiceApi !== undefined) return voiceApi;
  if (!isNativeLinked()) {
    voiceApi = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@dev-amirzubair/react-native-voice');
    const api = (mod?.default ?? mod) as VoiceApi | undefined;
    if (!api || typeof api.start !== 'function') {
      voiceApi = null;
      return null;
    }
    voiceApi = api;
    return voiceApi;
  } catch (e) {
    if (__DEV__) console.warn('[stt] require failed', e);
    voiceApi = null;
    return null;
  }
}

/** Rebind handlers for this session epoch (package setters re-attach emitters). */
function wireSessionListeners(api: VoiceApi, session: number): void {
  api.onSpeechStart = () => {
    if (session !== sessionEpoch) return;
    if (!listening) setListeningState(true);
  };
  api.onSpeechEnd = () => {
    if (session !== sessionEpoch) return;
    if (listening) setListeningState(false, 'finished');
  };
  api.onSpeechPartialResults = (e) => {
    emitTranscript(session, bestTranscript(e?.value));
  };
  api.onSpeechResults = (e) => {
    emitTranscript(session, bestTranscript(e?.value));
  };
  api.onSpeechError = (e) => {
    if (session !== sessionEpoch) return;
    const code = e?.error?.code ?? '';
    const message = e?.error?.message ?? '';
    const quiet = isQuietSpeechError(code, message);
    setListeningState(false, quiet ? 'stopped' : 'error', quiet ? undefined : message || undefined);
  };
}

async function ensureMicPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const already = await PermissionsAndroid.check(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
    );
    if (already) return true;
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      {
        title: 'Microphone permission',
        message: 'OFLN needs the microphone to convert speech into chat text.',
        buttonNeutral: 'Ask later',
        buttonNegative: 'Cancel',
        buttonPositive: 'OK',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (e) {
    if (__DEV__) console.warn('[stt] permission request failed', e);
    return false;
  }
}

async function haltNative(api: VoiceApi | null): Promise<void> {
  if (!api) return;
  try {
    await Promise.resolve(api.stop());
  } catch (e) {
    if (__DEV__) console.warn('[stt] stop failed', e);
  }
  try {
    await Promise.resolve(api.cancel());
  } catch (e) {
    if (__DEV__) console.warn('[stt] cancel failed', e);
  }
}

/**
 * Begin OS speech recognition. Updates composer via setTranscriptListener
 * using baseText + recognized speech (partial + final).
 *
 * baseText is snapshotted at start — typing while listening can be overwritten
 * by the next partial (stop first to edit). iOS does not auto-stop on silence;
 * Android usually does.
 */
export function startListening(
  currentComposerText: string,
  locale: string = 'en-US',
): Promise<StartListeningResult> {
  return enqueueOp(async () => {
    const api = getVoiceApi();
    if (!api) {
      return { ok: false, reason: 'unavailable' };
    }

    const permitted = await ensureMicPermission();
    if (!permitted) {
      return { ok: false, reason: 'permission' };
    }

    try {
      await stopSpeaking();
      // Invalidate any prior session, then halt native.
      sessionEpoch += 1;
      await haltNative(api);

      try {
        const available = await api.isAvailable();
        if (available === 0 || available === false) {
          setListeningState(false, 'unavailable');
          return { ok: false, reason: 'unavailable' };
        }
      } catch {
        // Some builds omit isAvailable; still try start.
      }

      sessionEpoch += 1;
      const session = sessionEpoch;
      baseText = currentComposerText ?? '';
      wireSessionListeners(api, session);
      setListeningState(true);

      await api.start(locale, {
        EXTRA_PARTIAL_RESULTS: true,
        REQUEST_PERMISSIONS_AUTO: false,
      });

      if (session !== sessionEpoch) {
        await haltNative(api);
        return { ok: false, reason: 'error', message: 'superseded' };
      }
      return { ok: true };
    } catch (e) {
      sessionEpoch += 1;
      setListeningState(false, 'error');
      if (__DEV__) console.warn('[stt] start failed', e);
      return {
        ok: false,
        reason: 'error',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  });
}

/** Stop recognition if active. Safe if unlinked. */
export function stopListening(): Promise<void> {
  return enqueueOp(async () => {
    sessionEpoch += 1;
    const api = getVoiceApi();
    try {
      await haltNative(api);
    } finally {
      if (listening) setListeningState(false, 'stopped');
      else listening = false;
    }
  });
}

/** Cancel + drop listeners (screen unmount). */
export function destroyListening(): Promise<void> {
  return enqueueOp(async () => {
    sessionEpoch += 1;
    const api = getVoiceApi();
    try {
      await haltNative(api);
      if (api) {
        try {
          await Promise.resolve(api.destroy());
        } catch {
          // ignore
        }
        try {
          api.removeAllListeners();
        } catch {
          // ignore
        }
      }
    } finally {
      baseText = '';
      if (listening) setListeningState(false, 'stopped');
      else listening = false;
    }
  });
}

/** Test-only: reset module state between Jest cases. */
export function __resetSttServiceForTests(): void {
  voiceApi = undefined;
  sessionEpoch = 0;
  listening = false;
  baseText = '';
  transcriptListener = null;
  statusListener = null;
  opChain = Promise.resolve();
}
