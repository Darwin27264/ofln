/**
 * Pure helpers for Perspective debate rounds (no React / no native I/O).
 */

import {
  buildDebateSystemPrompt,
  mergeDebateOverrides,
  seatDisplayName,
  type PerspectiveDebateOverrides,
  type PerspectiveSeat,
} from './perspectiveService';
import {
  buildPersonaSystemPrompt,
  type Persona,
} from './personaService';
import type { ModelSettings } from './modelSettingsService';
import type { ChatMessage } from '../types/ai';

export function resolveSeatPersona(
  seat: PerspectiveSeat,
  library: Persona[] | null | undefined,
): Persona | null {
  if (seat.personaId?.trim()) {
    const live = library?.find((p) => p.id === seat.personaId);
    if (live) return live;
  }
  const inline = seat.inlinePersona;
  if (!inline?.name?.trim()) return null;
  return {
    id: seat.personaId?.trim() || `inline_${seat.id}`,
    name: inline.name.trim(),
    tagline: inline.tagline ?? '',
    createdAt: 0,
    identity: inline.identity,
    speakingStyle: inline.speakingStyle,
    boundaries: inline.boundaries,
    personaStrength: inline.personaStrength ?? 'high',
    avatar: inline.avatar,
  };
}

export function buildSeatSystemPrompt(
  seat: PerspectiveSeat,
  library: Persona[] | null | undefined,
  baseSystemPrompt: string,
): string {
  const persona = resolveSeatPersona(seat, library);
  if (persona) {
    const framed: Persona = {
      ...persona,
      identity: [
        buildDebateSystemPrompt(seat),
        persona.identity?.trim() || '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    };
    return buildPersonaSystemPrompt(framed, baseSystemPrompt);
  }
  return buildDebateSystemPrompt(seat);
}

export function applyDebateOverridesToSettings(
  settings: ModelSettings,
  overrides?: PerspectiveDebateOverrides | null,
): ModelSettings {
  const merged = mergeDebateOverrides(
    {
      temperature: settings.temperature,
      n_ctx: settings.n_ctx,
      n_predict: settings.n_predict,
    },
    overrides,
  );
  return {
    ...settings,
    temperature: merged.temperature,
    n_ctx: merged.n_ctx,
    n_predict: merged.n_predict,
  };
}

export function resolveSeatModelFileName(
  seat: PerspectiveSeat,
): string | null {
  const m = seat.modelFileName?.trim();
  return m || null;
}

/** True when every seat has a concrete model file assigned. */
export function seatsHaveAssignedModels(seats: PerspectiveSeat[]): boolean {
  return seats.length > 0 && seats.every((s) => !!s.modelFileName?.trim());
}

export function buildSeatAssistantPlaceholder(
  seat: PerspectiveSeat,
  library: Persona[] | null | undefined,
  modelFileName: string,
): ChatMessage {
  const persona = resolveSeatPersona(seat, library);
  const label = seatDisplayName(seat);
  return {
    role: 'assistant',
    content: '',
    thought: undefined,
    showThought: false,
    createdAt: new Date(),
    personaId: persona?.id,
    personaName: persona?.name || label,
    personaTagline: persona?.tagline,
    personaAvatar: persona?.avatar,
    personaAvatarUri: persona?.avatarUri,
    perspectiveSeatId: seat.id,
    perspectiveSeatLabel: label,
    perspectiveModelFileName: modelFileName,
  };
}

/** Messages for native completion: system replaced, ends before empty assistant. */
export function buildNativeMessagesForSeat(
  transcript: ChatMessage[],
  systemPrompt: string,
  opts?: { seatLabel?: string },
): ChatMessage[] {
  const withoutTrailingAssistant =
    transcript.length > 0 &&
    transcript[transcript.length - 1]?.role === 'assistant' &&
    !transcript[transcript.length - 1]?.content
      ? transcript.slice(0, -1)
      : transcript;

  const sysIdx = withoutTrailingAssistant.findIndex((m) => m.role === 'system');
  let withSys: ChatMessage[];
  if (sysIdx >= 0) {
    withSys = withoutTrailingAssistant.slice();
    withSys[sysIdx] = { ...withSys[sysIdx], content: systemPrompt };
  } else {
    withSys = [{ role: 'system', content: systemPrompt }, ...withoutTrailingAssistant];
  }

  // Chat templates expect a user turn before the next assistant completion.
  // After seat 1, the transcript ends on an assistant — append a short cue so
  // seat 2+ generate as a reply, not a continuation of the prior speaker.
  const last = withSys[withSys.length - 1];
  if (last?.role === 'assistant' && last.content?.trim()) {
    const label = opts?.seatLabel?.trim() || 'this speaker';
    withSys = [
      ...withSys,
      {
        role: 'user',
        content: `[Perspective] Your turn as ${label}. Reply to the user's topic and prior speakers briefly.`,
      },
    ];
  }

  return withSys;
}
