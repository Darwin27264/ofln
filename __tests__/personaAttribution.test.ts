import {
  buildPersonaSnapshot,
  hasPersonaAttribution,
  resolveMessagePersonaForDisplay,
  resolveMessagePersonaForSummary,
} from '../src/utils/personaAttribution';
import type { Persona } from '../src/services/personaService';

const livePersona: Persona = {
  id: 'p1',
  name: 'Live Name',
  tagline: 'Live tagline',
  createdAt: 1,
  identity: 'Secret identity',
  avatar: 'star',
};

describe('personaAttribution', () => {
  it('buildPersonaSnapshot returns undefined without persona', () => {
    expect(buildPersonaSnapshot(null)).toBeUndefined();
    expect(buildPersonaSnapshot(undefined)).toBeUndefined();
  });

  it('buildPersonaSnapshot captures display fields', () => {
    expect(buildPersonaSnapshot(livePersona)).toEqual({
      personaId: 'p1',
      personaName: 'Live Name',
      personaTagline: 'Live tagline',
      personaAvatar: 'star',
      personaAvatarUri: undefined,
    });
  });

  it('hasPersonaAttribution detects stamped messages', () => {
    expect(hasPersonaAttribution({})).toBe(false);
    expect(hasPersonaAttribution({ personaId: 'p1' })).toBe(true);
    expect(hasPersonaAttribution({ personaName: 'Ada' })).toBe(true);
  });

  it('resolveMessagePersonaForDisplay prefers snapshot over live edits', () => {
    const msg = {
      personaId: 'p1',
      personaName: 'Snapshot Name',
      personaTagline: 'Snapshot tag',
      personaAvatar: 'heart',
    };
    const display = resolveMessagePersonaForDisplay(msg, [livePersona]);
    expect(display?.name).toBe('Snapshot Name');
    expect(display?.tagline).toBe('Snapshot tag');
    expect(display?.avatar).toBe('heart');
  });

  it('resolveMessagePersonaForDisplay falls back to library by id', () => {
    const display = resolveMessagePersonaForDisplay({ personaId: 'p1' }, [livePersona]);
    expect(display?.name).toBe('Live Name');
  });

  it('resolveMessagePersonaForSummary uses live persona when available', () => {
    const msg = {
      personaId: 'p1',
      personaName: 'Snapshot Name',
    };
    const summary = resolveMessagePersonaForSummary(msg, [livePersona]);
    expect(summary?.name).toBe('Live Name');
    expect(summary?.identity).toBe('Secret identity');
  });

  it('resolveMessagePersonaForSummary uses snapshot when persona deleted', () => {
    const msg = {
      personaId: 'gone',
      personaName: 'Old Friend',
      personaTagline: 'Was here',
    };
    const summary = resolveMessagePersonaForSummary(msg, [livePersona]);
    expect(summary?.name).toBe('Old Friend');
    expect(summary?.identity).toBeUndefined();
  });
});
