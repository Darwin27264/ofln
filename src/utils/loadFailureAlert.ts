/**
 * S10 — actionable CTAs on model load failures (retry / models / lower ctx).
 */

import { showAlert } from '../components/CustomAlert';
import {
  getModelSettings,
  saveModelSettings,
  SETTING_RANGES,
  snapNCtx,
} from '../services/modelSettingsService';
import type { UserFacingError, UserFacingErrorKind } from './userFacingErrors';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'destructive' | 'cancel';
};

export type LoadFailureActions = {
  /** Retry the same load. */
  onRetry?: () => void;
  /** Navigate to Models (pick a smaller / different GGUF). */
  onModels?: () => void;
  /**
   * Model file name for OOM "Lower context" — steps n_ctx down one notch and
   * calls onRetry when provided.
   */
  modelFileName?: string | null;
  /** After lowering context, reload (defaults to onRetry). */
  onAfterLowerContext?: () => void;
};

/** Drop n_ctx one discrete step. Returns new value or null if already at min. */
export async function lowerModelContextOneStep(
  fileName: string,
): Promise<{ ok: true; n_ctx: number } | { ok: false; reason: 'already_min' | 'error' }> {
  try {
    const settings = await getModelSettings(fileName);
    const values = SETTING_RANGES.n_ctx.values as readonly number[];
    const current = snapNCtx(settings.n_ctx);
    const idx = values.indexOf(current);
    const at = idx >= 0 ? idx : values.indexOf(2048);
    if (at <= 0) {
      return { ok: false, reason: 'already_min' };
    }
    const next = values[at - 1] as (typeof SETTING_RANGES.n_ctx.values)[number];
    await saveModelSettings(fileName, { ...settings, n_ctx: next });
    return { ok: true, n_ctx: next };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

function buildButtons(
  kind: UserFacingErrorKind,
  actions: LoadFailureActions,
): AlertButton[] {
  const buttons: AlertButton[] = [];
  const retry = actions.onRetry;
  const models = actions.onModels;
  const file = actions.modelFileName;
  const afterLower = actions.onAfterLowerContext ?? retry;

  const pushLowerContext = () => {
    if (!file || !afterLower) return;
    buttons.push({
      text: 'Lower context',
      onPress: () => {
        void (async () => {
          const result = await lowerModelContextOneStep(file);
          if (result.ok) {
            afterLower();
            return;
          }
          if (result.reason === 'already_min') {
            showAlert(
              'Already at minimum',
              'Context is already as low as the app allows. Try a smaller model instead.',
              [
                ...(models
                  ? [{ text: 'Models', onPress: models } as AlertButton]
                  : []),
                { text: 'OK', style: 'cancel' },
              ],
            );
            return;
          }
          showAlert(
            "Couldn't change context",
            'Open Model Settings and lower context size manually.',
            [{ text: 'OK' }],
          );
        })();
      },
    });
  };

  if (kind === 'oom') {
    pushLowerContext();
    if (models) buttons.push({ text: 'Models', onPress: models });
    if (retry) buttons.push({ text: 'Retry', style: 'cancel', onPress: retry });
  } else if (kind === 'corrupt') {
    if (models) buttons.push({ text: 'Models', onPress: models });
    if (retry) buttons.push({ text: 'Retry', style: 'cancel', onPress: retry });
  } else if (kind === 'not_found') {
    if (models) buttons.push({ text: 'Models', onPress: models });
    if (retry) buttons.push({ text: 'Retry', style: 'cancel', onPress: retry });
  } else {
    // generic_load and others
    if (retry) buttons.push({ text: 'Retry', onPress: retry });
    if (models) buttons.push({ text: 'Models', style: 'cancel', onPress: models });
  }

  if (buttons.length === 0) {
    buttons.push({ text: 'OK' });
  } else if (!buttons.some((b) => b.style === 'cancel' || b.text === 'OK')) {
    buttons.push({ text: 'Cancel', style: 'cancel' });
  }

  return buttons;
}

/** Show S03 copy with kind-aware primary actions. */
export function showLoadFailureAlert(
  uf: UserFacingError,
  actions: LoadFailureActions = {},
): void {
  showAlert(uf.title, uf.message, buildButtons(uf.kind, actions), {
    textAlign: 'left',
  });
}
