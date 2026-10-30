import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  formatRedditBenchmarkCard,
  STANDARD_BENCHMARK_PROMPT,
  runBenchmark,
  loadLastBenchmark,
  type BenchmarkResult,
  BENCHMARK_STORAGE_KEY,
} from '../src/services/benchmarkService';
import { llamaProvider } from '../src/providers/llamaProvider';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/docs',
  exists: jest.fn().mockResolvedValue(true),
}));

jest.mock('react-native-device-info', () => ({
  getTotalMemory: jest.fn().mockResolvedValue(8 * 1024 * 1024 * 1024),
  getUsedMemory: jest.fn().mockResolvedValue(3 * 1024 * 1024 * 1024),
}));

jest.mock('../src/providers/llamaProvider', () => ({
  llamaProvider: {
    isReady: jest.fn(),
    getNativeContext: jest.fn(),
    getStatus: jest.fn(),
  },
}));

jest.mock('../src/services/accelerationCapabilityService', () => ({
  getRuntimeAccelerationState: jest.fn().mockReturnValue({
    on: true,
    backendLabel: 'OpenCL',
  }),
}));

describe('benchmarkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const sampleResult: BenchmarkResult = {
    modelName: 'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    deviceModel: 'Google Pixel 8',
    osVersion: 'Android 14',
    accelBackend: 'OpenCL',
    promptTokens: 120,
    promptTimeMs: 250,
    promptTokPerSec: 48.0,
    ttftMs: 255,
    generationTokens: 64,
    generationTimeMs: 4000,
    generationTokPerSec: 16.0,
    totalTimeMs: 4255,
    peakRamMb: 3500,
    totalRamMb: 8192,
    timestamp: 1700000000000,
  };

  it('formats a Reddit /r/LocalLLaMA style markdown card', () => {
    const card = formatRedditBenchmarkCard(sampleResult);
    expect(card).toContain('### 📱 ofln On-Device Benchmark');
    expect(card).toContain('| **Model** | `SmolLM2-1.7B-Instruct-Q4_K_M.gguf` |');
    expect(card).toContain('| **Device** | Google Pixel 8 (Android 14) |');
    expect(card).toContain('| **Backend** | OpenCL |');
    expect(card).toContain('| **Prompt Eval (PP)** | **48.0 tok/s** (120 tok in 250 ms) |');
    expect(card).toContain('| **Generation (TG)** | **16.0 tok/s** (64 tok in 4000 ms) |');
    expect(card).toContain('| **TTFT (Time to 1st token)** | **255 ms** |');
    expect(card).toContain('| **RAM** | 3.4 GB / 8.0 GB |');
    expect(card).toContain('*Benchmarked 100% offline via [ofln](https://github.com/Darwin27264/ofln) on Android*');
  });

  it('has a well-formed benchmark prompt', () => {
    expect(typeof STANDARD_BENCHMARK_PROMPT).toBe('string');
    expect(STANDARD_BENCHMARK_PROMPT.length).toBeGreaterThan(50);
  });

  it('loads last benchmark from AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(sampleResult));
    const loaded = await loadLastBenchmark();
    expect(loaded).toEqual(sampleResult);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(BENCHMARK_STORAGE_KEY);
  });

  it('returns null if no benchmark is saved in AsyncStorage', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    const loaded = await loadLastBenchmark();
    expect(loaded).toBeNull();
  });

  it('throws an error if running benchmark without loaded model', async () => {
    (llamaProvider.isReady as jest.Mock).mockReturnValue(false);
    await expect(runBenchmark()).rejects.toThrow('No model loaded');
  });

  it('runs benchmark completion and stores result when model is ready', async () => {
    (llamaProvider.isReady as jest.Mock).mockReturnValue(true);
    (llamaProvider.getStatus as jest.Mock).mockReturnValue({
      modelPath: '/data/models/SmolLM2-1.7B-Instruct-Q4_K_M.gguf',
    });

    const mockCompletion = jest.fn().mockImplementation((params, onToken) => {
      onToken();
      onToken();
      return Promise.resolve({
        timings: {
          prompt_n: 120,
          prompt_ms: 240,
          prompt_per_second: 50.0,
          predicted_n: 64,
          predicted_ms: 3200,
          predicted_per_second: 20.0,
        },
      });
    });

    (llamaProvider.getNativeContext as jest.Mock).mockReturnValue({
      completion: mockCompletion,
    });

    const progressStages: string[] = [];
    const res = await runBenchmark((stage) => progressStages.push(stage));

    expect(res.modelName).toBe('SmolLM2-1.7B-Instruct-Q4_K_M.gguf');
    expect(res.promptTokPerSec).toBe(50.0);
    expect(res.generationTokPerSec).toBe(20.0);
    expect(res.generationTokens).toBe(64);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      BENCHMARK_STORAGE_KEY,
      expect.any(String),
    );
    expect(progressStages.length).toBeGreaterThan(0);
  });
});
