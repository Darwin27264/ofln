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
import type { LanguageModel } from 'ai';
import RNFS from 'react-native-fs';

import { getModelSettings, DEFAULT_SETTINGS } from '../services/modelSettingsService';
import {
  getAccelerationConfig,
  setRuntimeAccelerationState,
  getAccelerationStatusSnapshot,
} from '../services/accelerationCapabilityService';
import { isAndroidEmulator } from '../services/deviceEnv';
import { getModelInfo, detectQuantFromFilename, isQuantAllowedForAndroidAccel } from '../services/modelInfoService';
import { getInferencePerfParams, formatLoadError } from '../services/inferencePerfParams';
import { ensureGgufSafeForAndroidLoad } from '../services/ggufSanitizeService';
import { resolveModelPolicy } from '../services/inference/modelPolicy';
import { formatAccelLogDisplay } from '../utils/accelChipDisplay';
import {
  formatRamGb,
  getTotalMemoryBytes,
  preflightLoadRam,
  suggestNCtxForRam,
} from '../services/ramFitService';
import {
  clearModelLoadInProgress,
  markModelLoadInProgress,
  setSuppressModelAutoload,
} from '../services/safeBootService';
import { logError } from '../utils/errorLogger';
import type { LlamaProviderConfig, ModelStatus } from '../types/ai';
type StatusListener = (status: ModelStatus) => void;

class LlamaProviderService {
  private languageModel: LanguageModel | null = null;
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
   * Resolves the optimal context parameters for the current device
   * (Android accel gating, mlock, soft n_ctx caps).
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
    const totalMemoryBytes = await getTotalMemoryBytes();
    const isEmulator = isAndroidEmulator();

    if (Platform.OS === 'android') {
      use_mlock = false;

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

      // Final n_ctx is RAM-clamped in loadModelInternal after model size is known.
      return {
        n_ctx,
        n_gpu_layers,
        use_mlock,
        devices,
        ...getInferencePerfParams(n_gpu_layers, { isEmulator, totalMemoryBytes }),
      };
    }

