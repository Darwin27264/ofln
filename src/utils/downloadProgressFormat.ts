/**
 * Pure helpers for download speed / ETA display.
 * No native imports — safe for Jest.
 */

export type DownloadProgressSample = {
  t: number;
  bytes: number;
};

export type DownloadProgressInfo = {
  percent: number;
  bytesWritten: number;
  totalBytes: number | null;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
};

/** Bytes/sec from samples in a sliding window (oldest→newest). */
export function computeDownloadRate(
  samples: DownloadProgressSample[],
  windowMs = 8000,
  now = Date.now(),
): number | null {
  if (!Array.isArray(samples) || samples.length < 2) return null;
  const cutoff = now - windowMs;
  const inWindow = samples.filter((s) => s.t >= cutoff);
  const use = inWindow.length >= 2 ? inWindow : samples;
  if (use.length < 2) return null;
  const first = use[0];
  const last = use[use.length - 1];
  const dtSec = (last.t - first.t) / 1000;
  if (!(dtSec >= 0.4)) return null;
  const delta = last.bytes - first.bytes;
  if (!(delta > 0)) return null;
  return delta / dtSec;
}

export function estimateEtaSeconds(
  bytesRemaining: number,
  bytesPerSecond: number | null,
): number | null {
  if (
    !(bytesRemaining > 0) ||
    bytesPerSecond == null ||
    !(bytesPerSecond > 0)
  ) {
    return null;
  }
  const eta = bytesRemaining / bytesPerSecond;
  if (!Number.isFinite(eta) || eta < 0) return null;
  return eta;
}

export function formatBytesShort(bytes: number): string {
  if (!(bytes >= 0) || !Number.isFinite(bytes)) return '—';
  const kb = 1024;
  const mb = kb * 1024;
  const gb = mb * 1024;
  if (bytes >= gb) return `${(bytes / gb).toFixed(bytes >= 10 * gb ? 0 : 1)} GB`;
  if (bytes >= mb) return `${(bytes / mb).toFixed(bytes >= 10 * mb ? 0 : 1)} MB`;
  if (bytes >= kb) return `${Math.round(bytes / kb)} KB`;
  return `${Math.round(bytes)} B`;
}

export function formatBytesPerSecond(bps: number): string {
  if (!(bps > 0) || !Number.isFinite(bps)) return '';
  return `${formatBytesShort(bps)}/s`;
}

/** Calm ETA: always a single short token ("~5s", "~4m", "~2h") — never wraps. */
export function formatEtaSeconds(etaSeconds: number): string {
  if (!(etaSeconds >= 0) || !Number.isFinite(etaSeconds)) return '';
  if (etaSeconds < 60) return `~${Math.max(5, Math.round(etaSeconds / 5) * 5)}s`;
  const mins = Math.round(etaSeconds / 60);
  if (mins < 60) return `~${mins}m`;
  const hours = Math.max(1, Math.round(mins / 60));
  return `~${hours}h`;
}

/**
 * Speed on the first line, ETA on the second (newline-separated).
 * Each line is a short token so ModelCard can pin numberOfLines={1} per row.
 */
export function formatDownloadProgressLine(
  info: Pick<DownloadProgressInfo, 'bytesPerSecond' | 'etaSeconds'>,
): string {
  const speed =
    info.bytesPerSecond != null && info.bytesPerSecond > 0
      ? formatBytesPerSecond(info.bytesPerSecond)
      : '';
  const eta =
    info.etaSeconds != null && info.etaSeconds > 0
      ? formatEtaSeconds(info.etaSeconds)
      : '';
  if (speed && eta) return `${speed}\n${eta}`;
  return speed || eta;
}

/** Split {@link formatDownloadProgressLine} into fixed speed / eta rows. */
export function splitDownloadProgressLines(detail: string | undefined | null): {
  speed: string;
  eta: string;
} {
  if (!detail) return { speed: '', eta: '' };
  const [speed = '', eta = ''] = detail.split('\n');
  return { speed: speed.trim(), eta: eta.trim() };
}

/** Append a sample and trim to window; mutates and returns the array. */
export function pushDownloadSample(
  samples: DownloadProgressSample[],
  bytes: number,
  t = Date.now(),
  windowMs = 8000,
  maxSamples = 40,
): DownloadProgressSample[] {
  samples.push({ t, bytes });
  const cutoff = t - windowMs;
  while (samples.length > 1 && samples[0].t < cutoff) {
    samples.shift();
  }
  while (samples.length > maxSamples) {
    samples.shift();
  }
  return samples;
}

export function buildDownloadProgressInfo(opts: {
  bytesWritten: number;
  totalBytes: number | null;
  samples: DownloadProgressSample[];
  now?: number;
}): DownloadProgressInfo {
  const now = opts.now ?? Date.now();
  const total =
    opts.totalBytes != null && opts.totalBytes > 0 ? opts.totalBytes : null;
  const percent =
    total != null
      ? Math.min(99, Math.floor((opts.bytesWritten / total) * 100))
      : 0;
  const bytesPerSecond = computeDownloadRate(opts.samples, 8000, now);
  const remaining =
    total != null ? Math.max(0, total - opts.bytesWritten) : 0;
  const etaSeconds = estimateEtaSeconds(remaining, bytesPerSecond);
  return {
    percent,
    bytesWritten: opts.bytesWritten,
    totalBytes: total,
    bytesPerSecond,
    etaSeconds,
  };
}
