/**
 * Hugging Face browse / URL-import helpers.
 * Prefer Accel quants (Q4_0 / Q6_K) to match Android OpenCL/Hexagon allowlist.
 */

import { extractQuantization } from '../utils/modelUtils';
import { hfAxiosGet } from './hfTokenService';

export type HfGgufSibling = {
  rfilename?: string;
  size?: number;
};

export type HfQuantOption = {
  fileName: string;
  size: number;
  quantization: string;
};

/** Accel first, then other phone-friendly quants. */
export const PREFERRED_QUANT_ORDER = [
  'Q4_0',
  'Q6_K',
  'Q4_K_M',
  'Q4_K_S',
  'Q5_K_M',
  'Q5_0',
  'Q5_K_S',
  'Q8_0',
  'Q3_K_M',
  'Q3_K_S',
  'Q2_K',
] as const;

const QUANT_QUALITY: Record<string, number> = {
  Q2_K: 1,
  Q3_K_S: 2,
  Q3_K_M: 2,
  Q4_0: 3,
  Q4_K_S: 4,
  Q4_K_M: 5,
  Q5_0: 6,
  Q5_K_S: 6,
  Q5_K_M: 7,
  Q6_K: 7,
  Q8_0: 8,
};

/** Substrings used to keep browse lists phone-sized (not IQ or F16 dumps). */
const MOBILE_QUANT_MARKERS = [
  'q4_0',
  'q6_k',
  'q4_k_m',
  'q4_k_s',
  'q5_k_m',
  'q5_0',
  'q5_k_s',
  'q8_0',
  'q3_k_m',
  'q3_k_s',
  'q2_k',
  'q4_1',
  'q5_1',
];

export function isMobileFriendlyGgufFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (!lower.endsWith('.gguf')) return false;
  return MOBILE_QUANT_MARKERS.some((m) => lower.includes(m));
}

export function filterMobileFriendlyGgufs<T extends HfGgufSibling>(files: T[]): T[] {
  const mobile = files.filter((f) => f?.rfilename && isMobileFriendlyGgufFileName(f.rfilename));
  return mobile.length > 0 ? mobile : files.filter((f) => f?.rfilename?.toLowerCase().endsWith('.gguf'));
}

export function pickPreferredGgufFile<T extends HfGgufSibling>(files: T[]): T | undefined {
  const candidates = files.filter((f) => f?.rfilename);
  if (candidates.length === 0) return undefined;
  for (const quant of PREFERRED_QUANT_ORDER) {
    const hit = candidates.find(
      (f) => extractQuantization(f.rfilename || '') === quant,
    );
    if (hit) return hit;
  }
  return candidates[0];
}

export function compareQuantsForDisplay(a: string, b: string): number {
  const aAccel = a === 'Q4_0' || a === 'Q6_K' ? 1 : 0;
  const bAccel = b === 'Q4_0' || b === 'Q6_K' ? 1 : 0;
  if (aAccel !== bAccel) return bAccel - aAccel;
  return (QUANT_QUALITY[b] || 0) - (QUANT_QUALITY[a] || 0);
}

export function buildQuantOptions(files: HfGgufSibling[]): HfQuantOption[] {
  return files
    .filter((f) => f?.rfilename)
    .map((f) => ({
      fileName: f.rfilename as string,
      size: typeof f.size === 'number' ? f.size : 0,
      quantization: extractQuantization(f.rfilename as string) || 'UNKNOWN',
    }))
    .sort((a, b) => compareQuantsForDisplay(a.quantization, b.quantization));
}

/**
 * Parse a Hugging Face URL into repo, optional revision, and optional file.
 * Supports:
 *   https://huggingface.co/author/model
 *   https://huggingface.co/author/model/tree/<rev>
 *   https://huggingface.co/author/model/blob/<rev>/file.gguf
 *   https://huggingface.co/author/model/resolve/<rev>/file.gguf
 */
export function parseHuggingFaceUrl(
  url: string,
): { repoId: string; fileName?: string; revision?: string } | null {
  const trimmed = url.trim();
  const hfRegex =
    /^https?:\/\/huggingface\.co\/([^/\s]+\/[^/\s]+?)(?:\/(?:tree|blob|resolve)\/([^/\s]+)(?:\/(.+?))?)?(?:\?.*)?$/i;
  const match = trimmed.match(hfRegex);
  if (!match) return null;
  const repoId = match[1];
  const revision = match[2] || undefined;
  const fileName = match[3]?.toLowerCase().endsWith('.gguf') ? match[3] : undefined;
  return { repoId, fileName, revision };
}

export function buildHfResolveUrl(
  repoId: string,
  fileName: string,
  revision?: string | null,
): string {
  const rev = (revision && revision.trim()) || 'main';
  // Don't encode path separators in fileName (nested repo paths are rare for GGUF).
  const encodedRev = encodeURIComponent(rev);
  return `https://huggingface.co/${repoId}/resolve/${encodedRev}/${fileName}`;
}

/**
 * Prefer API `sha` (current default-branch tip) over assuming `main`.
 */
export async function fetchHfRepoRevision(repoId: string): Promise<string | null> {
  try {
    const res = await hfAxiosGet<{ sha?: string }>(
      `https://huggingface.co/api/models/${repoId}`,
      {
        timeout: 10000,
        validateStatus: (status) => status < 500,
      },
    );
    if (res.status >= 200 && res.status < 300) {
      const sha = res.data?.sha;
      if (typeof sha === 'string' && sha.trim()) return sha.trim();
    }
  } catch {
    // Fall through — caller uses `main`.
  }
  return null;
}

export async function resolveHfDownloadUrl(
  repoId: string,
  fileName: string,
  revision?: string | null,
): Promise<string> {
  if (revision && revision.trim()) {
    return buildHfResolveUrl(repoId, fileName, revision);
  }
  const sha = await fetchHfRepoRevision(repoId);
  return buildHfResolveUrl(repoId, fileName, sha || 'main');
}