    return {
      n_ctx,
      n_gpu_layers,
      use_mlock,
      devices,
      ...getInferencePerfParams(n_gpu_layers, { totalMemoryBytes }),
    };
  }

  // ── Model Lifecycle ────────────────────────────────────────────────────

  /**
   * Sole product load path: resolve accel params, prepare
   * `@react-native-ai/llama`, expose native context via getNativeContext().
   */
  async loadModel(config: LlamaProviderConfig): Promise<boolean> {
    const { modelPath } = config;

    // Already ready for this exact path with a live native context — skip reload.
    if (
      this.isReady() &&
      this.status.modelPath === modelPath &&
      this.getNativeContext()
    ) {
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

      const modelFileName = modelPath.split(/[/\\]/).pop() || modelPath;
      if (Platform.OS === 'android') {
        await ensureGgufSafeForAndroidLoad(modelPath, { modelName: modelFileName });
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

      console.log('[LlamaProvider] Resolved context params:', {
        n_ctx: resolved.n_ctx,
        n_gpu_layers: resolved.n_gpu_layers,
        use_mlock: resolved.use_mlock,
        cache_type_k: resolved.cache_type_k,
        cache_type_v: resolved.cache_type_v,
        flash_attn_type: resolved.flash_attn_type,
        n_batch: resolved.n_batch,
        devices: resolved.devices,
      });

      // Pre-flight RAM: clamp n_ctx from available memory, then gate load.
      let modelBytes = 0;
      try {
        const stat = await RNFS.stat(modelPath);
        modelBytes = Number(stat.size) || 0;
      } catch {
        /* size unknown — still attempt available-RAM check with 0 model bytes */
      }

      const cacheType =
        resolved.cache_type_k === 'q4_0' || resolved.cache_type_v === 'q4_0'
          ? 'q4_0'
          : 'q8_0';
      const requestedNCtx = resolved.n_ctx;
      const suggestedNCtx = await suggestNCtxForRam({
        modelBytes,
        requestedNCtx,
        cacheType,
      });
      if (suggestedNCtx < requestedNCtx) {
        console.warn(
          `[LlamaProvider] n_ctx clamped ${requestedNCtx} → ${suggestedNCtx} for available RAM`,
        );
        resolved.n_ctx = suggestedNCtx;
      }

      const ramGate = await preflightLoadRam({
        modelBytes,
        nCtx: resolved.n_ctx,
        cacheType,
      });
      console.log('[LlamaProvider] RAM preflight', {
        ok: ramGate.ok,
        available: ramGate.availableBytes != null ? formatRamGb(ramGate.availableBytes) : 'unknown',
        model: formatRamGb(ramGate.modelBytes),
        expectedKv: formatRamGb(ramGate.expectedKvBytes),
        headroom: formatRamGb(ramGate.headroomBytes),
        required: formatRamGb(ramGate.requiredBytes),
        n_ctx: resolved.n_ctx,
        cacheType,
        reason: ramGate.reason,
      });
      if (!ramGate.ok) {
        const msg =
          `Not enough free RAM to load this model safely ` +
          `(need ~${formatRamGb(ramGate.requiredBytes)}, ` +
          `have ~${formatRamGb(ramGate.availableBytes ?? 0)}). ` +
          `Try a smaller quant or lower context.`;
        this.setStatus({ state: 'error', error: msg });
        await logError('LlamaProvider', msg, new Error(ramGate.reason || 'insufficient_ram'), {
          modelPath: modelFileName,
          ...ramGate,
        });
        return false;
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

      const prepareOnce = async (bare: boolean) => {
        this.modelInstance = llama.languageModel(modelPath, buildOptions(bare));
        await this.modelInstance.prepare();
      };

      const prepareWithBareFallback = async (label: string) => {
        try {
          await prepareOnce(false);
        } catch (primaryError) {
          console.warn(
            `[LlamaProvider] ${label} prepare failed, retrying bare params:`,
            formatLoadError(primaryError),
          );
          try {
            await this.unloadModel();
          } catch {
            /* ignore */
          }
          await prepareOnce(true);
        }
      };

      // Persist across process death: if native OOM kills us mid-prepare, next
      // launch sees this flag and suppresses autoload (Safe Mode).
      await markModelLoadInProgress();
      try {
        try {
          await prepareWithBareFallback('Primary');
        } catch (prepareError) {
          // Android: llama.rn often throws opaque "Unknown error" when chat_template
          // overflows the native 16KB buffer or Minja chokes — force-pad and retry.
          if (Platform.OS !== 'android') {
            throw prepareError;
          }
          console.warn(
            '[LlamaProvider] Prepare failed — force-sanitizing chat_template and retrying:',
            formatLoadError(prepareError),
          );
          try {
            await this.unloadModel();
          } catch {
            /* ignore */
          }
          await ensureGgufSafeForAndroidLoad(modelPath, {
            force: true,
            modelName: modelFileName,
          });
          this.setStatus({
            state: 'preparing',
            modelPath,
            projectorPath: projectorPath ?? null,
            error: null,
          });
          await prepareWithBareFallback('Post-sanitize');
        }

        // Repair incomplete model details, then probe chat formatting before
        // marking ready — prevents "loaded but every send crashes" on device.
        this.ensureContextModelDetails();
        let probe = await this.probeChatFormatting();

        if (!probe.ok) {
          await logError(
            'LlamaProvider',
            `Chat format probe failed after load: ${probe.error}`,
            probe.error ? new Error(probe.error) : undefined,
            { modelPath: modelPath.split('/').pop() },
            'WARN',
          );

          if (Platform.OS === 'android') {
            try {
              await this.unloadModel();
            } catch {
              /* ignore */
            }
            await ensureGgufSafeForAndroidLoad(modelPath, {
              force: true,
              modelName: modelFileName,
            });
            this.setStatus({
              state: 'preparing',
              modelPath,
              projectorPath: projectorPath ?? null,
              error: null,
            });
            try {
              await prepareWithBareFallback('Post-probe sanitize');
            } catch (e) {
              throw e;
            }
            this.ensureContextModelDetails();
            probe = await this.probeChatFormatting();
          }
        }

        if (!probe.ok) {
          const msg =
            `Model loaded but chat formatting failed (${probe.error}). ` +
            `Try a different GGUF or reinstall the model.`;
          try {
            await this.unloadModel();
          } catch {
            /* ignore */
          }
          this.setStatus({ state: 'error', error: msg });
          await logError('LlamaProvider', msg, new Error(probe.error || msg), {
            modelPath: modelPath.split('/').pop(),
          });
          return false;
        }

        this.captureRuntimeAcceleration(
          modelPath.split('/').pop() || modelPath,
          resolved.n_gpu_layers,
        );

        this.languageModel = this.modelInstance as LanguageModel;

        this.setStatus({
          state: 'ready',
          modelPath,
          projectorPath: projectorPath ?? null,
          error: null,
        });

        // Successful intentional load ends Safe Mode autoload suppress.
        void setSuppressModelAutoload(false);

        console.log('[LlamaProvider] Model ready:', modelPath.split('/').pop());

        return true;
      } catch (error) {
        const errorMsg = formatLoadError(error);
        const enriched =
          /unknown error/i.test(errorMsg) && Platform.OS === 'android'
            ? `${errorMsg} — often a GGUF chat_template / native init failure on Android. Delete the model and re-download, or try another GGUF.`
            : errorMsg;
        this.setStatus({ state: 'error', error: enriched });
        await logError(
          'LlamaProvider',
          `Failed to load model: ${enriched}`,
          error instanceof Error ? error : new Error(enriched),
          {
            modelPath,
            raw: formatLoadError(error),
            keys:
              error && typeof error === 'object'
                ? Object.getOwnPropertyNames(error as object)
                : [],
          },
          // Avoid red LogBox for handled load failures — Diagnostics still has the file log.
          'WARN',
        );
        return false;
      } finally {
        // JS failure/success clears the flag. Process death skips finally → next boot Safe Mode.
        await clearModelLoadInProgress();
      }
    } catch (error) {
      const errorMsg = formatLoadError(error);
      this.setStatus({ state: 'error', error: errorMsg });
      await logError(
        'LlamaProvider',
        `Failed to load model: ${errorMsg}`,
        error instanceof Error ? error : new Error(errorMsg),
        { modelPath },
        'WARN',
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
      setRuntimeAccelerationState(null);
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
  getLanguageModel(): LanguageModel | null {
    return this.languageModel;
  }

  /**
   * Access the underlying llama.rn native context for advanced operations
   * (e.g. stopCompletion, direct completion with thinking params).
   */
  getNativeContext(): any | null {
    if (!this.modelInstance) return null;
    try {
      this.ensureContextModelDetails();
      return this.modelInstance.getContext();
    } catch {
      return null;
    }
  }

  /**
   * Snapshot GPU/NPU state once after load (Stages + app logs).
   * Does not run during inference.
   */
  private captureRuntimeAcceleration(modelName: string, nGpuLayers: number): void {
    try {
      const ctx = this.modelInstance?.getContext?.();
      const gpu = !!(ctx && (ctx as any).gpu);
      const reasonNoGPU =
        typeof (ctx as any)?.reasonNoGPU === 'string'
          ? (ctx as any).reasonNoGPU
          : undefined;
      const devicesRaw = (ctx as any)?.devices;
      const devices = Array.isArray(devicesRaw)
        ? devicesRaw.map(String)
        : undefined;
      const backendLabel = gpu
        ? devices && devices.length > 0
          ? devices.join(', ')
          : nGpuLayers > 0
            ? `GPU layers ${nGpuLayers}`
            : 'GPU'
        : 'CPU';
      setRuntimeAccelerationState({
        on: gpu && nGpuLayers > 0,
        backendLabel,
        reasonNoGPU,
        devices,
        nGpuLayers,
        modelName,
      });
    } catch {
      setRuntimeAccelerationState({
        on: false,
        backendLabel: 'CPU',
        nGpuLayers: 0,
        modelName,
      });
    }

    // log accel status to error_log (View Logs) — no chat-chrome chip.
    void this.logRuntimeAcceleration(modelName, nGpuLayers);
  }

  private async logRuntimeAcceleration(
    modelName: string,
    nGpuLayers: number,
  ): Promise<void> {
    try {
      const snap = await getAccelerationStatusSnapshot(true);
      const display = formatAccelLogDisplay(snap);
      await logError(
        'Acceleration',
        `[${display.shortLabel}] ${display.message}`,
        undefined,
        {
          modelName,
          nGpuLayers,
          ...display.context,
        },
        'INFO',
      );
    } catch (err) {
      if (__DEV__) {
        console.warn('[LlamaProvider] Failed to log acceleration status:', err);
      }
    }
  }

  /**
   * llama.rn getFormattedChat reads `model.metadata['tokenizer.chat_template']`.
   * If native createModelDetails failed, metadata is missing and every send
   * throws. Patch a safe stub onto the live context so chat can proceed.
   * @returns whether a repair was applied (native details were incomplete)
   */
  private ensureContextModelDetails(): { repaired: boolean } {
    const ctx = this.modelInstance?.getContext?.();
    if (!ctx) return { repaired: false };

    let repaired = false;
    const model = ctx.model ?? (ctx.model = {});
    if (!model.metadata || typeof model.metadata !== 'object') {
      model.metadata = {};
      repaired = true;
    }
    if (!model.metadata['tokenizer.chat_template']) {
      const fileName =
        this.status.modelPath?.split(/[/\\]/).pop() || this.status.modelPath || '';
      const stub = resolveModelPolicy(fileName).template.familyStub;
      model.metadata['tokenizer.chat_template'] = stub;
      repaired = true;
      void logError(
        'LlamaProvider',
        'model.metadata missing chat_template after load — injected family SAFE stub',
        undefined,
        {
          modelPath: fileName,
          familyId: resolveModelPolicy(fileName).familyId,
        },
        'WARN',
      );
    }
    if (!model.chatTemplates) {
      model.chatTemplates = {
        llamaChat: true,
        jinja: { default: true, toolUse: false },
      };
      repaired = true;
    }
    return { repaired };
  }

  /**
   * Dry-run the exact path that crashes on send (`getFormattedChat` with no
   * explicit template — same as `completion({ messages })`). Cheap (no token
   * generation) and catches missing metadata / bad Jinja early.
   */
  private async probeChatFormatting(): Promise<{ ok: boolean; error?: string }> {
    const ctx = this.modelInstance?.getContext?.();
    if (!ctx || typeof ctx.getFormattedChat !== 'function') {
      return { ok: false, error: 'native context or getFormattedChat unavailable' };
    }
    try {
      // Do NOT pass chat_template here — real sends often omit it and rely on
      // model.metadata / native GGUF templates (known multimodal/chat-template failure mode).
      await ctx.getFormattedChat([{ role: 'user', content: 'ping' }], undefined, {
        jinja: true,
        enable_thinking: false,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
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
