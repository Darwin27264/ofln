import { NativeModules } from 'react-native';
import {
  __resetTtsServiceForTests,
  isTtsAvailable,
  speakText,
  stopSpeaking,
} from '../src/services/ttsService';

describe('ttsService', () => {
  const speak = jest.fn(async () => true);
  const stop = jest.fn(async () => true);
  const getInitStatus = jest.fn(async () => true);

  beforeEach(() => {
    __resetTtsServiceForTests();
    speak.mockClear();
    stop.mockClear();
    getInitStatus.mockClear();
    // Reset native module slot for each case
    (NativeModules as any).TextToSpeech = undefined;
  });

  afterEach(() => {
    __resetTtsServiceForTests();
    (NativeModules as any).TextToSpeech = undefined;
  });

  it('no-ops when native module is missing', async () => {
    expect(isTtsAvailable()).toBe(false);
    const result = await speakText('Hello world');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    await expect(stopSpeaking()).resolves.toBeUndefined();
  });

  it('speaks prepared text when TextToSpeech is linked', async () => {
    (NativeModules as any).TextToSpeech = {
      speak,
      stop,
      getInitStatus,
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    expect(isTtsAvailable()).toBe(true);
    const result = await speakText(
      '<think>skip</think> The answer is forty-two.',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('forty-two');
      expect(result.text).not.toMatch(/skip|think/i);
    }
    expect(speak).toHaveBeenCalled();
    expect(speak.mock.calls[0][0]).toContain('forty-two');
  });

  it('rejects empty speak payload after stripping', async () => {
    (NativeModules as any).TextToSpeech = { speak, stop, getInitStatus };
    const result = await speakText('<think>only thoughts</think>');
    expect(result).toEqual({ ok: false, reason: 'empty' });
    expect(speak).not.toHaveBeenCalled();
  });

  it('does not call native stop when nothing is speaking', async () => {
    (NativeModules as any).TextToSpeech = { speak, stop, getInitStatus };
    await stopSpeaking();
    expect(stop).not.toHaveBeenCalled();
  });

  it('still stops and speaks when an engine is present', async () => {
    (NativeModules as any).TextToSpeech = {
      speak,
      stop,
      getInitStatus,
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    const first = await speakText('Hello there');
    expect(first).toEqual(expect.objectContaining({ ok: true }));
    expect(speak).toHaveBeenCalledTimes(1);
    // Idle stop is skipped; interrupting an active utterance still hits native stop.
    await stopSpeaking();
    expect(stop).toHaveBeenCalledTimes(1);

    const second = await speakText('Second utterance');
    expect(second.ok).toBe(true);
    expect(speak).toHaveBeenCalledTimes(2);
    expect(getInitStatus).toHaveBeenCalled();
    expect(isTtsAvailable()).toBe(true);
  });

  it('treats missing OS TTS engine as unavailable', async () => {
    const noEngine = new Error('No TTS engine installed');
    getInitStatus.mockRejectedValueOnce(noEngine);
    (NativeModules as any).TextToSpeech = {
      speak,
      stop,
      getInitStatus,
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    const result = await speakText('Hello');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(speak).not.toHaveBeenCalled();
    expect(isTtsAvailable()).toBe(false);
    await stopSpeaking();
    expect(stop).not.toHaveBeenCalled();
  });
});
