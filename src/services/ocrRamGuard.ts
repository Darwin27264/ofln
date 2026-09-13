/**
 * Temporarily unload the LLM before heavy OCR/PDF extract when free RAM is tight,
 * then restore the previous model path.
 */

import { llamaProvider } from '../providers/llamaProvider';
import { isRamTightForOcr } from './ramFitService';

export type OcrRamGuardResult<T> = {
  result: T;
  unloadedModel: boolean;
};

export async function withOcrRamHeadroom<T>(
  run: () => Promise<T>,
): Promise<OcrRamGuardResult<T>> {
  const status = llamaProvider.getStatus();
  const modelPath = status.modelPath;
  const wasReady = llamaProvider.isReady() && !!modelPath;
  let unloadedModel = false;

  if (wasReady) {
    const tight = await isRamTightForOcr();
    if (tight) {
      console.warn(
        '[OCR] Available RAM tight — unloading LLM before native OCR/PDF extract',
        { modelPath },
      );
      try {
        await llamaProvider.unloadModel();
        unloadedModel = true;
      } catch (e) {
        console.warn('[OCR] Unload before OCR failed (continuing)', e);
      }
    }
  }

  const started = Date.now();
  try {
    const result = await run();
    console.log('[OCR] Extract finished', {
      ms: Date.now() - started,
      unloadedModel,
    });
    return { result, unloadedModel };
  } finally {
    if (unloadedModel && modelPath) {
      console.log('[OCR] Reloading LLM after OCR', { modelPath });
      try {
        await llamaProvider.loadModel({ modelPath });
      } catch (e) {
        console.warn('[OCR] Reload after OCR failed', e);
      }
    }
  }
}
