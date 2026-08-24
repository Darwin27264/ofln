/**
 * Pure helpers for OS text-to-speech prep.
 * Strips think blocks and light markdown so the spoken answer matches the UI.
 */

import { stripThinkBlocks } from '../services/inference/thinkStreamParser';

/** Cap utterance length — some OS engines choke on multi-kB streams. */
export const SPEECH_MAX_CHARS = 4000;

/**
 * Produce plain speakable text from an assistant message body.
 * - Drops `<think>…</think>` / incomplete think tails
 * - Soft-strips fenced code, links, and common markdown markers
 * - Collapses whitespace and caps length
 */
export function prepareSpeechText(raw: string): string {
  let t = stripThinkBlocks(raw || '');

  // Fenced code → short spoken placeholder
  t = t.replace(/```[\s\S]*?```/g, ' ');
  // Inline code keep inner text
  t = t.replace(/`([^`]+)`/g, '$1');
  // Links / images: keep label
  t = t.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1');
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  // Headings / emphasis / list markers (light, not a full markdown parse)
  t = t.replace(/^#{1,6}\s+/gm, '');
  t = t.replace(/(\*\*|__)(.*?)\1/g, '$2');
  t = t.replace(/(\*|_)(.*?)\1/g, '$2');
  t = t.replace(/^[\s>*+\-]+/gm, '');
  t = t.replace(/\s+/g, ' ').trim();

  if (t.length > SPEECH_MAX_CHARS) {
    t = t.slice(0, SPEECH_MAX_CHARS).trim();
  }
  return t;
}
