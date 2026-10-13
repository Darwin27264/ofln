import { NativeModules } from 'react-native';
import { isOcrSupported, extractTextFromImage } from '../src/services/ocrService';
import TextRecognition from '@react-native-ml-kit/text-recognition';

jest.mock('@react-native-ml-kit/text-recognition', () => ({
  recognize: jest.fn(),
}));

jest.mock('../src/services/mediaNormalizeService', () => ({
  normalizeMediaToFile: jest.fn().mockResolvedValue({ path: '/mock/path.png', isTemporaryCopy: false }),
  cleanupNormalizedMedia: jest.fn().mockResolvedValue(undefined),
  truncateForPrompt: jest.fn((text: string) => text),
  toFileUri: jest.fn((path: string) => `file://${path}`),
  MAX_OCR_CHARS: 4000,
}));

jest.mock('../src/services/ocrRamGuard', () => ({
  withOcrRamHeadroom: jest.fn(async (fn: () => Promise<any>) => ({
    result: await fn(),
    unloadedModel: false,
  })),
}));

describe('ocrService (FOSS and standard builds)', () => {
  const originalNativeTextRecognition = NativeModules.TextRecognition;

  afterEach(() => {
    NativeModules.TextRecognition = originalNativeTextRecognition;
    jest.clearAllMocks();
  });

  describe('isOcrSupported', () => {
    it('returns false when NativeModules.TextRecognition is not present (pure FOSS build)', () => {
      NativeModules.TextRecognition = undefined;
      expect(isOcrSupported()).toBe(false);
    });

    it('returns true when NativeModules.TextRecognition is linked (Play / standard build)', () => {
      NativeModules.TextRecognition = { recognize: jest.fn() };
      expect(isOcrSupported()).toBe(true);
    });
  });

  describe('extractTextFromImage', () => {
    it('returns empty string on empty uri', async () => {
      NativeModules.TextRecognition = { recognize: jest.fn() };
      const res = await extractTextFromImage('');
      expect(res).toBe('');
    });

    it('returns empty string gracefully when OCR is not supported (FOSS build flavor)', async () => {
      NativeModules.TextRecognition = undefined;
      const res = await extractTextFromImage('file:///test.png');
      expect(res).toBe('');
      expect(TextRecognition.recognize).not.toHaveBeenCalled();
    });

    it('extracts and returns text when OCR is supported', async () => {
      NativeModules.TextRecognition = { recognize: jest.fn() };
      (TextRecognition.recognize as jest.Mock).mockResolvedValue({
        text: 'Recognized receipt text\n\n\nTotal: $12.50',
      });

      const res = await extractTextFromImage('file:///test.png');
      expect(res).toBe('Recognized receipt text\n\nTotal: $12.50');
      expect(TextRecognition.recognize).toHaveBeenCalled();
    });

    it('returns empty string on recognition error without crashing', async () => {
      NativeModules.TextRecognition = { recognize: jest.fn() };
      (TextRecognition.recognize as jest.Mock).mockRejectedValue(new Error('ML Kit failed'));

      const res = await extractTextFromImage('file:///test.png');
      expect(res).toBe('');
    });
  });
});
