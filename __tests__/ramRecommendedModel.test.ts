jest.mock('react-native-fs', () => ({
  getFSInfo: jest.fn(),
}));

jest.mock('react-native-device-info', () => ({
  __esModule: true,
  default: {
    getTotalMemory: jest.fn(async () => 6 * 1024 ** 3),
    getUsedMemory: jest.fn(async () => 2 * 1024 ** 3),
  },
}));

import {
  STARTER_MODELS,
  pickRecommendedStarterModel,
} from '../src/services/starterModels';
import {
  classifyRamFit,
  classifyRamFitFromSize,
  bucketForDeviceRam,
} from '../src/services/ramFitService';

const GB = 1024 ** 3;

describe('RAM-based recommended model across hardware tiers (R2)', () => {
  it('correctly maps 4 GB, 6 GB, 8 GB, and 12 GB RAM buckets', () => {
    const b4 = bucketForDeviceRam(4 * GB);
    const b6 = bucketForDeviceRam(6 * GB);
    const b8 = bucketForDeviceRam(8 * GB);
    const b12 = bucketForDeviceRam(12 * GB);

    expect(b4.fitsMaxFile).toBe(1.9 * GB);
    expect(b6.fitsMaxFile).toBe(2.8 * GB);
    expect(b8.fitsMaxFile).toBe(4.2 * GB);
    expect(b12.fitsMaxFile).toBe(6.5 * GB);
  });

  describe('4 GB RAM Tier (Entry Devices)', () => {
    const ram = 4 * GB;

    it('recommends a model that fits comfortably under 1.9 GB (e.g. SmolLM 3B or Qwen 2B)', () => {
      const rec = pickRecommendedStarterModel(STARTER_MODELS, ram);
      expect(rec).toBeDefined();
      expect(rec?.fileName).toBe('SmolLM3-3B-Q4_0.gguf'); // 1.82 GB fits in 1.9 GB
      expect(classifyRamFit(rec!.sizeBytes!, ram)).toBe('fits');
    });

    it('classifies models larger than 2.8 GB as wont_fit', () => {
      const mistral7b = STARTER_MODELS.find((m) => m.fileName.includes('Mistral-7B') || m.id.includes('mistral-7b'));
      if (mistral7b && mistral7b.sizeBytes) {
        expect(classifyRamFit(mistral7b.sizeBytes, ram)).toBe('wont_fit');
      }
    });
  });

  describe('6 GB RAM Tier (Mid-range Devices)', () => {
    const ram = 6 * GB;

    it('recommends a capable model that fits under 2.8 GB (e.g. Qwen 4B or SmolLM 3B)', () => {
      const rec = pickRecommendedStarterModel(STARTER_MODELS, ram);
      expect(rec).toBeDefined();
      expect(classifyRamFit(rec!.sizeBytes!, ram)).toBe('fits');
      // On 6 GB, fitsMaxFile is 2.8 GB; Qwen 4B is 2.45 GB
      expect(rec?.fileName).toBe('Qwen3.5-4B-Q4_0.gguf');
    });
  });

  describe('8 GB RAM Tier (High-end Phones)', () => {
    const ram = 8 * GB;

    it('recommends the largest fitting model under 4.2 GB', () => {
      const rec = pickRecommendedStarterModel(STARTER_MODELS, ram);
      expect(rec).toBeDefined();
      expect(classifyRamFit(rec!.sizeBytes!, ram)).toBe('fits');
      expect(rec?.sizeBytes).toBeLessThanOrEqual(4.2 * GB);
    });
  });

  describe('12 GB RAM Tier (Flagship Phones)', () => {
    const ram = 12 * GB;

    it('recommends flagship models up to 6.5 GB', () => {
      const rec = pickRecommendedStarterModel(STARTER_MODELS, ram);
      expect(rec).toBeDefined();
      expect(classifyRamFit(rec!.sizeBytes!, ram)).toBe('fits');
      // Mistral 7B (4.37 GB) fits comfortably in 12 GB
      const mistral = STARTER_MODELS.find((m) => m.fileName.includes('Mistral-7B') || m.id.includes('mistral-7b'));
      if (mistral) {
        expect(classifyRamFit(mistral.sizeBytes!, ram)).toBe('fits');
      }
    });
  });

  describe('Edge cases (Low RAM / Unknown)', () => {
    it('falls back gracefully to the smallest model for 2 GB devices', () => {
      const rec = pickRecommendedStarterModel(STARTER_MODELS, 2 * GB);
      expect(rec).toBeDefined();
      expect(rec?.fileName).toBe('Qwen3.5-0.8B-Q4_0.gguf');
    });

    it('falls back gracefully when total memory is null or 0', () => {
      const recNull = pickRecommendedStarterModel(STARTER_MODELS, null);
      expect(recNull).toBe(STARTER_MODELS[0]);

      const recZero = pickRecommendedStarterModel(STARTER_MODELS, 0);
      expect(recZero).toBe(STARTER_MODELS[0]);
    });
  });
});
