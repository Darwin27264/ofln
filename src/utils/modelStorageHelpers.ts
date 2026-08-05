/**
 * Pure helpers for on-device GGUF storage (S19).
 * No RNFS here — unit-testable without native FS.
 */

export type StoredModelFile = {
  fileName: string;
  path: string;
  sizeBytes: number;
};

/** Final models only — never .partial / .chunk (download leftovers). */
export function isFinalGgufFileName(name: string): boolean {
  const n = (name || '').toLowerCase();
  if (!n.endsWith('.gguf')) return false;
  if (n.endsWith('.gguf.partial') || n.endsWith('.partial')) return false;
  if (n.endsWith('.chunk')) return false;
  return true;
}

/** Strip path segments so delete cannot escape the models directory. */
export function safeModelFileName(fileName: string): string | null {
  const base = (fileName || '').replace(/^.*[/\\]/, '').trim();
  if (!base || base === '.' || base === '..') return null;
  if (base.includes('..')) return null;
  if (!isFinalGgufFileName(base)) return null;
  return base;
}

export function sortStoredModelsBySizeDesc(
  files: StoredModelFile[],
): StoredModelFile[] {
  return [...files].sort((a, b) => {
    if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
    return a.fileName.localeCompare(b.fileName);
  });
}

export function sumStoredModelBytes(files: StoredModelFile[]): number {
  return files.reduce((sum, f) => sum + (Number(f.sizeBytes) || 0), 0);
}

export type RnfsDirEntry = {
  name: string;
  path: string;
  size?: number | string;
  isFile: () => boolean;
};

/** Map RNFS.readDir results → stored model list (pure). */
export function storedModelsFromDirEntries(
  entries: RnfsDirEntry[],
): StoredModelFile[] {
  const models: StoredModelFile[] = [];
  for (const entry of entries) {
    try {
      if (!entry?.isFile?.()) continue;
    } catch {
      continue;
    }
    if (!isFinalGgufFileName(entry.name)) continue;
    const sizeBytes = Math.max(0, Number(entry.size) || 0);
    models.push({
      fileName: entry.name,
      path: entry.path,
      sizeBytes,
    });
  }
  return sortStoredModelsBySizeDesc(models);
}
