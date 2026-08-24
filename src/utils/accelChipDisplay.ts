/**
 * Pure formatting for acceleration status.
 * Used when writing to app logs / calm UI chips — no native imports (Jest-safe).
 */

export type AccelStatusSnapshotLike = {
  available: boolean;
  availableKind: 'htp' | 'opencl' | 'none';
  availableLabel: string;
  /** null when no model is loaded */
  on: boolean | null;
  onLabel: string;
  summary: string;
};

export type AccelLogDisplay = {
  /** Short status tag: CPU | GPU | NPU | Accel | none */
  shortLabel: string;
  /** One-line log / alert message */
  message: string;
  /** Slightly longer calm copy for Settings-style alerts */
  detailMessage: string;
  context: {
    available: boolean;
    availableKind: string;
    availableLabel: string;
    on: boolean | null;
    onLabel: string;
    summary: string;
  };
};

/**
 * Map a status snapshot to log message + context.
 * Does not detect hardware — snapshot comes from getAccelerationStatusSnapshot.
 */
export function formatAccelLogDisplay(
  snap: AccelStatusSnapshotLike,
): AccelLogDisplay {
  let shortLabel = 'none';
  if (snap.on === true) {
    if (snap.availableKind === 'htp') shortLabel = 'NPU';
    else if (snap.availableKind === 'opencl') shortLabel = 'GPU';
    else shortLabel = 'Accel';
  } else if (snap.on === false) {
    shortLabel = 'CPU';
  }

  const statusLine =
    snap.on === null
      ? 'No model loaded'
      : snap.on
        ? `On · ${snap.onLabel}`
        : snap.onLabel;

  const availableLine = `Available: ${
    snap.available ? snap.availableLabel : 'None detected'
  }`;

  const message = `${statusLine}. ${availableLine}`;

  const hint =
    snap.on === true
      ? 'Layers are offloaded on this device for the current model.'
      : snap.on === false && snap.available
        ? 'Hardware is present, but this load is on CPU (quant allowlist, layers, or emulator). Prefer Q4_0 or Q6_K with GPU layers > 0.'
        : snap.on === false
          ? 'Running on CPU. OpenCL/Hexagon acceleration is Android-only and device-dependent.'
          : 'Load a model to see whether GPU/NPU offload is active.';

  const detailMessage = `${message}\n\n${hint}`;

  return {
    shortLabel,
    message,
    detailMessage,
    context: {
      available: snap.available,
      availableKind: snap.availableKind,
      availableLabel: snap.availableLabel,
      on: snap.on,
      onLabel: snap.onLabel,
      summary: snap.summary,
    },
  };
}

/**
 * Calm per-turn speed label for chat (matches Stages wording).
 * Empty string when tps is missing or non-positive.
 */
export function formatTokensPerSecondLabel(tps: number): string {
  if (typeof tps !== 'number' || !Number.isFinite(tps) || tps <= 0) {
    return '';
  }
  const rounded =
    tps >= 100 ? Math.round(tps) : Math.round(tps * 10) / 10;
  return `${rounded} tok/s`;
}
