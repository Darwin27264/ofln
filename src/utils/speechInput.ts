/**
 * Pure helpers for platform speech-to-text → composer (S30).
 */

/** Merge existing composer text with a recognized utterance. */
export function joinComposerSpeech(base: string, speech: string): string {
  const s = speech.trim();
  if (!s) return base;
  const b = base.replace(/\s+$/, '');
  if (!b) return s;
  return `${b} ${s}`;
}
