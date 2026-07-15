/**
 * Llama Provider — @react-native-ai/llama integration
 *
 * Wraps the Vercel AI SDK llama provider with the app's existing
 * platform-specific acceleration logic (HTP, OpenCL, Samsung
 * workarounds, quant allowlisting) so `streamText()` works
 * seamlessly while preserving all native optimisations.
 *
 * Usage:
 *   const provider = LlamaProvider.getInstance();
 *   await provider.loadModel({ modelPath, contextParams: { ... } });
 *   const model = provider.getLanguageModel();
 *   // model is now usable with `streamText({ model, ... })`
 */

import { Platform } from 'react-native';
import { llama, downloadModel, isModelDownloaded, getModelPath } from '@react-native-ai/llama';
import type { LanguageModelV1 } from 'ai';
import RNFS from 'react-native-fs';

import { getModelSettings, DEFAULT_SETTINGS } from '../services/modelSettingsService';
import { getAccelerationConfig } from '../services/accelerationCapabilityService';
import { isAndroidEmulator } from '../services/deviceEnv';
import { getModelInfo, detectQuantFromFilename, isQuantAllowedForAndroidAccel } from '../services/modelInfoService';
import { getInferencePerfParams, formatLoadError } from '../services/inferencePerfParams';
import { ensureGgufSafeForAndroidLoad } from '../services/ggufSanitizeService';
import { logError } from '../utils/errorLogger';
import type { LlamaProviderConfig, ModelReadyState, ModelStatus } from '../types/ai';
type StatusListener = (status: ModelStatus) => void;

class LlamaProviderService {
  private languageModel: LanguageModelV1 | null = null;
  private modelInstance: any = null; // @react-native-ai/llama model instance
  private status: ModelStatus = {
    state: 'idle',
    modelPath: null,
    projectorPath: null,
    error: null,
  };
  private listeners: Set<StatusListener> = new Set();
  /** Dedup concurrent loadModel calls (UI effects previously thrashed this). */
  private loadInFlight: Promise<boolean> | null = null;
  private loadInFlightPath: string | null = null;

  // ── Status Management ──────────────────────────────────────────────────

  getStatus(): ModelStatus {
    return { ...this.status };
  }

  subscribe(listener: StatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setStatus(patch: Partial<ModelStatus>) {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) {
      listener(this.getStatus());
    }
  }

  isReady(): boolean {
    return this.status.state === 'ready' && this.languageModel !== null;
  }

  // ── Platform-specific Config Resolution ────────────────────────────────

  /**
   * Resolves the optimal context parameters for the current device,
   * mirroring the existing `loadModel()` logic in llamaService.ts.
   */
  private async resolveContextParams(
    filePath: string,
    userConfig?: LlamaProviderConfig['contextParams'],
  ): Promise<{
    n_ctx: number;
    n_gpu_layers: number;
    use_mlock: boolean;
    devices?: string[];
  } & ReturnType<typeof getInferencePerfParams>> {
    const fileName = filePath.split('/').pop() || '';
    let settings;
    try {
      settings = await getModelSettings(fileName);
    } catch {
      settings = DEFAULT_SETTINGS;
    }

    let n_ctx = userConfig?.n_ctx ?? settings.n_ctx;
    let n_gpu_layers = userConfig?.n_gpu_layers ?? settings.n_gpu_layers;
    let use_mlock = userConfig?.use_mlock ?? true;
    let devices = userConfig?.devices;

    if (Platform.OS === 'android') {
      use_mlock = false;

      const isEmulator = isAndroidEmulator();
      const modelUri = filePath.startsWith('file://') ? filePath : `file://${filePath}`;
      const info = await getModelInfo(modelUri);

      const infoQuant =
        info && typeof (info as any).general?.quantization === 'string'
          ? ((info as any).general.quantization as string)
          : null;
      const quant = infoQuant || detectQuantFromFilename(fileName);

      if (isEmulator) {
        n_gpu_layers = 0;
        n_ctx = Math.min(n_ctx, 1024);
      } else if (!isQuantAllowedForAndroidAccel(quant)) {
        n_gpu_layers = 0;
      } else {
        const accelConfig = await getAccelerationConfig();
        const maxCap = accelConfig.suggestedMaxGpuLayers;
        n_gpu_layers = Math.max(0, Math.min(maxCap > 0 ? maxCap : 8, n_gpu_layers));
        if (accelConfig.preferredDevices && accelConfig.preferredDevices.length > 0) {
          devices = accelConfig.preferredDevices;
        }
      }

      // Conservative n_ctx for Android devices
      if (n_ctx > 2048) {
        n_ctx = Math.min(2048, n_ctx);
      }

      return {
        n_ctx,
        n_gpu_layers,
        use_mlock,
        devices,
        ...getInferencePerfParams(n_gpu_layers, { isEmulator }),
      };
    }

    return {
      n_ctx,
      n_gpu_layers,
      use_mlock,
      devices,
      ...getInferencePerfParams(n_gpu_layers),
    };
  }

