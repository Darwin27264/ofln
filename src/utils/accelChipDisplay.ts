/**
 * Pure formatting for acceleration status (S21).
 * Used when writing to app logs — no native imports (Jest-safe).
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
  /** One-line log message */
  message: string;
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

  return {
    shortLabel,
    message,
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
