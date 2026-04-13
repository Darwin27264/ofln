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
  }> {
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

      // Conservative n_ctx for Android
      if (n_ctx > 2048) {
        n_ctx = Math.min(2048, n_ctx);
      }
    }

    return { n_ctx, n_gpu_layers, use_mlock, devices };
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

    try {
      // Validate model file exists
      const fileExists = await RNFS.exists(modelPath);
      if (!fileExists) {
        const msg = `Model file does not exist: ${modelPath}`;
        this.setStatus({ state: 'error', error: msg });
        await logError('LlamaProvider', msg);
        return false;
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
      const modelOptions: Parameters<typeof llama.languageModel>[1] = {
        contextParams: {
          n_ctx: resolved.n_ctx,
          n_gpu_layers: resolved.n_gpu_layers,
        },
      };

      if (projectorPath) {
        modelOptions.projectorPath = projectorPath;
        modelOptions.projectorUseGpu = projectorUseGpu;
      }

      this.modelInstance = llama.languageModel(modelPath, modelOptions);

      // Prepare the model (loads into memory)
      await this.modelInstance.prepare();

      this.languageModel = this.modelInstance as LanguageModelV1;

      this.setStatus({ state: 'ready', error: null });

      if (__DEV__) {
        console.log('[LlamaProvider] Model ready:', modelPath.split('/').pop());
      }

      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.setStatus({ state: 'error', error: errorMsg });
      await logError(
        'LlamaProvider',
        `Failed to load model: ${errorMsg}`,
        error instanceof Error ? error : undefined,
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
