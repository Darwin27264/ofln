import { TurboModuleRegistry } from 'react-native';

/**
 * Factory must define the mock (jest mock hoist runs before outer consts).
 */
jest.mock('@dev-amirzubair/react-native-voice', () => {
  const api = {
    start: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    cancel: jest.fn(async () => undefined),
    destroy: jest.fn(async () => undefined),
    removeAllListeners: jest.fn(),
    isAvailable: jest.fn(async () => 1),
    onSpeechStart: null,
    onSpeechEnd: null,
    onSpeechError: null,
    onSpeechResults: null,
    onSpeechPartialResults: null,
  };
  return { __esModule: true, default: api };
});

import Voice from '@dev-amirzubair/react-native-voice';
import {
  __resetSttServiceForTests,
  isSttAvailable,
  setTranscriptListener,
  startListening,
  stopListening,
} from '../src/services/sttService';

const VoiceMock = Voice as {
  start: jest.Mock;
  stop: jest.Mock;
  cancel: jest.Mock;
  destroy: jest.Mock;
  removeAllListeners: jest.Mock;
  isAvailable: jest.Mock;
  onSpeechStart: null | ((e: unknown) => void);
  onSpeechEnd: null | ((e: unknown) => void);
  onSpeechError: null | ((e: unknown) => void);
  onSpeechResults: null | ((e: { value?: string[] }) => void);
  onSpeechPartialResults: null | ((e: { value?: string[] }) => void);
};

describe('sttService', () => {
  beforeEach(() => {
    __resetSttServiceForTests();
    VoiceMock.start.mockClear();
    VoiceMock.stop.mockClear();
    VoiceMock.cancel.mockClear();
    VoiceMock.destroy.mockClear();
    VoiceMock.removeAllListeners.mockClear();
    VoiceMock.isAvailable.mockClear();
    VoiceMock.isAvailable.mockResolvedValue(1);
    VoiceMock.start.mockResolvedValue(undefined);
    VoiceMock.onSpeechStart = null;
    VoiceMock.onSpeechEnd = null;
    VoiceMock.onSpeechError = null;
    VoiceMock.onSpeechResults = null;
    VoiceMock.onSpeechPartialResults = null;
    jest.spyOn(TurboModuleRegistry, 'get').mockReturnValue(null);
  });

  afterEach(async () => {
    await stopListening();
    jest.restoreAllMocks();
    __resetSttServiceForTests();
  });

  it('reports unavailable when native module is missing', async () => {
    expect(isSttAvailable()).toBe(false);
    const result = await startListening('hello');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(VoiceMock.start).not.toHaveBeenCalled();
  });

  it('starts recognition and emits joined transcripts', async () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name) => {
      if (name === 'Voice') {
        return { startSpeech: jest.fn() } as any;
      }
      return null;
    });

    const transcripts: string[] = [];
    setTranscriptListener((t) => transcripts.push(t));

    const result = await startListening('Draft');
    expect(result).toEqual({ ok: true });
    expect(VoiceMock.start).toHaveBeenCalled();
    expect(VoiceMock.isAvailable).toHaveBeenCalled();

    VoiceMock.onSpeechPartialResults?.({ value: ['one'] });
    VoiceMock.onSpeechResults?.({ value: ['one two'] });

    expect(transcripts).toEqual(['Draft one', 'Draft one two']);
  });

  it('drops late partials after stopListening', async () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name) => {
      if (name === 'Voice') {
        return { startSpeech: jest.fn() } as any;
      }
      return null;
    });

    const transcripts: string[] = [];
    setTranscriptListener((t) => transcripts.push(t));

    await startListening('');
    VoiceMock.onSpeechPartialResults?.({ value: ['before'] });
    await stopListening();
    VoiceMock.onSpeechPartialResults?.({ value: ['after stop'] });

    expect(transcripts).toEqual(['before']);
  });

  it('reports unavailable when engine isAvailable is false', async () => {
    jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name) => {
      if (name === 'Voice') {
        return { startSpeech: jest.fn() } as any;
      }
      return null;
    });
    VoiceMock.isAvailable.mockResolvedValue(0);

    const result = await startListening('x');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
    expect(VoiceMock.start).not.toHaveBeenCalled();
  });

  it('stopListening is safe when never started', async () => {
    await expect(stopListening()).resolves.toBeUndefined();
  });
});
