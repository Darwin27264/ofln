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
});