  // ── Model Lifecycle ────────────────────────────────────────────────────

  /**
   * Load a GGUF model into memory and create an AI SDK LanguageModel.
   *
   * Applies the same platform-specific acceleration gating as the
   * existing `loadModel()` in llamaService.ts, then delegates to
   * `@react-native-ai/llama`'s provider for AI SDK compatibility.
   */
  async loadModel(config: LlamaProviderConfig): Promise<boolean> {
    const { modelPath, projectorPath, projectorUseGpu = true, contextParams } = config;

    // Already ready for this exact path — do not unload/reload (freezes UI / wastes RAM).
    if (this.isReady() && this.status.modelPath === modelPath) {
      return true;
    }

    // Coalesce concurrent callers requesting the same path.
    if (this.loadInFlight && this.loadInFlightPath === modelPath) {
      return this.loadInFlight;
    }

    const run = this.loadModelInternal(config);
    this.loadInFlight = run;
    this.loadInFlightPath = modelPath;
    try {
      return await run;
    } finally {
      if (this.loadInFlightPath === modelPath) {
        this.loadInFlight = null;
        this.loadInFlightPath = null;
      }
    }
  }

  private async loadModelInternal(config: LlamaProviderConfig): Promise<boolean> {
    const { modelPath, projectorPath, projectorUseGpu = true, contextParams } = config;

    try {
      // Validate model file exists
      const fileExists = await RNFS.exists(modelPath);
      if (!fileExists) {
        const msg = `Model file does not exist: ${modelPath}`;
        this.setStatus({ state: 'error', error: msg });
        await logError('LlamaProvider', msg);
        return false;
      }

      if (isAndroidEmulator()) {
        try {
          const stat = await RNFS.stat(modelPath);
          const sizeMB = Math.round((Number(stat.size) || 0) / (1024 * 1024));
          if (sizeMB >= 1600) {
            const msg =
              `Model is too large for the Android emulator (${sizeMB} MB). ` +
              `Use Qwen3.5 0.8B / 2B Q4_0, or raise AVD RAM to 6GB+.`;
            this.setStatus({ state: 'error', error: msg });
            await logError('LlamaProvider', msg, new Error(msg), {
              modelPath,
              sizeMB,
              isEmulator: true,
            });
            return false;
          }
        } catch {
          /* continue — size check is best-effort */
        }
      }

      if (Platform.OS === 'android') {
        await ensureGgufSafeForAndroidLoad(modelPath);
      }

      // Unload previous model if any
      await this.unloadModel();

      this.setStatus({
        state: 'preparing',
        modelPath,
        projectorPath: projectorPath ?? null,
        error: null,
      });

      // Resolve platform-specific parameters
      const resolved = await this.resolveContextParams(modelPath, contextParams);

      if (__DEV__) {
        console.log('[LlamaProvider] Resolved context params:', resolved);
      }

      // Create language model via the AI SDK provider.
      // `llama.languageModel` accepts the local file path and optional config.
      const buildOptions = (bare: boolean): Parameters<typeof llama.languageModel>[1] => {
        const ctx: Record<string, unknown> = {
          n_ctx: bare ? Math.min(512, resolved.n_ctx) : resolved.n_ctx,
          n_gpu_layers: bare ? 0 : resolved.n_gpu_layers,
          use_mlock: resolved.use_mlock,
        };
        if (!bare) {
          ctx.flash_attn_type = resolved.flash_attn_type;
          ctx.n_batch = resolved.n_batch;
          if (resolved.cache_type_k) ctx.cache_type_k = resolved.cache_type_k;
          if (resolved.cache_type_v) ctx.cache_type_v = resolved.cache_type_v;
          if (resolved.devices && resolved.devices.length > 0 && resolved.n_gpu_layers > 0) {
            ctx.devices = resolved.devices;
          }
        }
        const opts: Parameters<typeof llama.languageModel>[1] = {
          contextParams: ctx as any,
        };
        if (projectorPath) {
          opts.projectorPath = projectorPath;
          opts.projectorUseGpu = projectorUseGpu;
        }
        return opts;
      };

      try {
        this.modelInstance = llama.languageModel(modelPath, buildOptions(false));
        await this.modelInstance.prepare();
      } catch (primaryError) {
        if (__DEV__) {
          console.warn(
            '[LlamaProvider] Primary prepare failed, retrying bare params:',
            primaryError instanceof Error ? primaryError.message : primaryError,
          );
        }
        try {
          await this.unloadModel();
        } catch {
          /* ignore */
        }
        this.modelInstance = llama.languageModel(modelPath, buildOptions(true));
        await this.modelInstance.prepare();
      }

      this.languageModel = this.modelInstance as LanguageModelV1;

      this.setStatus({
        state: 'ready',
        modelPath,
        projectorPath: projectorPath ?? null,
        error: null,
      });

      if (__DEV__) {
        console.log('[LlamaProvider] Model ready:', modelPath.split('/').pop());
      }

      return true;
    } catch (error) {
      const errorMsg = formatLoadError(error);
      this.setStatus({ state: 'error', error: errorMsg });
      await logError(
        'LlamaProvider',
        `Failed to load model: ${errorMsg}`,
        error instanceof Error ? error : new Error(errorMsg),
        { modelPath },
      );
      return false;
    }
  }

