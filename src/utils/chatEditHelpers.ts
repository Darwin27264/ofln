import type { ChatMessage } from '../types/ai';

/**
 * After editing a user turn: keep system + history through that user message
 * (with updated text), drop the rest. Attachments on the user turn are kept.
 * Returns null if the index is not a user message or the edit would be empty.
 */
export function buildMessagesAfterUserEdit(
  messages: ChatMessage[],
  userIndex: number,
  newContent: string,
): ChatMessage[] | null {
  if (userIndex < 0 || userIndex >= messages.length) return null;
  const existing = messages[userIndex];
  if (existing.role !== 'user') return null;

  const content = newContent.trim();
  const hasAttachments = (existing.attachments?.length ?? 0) > 0;
  if (!content && !hasAttachments) return null;

  const updatedUser: ChatMessage = {
    ...existing,
    content,
  };

  return [...messages.slice(0, userIndex), updatedUser];
}
