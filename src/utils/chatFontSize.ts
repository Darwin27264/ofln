/** Chat bubble / transcript body text size (user preference). */

export const CHAT_FONT_SIZES = [14, 16, 18, 20] as const;
export type ChatFontSize = (typeof CHAT_FONT_SIZES)[number];

export const DEFAULT_CHAT_FONT_SIZE: ChatFontSize = 16;

export const CHAT_FONT_SIZE_STORAGE_KEY = '@app_chat_font_size';

export function isChatFontSize(value: unknown): value is ChatFontSize {
  return (
    typeof value === 'number' &&
    (CHAT_FONT_SIZES as readonly number[]).includes(value)
  );
}

export function parseChatFontSize(raw: string | null): ChatFontSize | null {
  if (raw == null) return null;
  const n = Number(raw);
  return isChatFontSize(n) ? n : null;
}

export function lineHeightForChatFont(size: number): number {
  return Math.round(size * 1.5);
}

/** Bubble chrome that scales with body type so short/tall sizes stay balanced. */
export function bubbleMetricsForChatFont(size: number): {
  paddingVertical: number;
  paddingHorizontal: number;
  minHeight: number;
} {
  const lineHeight = lineHeightForChatFont(size);
  const paddingVertical = Math.max(6, Math.round(size * 0.5));
  const paddingHorizontal = Math.max(12, Math.round(size * 0.875));
  return {
    paddingVertical,
    paddingHorizontal,
    minHeight: lineHeight + paddingVertical * 2,
  };
}
