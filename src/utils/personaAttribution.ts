/**
 * Per-message persona attribution — stamped at assistant generation time.
 * Snapshot fields keep avatars/names stable when the persona is edited or removed.
 */

import type { Persona } from '../services/personaService';

/** Optional persona fields stored on assistant messages. */
export type MessagePersonaFields = {
  personaId?: string;
  personaName?: string;
  personaTagline?: string;
  personaAvatar?: string;
  personaAvatarUri?: string;
};

export function hasPersonaAttribution(
  msg: MessagePersonaFields | null | undefined,
): boolean {
  if (!msg) return false;
  return !!(msg.personaId?.trim() || msg.personaName?.trim());
}

/** Capture minimal persona display data at generation time. */
export function buildPersonaSnapshot(
  persona: Persona | null | undefined,
): MessagePersonaFields | undefined {
  if (!persona?.id?.trim()) return undefined;
  return {
    personaId: persona.id,
    personaName: persona.name,
    personaTagline: persona.tagline?.trim() || undefined,
    personaAvatar: persona.avatar,
    personaAvatarUri: persona.avatarUri,
  };
}

/**
 * Avatar / label display — prefers snapshot on the message (historical accuracy).
 * Falls back to live library lookup when only personaId is present (legacy rows).
 */
export function resolveMessagePersonaForDisplay(
  msg: MessagePersonaFields,
  availablePersonas?: Persona[] | null,
): Persona | null {
  if (msg.personaName?.trim() && msg.personaId?.trim()) {
    return {
      id: msg.personaId,
      name: msg.personaName,
      tagline: msg.personaTagline ?? '',
      avatar: msg.personaAvatar,
      avatarUri: msg.personaAvatarUri,
      createdAt: 0,
    };
  }

  const id = msg.personaId?.trim();
  if (!id) return null;

  const live = availablePersonas?.find((p) => p.id === id);
  if (live) return live;

  return {
    id,
    name: msg.personaName?.trim() || 'Persona',
    tagline: msg.personaTagline ?? '',
    avatar: msg.personaAvatar,
    avatarUri: msg.personaAvatarUri,
    createdAt: 0,
  };
}

/**
 * Persona summary sheet — full library record when available, else snapshot.
 */
export function resolveMessagePersonaForSummary(
  msg: MessagePersonaFields,
  availablePersonas?: Persona[] | null,
): Persona | null {
  const id = msg.personaId?.trim();
  if (id && availablePersonas) {
    const live = availablePersonas.find((p) => p.id === id);
    if (live) return live;
  }
  return resolveMessagePersonaForDisplay(msg, availablePersonas);
}
