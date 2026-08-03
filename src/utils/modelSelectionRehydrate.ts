/**
 * Helpers for rehydrating chat UI from an already-loaded llamaProvider
 * after a brief app background (JS remount, React state wipe).
 */

/** Basename of a model path (`.../foo.gguf` or `file:///.../foo.gguf`). */
export function modelFileNameFromPath(modelPath: string | null | undefined): string | null {
  if (!modelPath || typeof modelPath !== 'string') return null;
  const cleaned = modelPath.replace(/^file:\/\//i, '');
  const parts = cleaned.split(/[/\\]/);
  const name = parts[parts.length - 1];
  if (!name || !name.toLowerCase().endsWith('.gguf')) return null;
  return name;
}

export type ProviderSnapshot = {
  ready: boolean;
  modelPath: string | null;
  hasNativeContext: boolean;
};

/**
 * Whether UI should adopt provider state without calling loadModel.
 * Requires ready + live native context + a resolvable .gguf file name.
 */
export function shouldRehydrateSelectionFromProvider(
  snapshot: ProviderSnapshot,
  currentSelectedGGUF: string | null,
): { rehydrate: false } | { rehydrate: true; fileName: string } {
  if (currentSelectedGGUF) return { rehydrate: false };
  if (!snapshot.ready || !snapshot.hasNativeContext) return { rehydrate: false };
  const fileName = modelFileNameFromPath(snapshot.modelPath);
  if (!fileName) return { rehydrate: false };
  return { rehydrate: true, fileName };
}
