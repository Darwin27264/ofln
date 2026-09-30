/**
 * Service to interface with the native Android ShareReceiver module.
 *
 * Handles:
 * - Extracting incoming shared text, URLs, and photos
 * - Safely resolving ACTION_PROCESS_TEXT from OS text selection
 * - Returning replaced text to the host app (e.g. Notes, Gmail, WhatsApp)
 * - Seamless hand-off to full ofln chat
 * - Dismissing the translucent overlay
 * - Registering Direct Share shortcuts
 */

import { NativeModules, Platform } from 'react-native';

export type SharedActionType = 'SEND' | 'SEND_MULTIPLE' | 'PROCESS_TEXT';
export type SharedContentType = 'text' | 'link' | 'image' | 'multiple_images';

export interface SharedPayload {
  action: SharedActionType;
  type: SharedContentType;
  text?: string;
  url?: string;
  title?: string;
  quickAction?: 'summarize' | 'rephrase' | string;
  isReadOnly?: boolean;
  uris?: string[];
}

function getShareReceiverModule() {
  if (Platform.OS !== 'android') return null;
  return NativeModules?.ShareReceiver || null;
}

export async function getSharedPayload(): Promise<SharedPayload | null> {
  const mod = getShareReceiverModule();
  if (!mod?.getSharedPayload) {
    return null;
  }
  try {
    const payload = await mod.getSharedPayload();
    return payload || null;
  } catch (err) {
    console.warn('[shareReceiverService] Failed to get shared payload', err);
    return null;
  }
}

export async function closeOverlay(): Promise<boolean> {
  const mod = getShareReceiverModule();
  if (!mod?.closeOverlay) {
    return false;
  }
  try {
    return await mod.closeOverlay();
  } catch (err) {
    console.warn('[shareReceiverService] Failed to close overlay', err);
    return false;
  }
}

export async function returnProcessedText(replacementText: string): Promise<boolean> {
  const mod = getShareReceiverModule();
  if (!mod?.returnProcessedText) {
    return false;
  }
  try {
    return await mod.returnProcessedText(replacementText);
  } catch (err) {
    console.warn('[shareReceiverService] Failed to return processed text', err);
    return false;
  }
}

export async function openInFullApp(
  prompt: string,
  initialResponse?: string,
  chatId?: string,
): Promise<boolean> {
  const mod = getShareReceiverModule();
  if (!mod?.openInFullApp) {
    return false;
  }
  try {
    return await mod.openInFullApp(prompt, initialResponse || '', chatId || '');
  } catch (err) {
    console.warn('[shareReceiverService] Failed to hand off to full app', err);
    return false;
  }
}

export interface FullAppHandoffPayload {
  sharedPrompt: string;
  sharedResponse?: string;
  sharedChatId?: string;
}

export async function getFullAppHandoff(): Promise<FullAppHandoffPayload | null> {
  const mod = getShareReceiverModule();
  if (!mod?.getFullAppHandoff) {
    return null;
  }
  try {
    const payload = await mod.getFullAppHandoff();
    return payload || null;
  } catch (err) {
    console.warn('[shareReceiverService] Failed to get full app handoff', err);
    return null;
  }
}

export async function publishDirectShareShortcuts(): Promise<boolean> {
  const mod = getShareReceiverModule();
  if (!mod?.publishDirectShareShortcuts) {
    return false;
  }
  try {
    return await mod.publishDirectShareShortcuts();
  } catch (err) {
    console.warn('[shareReceiverService] Failed to publish direct share shortcuts', err);
    return false;
  }
}