  /**
   * Unload the current model and free resources.
   */
  async unloadModel(): Promise<void> {
    if (this.modelInstance) {
      try {
        await this.modelInstance.unload();
      } catch (error) {
        if (__DEV__) {
          console.warn('[LlamaProvider] Error unloading model:', error);
        }
      }
      this.modelInstance = null;
      this.languageModel = null;
      this.setStatus({
        state: 'unloaded',
        modelPath: null,
        projectorPath: null,
        error: null,
      });
    }
  }

  /**
   * Get the AI SDK LanguageModel for use with `streamText()` / `generateText()`.
   * Returns null if no model is loaded.
   */
  getLanguageModel(): LanguageModelV1 | null {
    return this.languageModel;
  }

  /**
   * Access the underlying llama.rn native context for advanced operations
   * (e.g. stopCompletion, direct completion with thinking params).
   */
  getNativeContext(): any | null {
    if (!this.modelInstance) return null;
    try {
      return this.modelInstance.getContext();
    } catch {
      return null;
    }
  }

  // ── Model Download Helpers ─────────────────────────────────────────────

  /**
   * Download a model from HuggingFace using the @react-native-ai/llama
   * storage API. Model ID format: "owner/repo/filename.gguf"
   */
  async downloadModelFromHub(
    modelId: string,
    onProgress?: (percentage: number) => void,
  ): Promise<string> {
    this.setStatus({ state: 'downloading', error: null });
    try {
      const modelPath = await downloadModel(modelId, onProgress ? (p) => onProgress(p.percentage) : undefined);
      this.setStatus({ state: 'idle' });
      return modelPath;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.setStatus({ state: 'error', error: msg });
      throw error;
    }
  }

  /**
   * Check if a HuggingFace model is already downloaded.
   */
  async isModelDownloaded(modelId: string): Promise<boolean> {
    return isModelDownloaded(modelId);
  }

  /**
   * Get the local path for a HuggingFace model ID.
   */
  getModelPath(modelId: string): string {
    return getModelPath(modelId);
  }
}

/** Singleton provider instance */
export const llamaProvider = new LlamaProviderService();
