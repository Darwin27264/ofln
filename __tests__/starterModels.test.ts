import {
  STARTER_MODELS,
  STARTER_SHELF_TITLE,
  STARTER_SHELF_SUBTITLE,
  getAvailableStarterModels,
  findStarterByFileName,
  ONBOARDING_STARTER_IDS,
  PERSONA_ROLEPLAY_MODELS,
} from '../src/services/starterModels';

describe('starterModels shelf', () => {
  it('keeps a short curated list with shelf hints', () => {
    expect(STARTER_MODELS.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_MODELS.length).toBeLessThanOrEqual(8);
    expect(STARTER_SHELF_TITLE).toBe('Start here');
    expect(STARTER_SHELF_SUBTITLE.toLowerCase()).not.toMatch(/emulator/);
    for (const m of STARTER_MODELS) {
      expect(m.fileName.toLowerCase().endsWith('.gguf')).toBe(true);
      expect(m.shelfHint.length).toBeGreaterThan(0);
      expect(m.repoId).toContain('/');
      expect(m.description.toLowerCase()).not.toMatch(/emulator/);
      expect(m.shelfHint.toLowerCase()).not.toMatch(/emulator/);
      expect(m.tags.map((t) => t.toLowerCase())).not.toContain('emulator');
    }
  });

  it('filters out downloaded filenames', () => {
    const first = STARTER_MODELS[0].fileName;
    const available = getAvailableStarterModels([first]);
    expect(available.find((m) => m.fileName === first)).toBeUndefined();
    expect(available.length).toBe(STARTER_MODELS.length - 1);
  });

  it('finds by file name', () => {
    const m = STARTER_MODELS[1];
    expect(findStarterByFileName(m.fileName)?.id).toBe(m.id);
    expect(findStarterByFileName('missing.gguf')).toBeUndefined();
  });

  it('onboarding ids resolve to catalog entries', () => {
    for (const id of ONBOARDING_STARTER_IDS) {
      expect(STARTER_MODELS.some((m) => m.id === id)).toBe(true);
    }
  });

  it('persona roleplay shelf has phone-friendly uncensored picks', () => {
    expect(PERSONA_ROLEPLAY_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of PERSONA_ROLEPLAY_MODELS) {
      expect(m.fileName.toLowerCase().endsWith('.gguf')).toBe(true);
      expect(m.repoId).toContain('/');
      expect(m.shelfHint.length).toBeGreaterThan(0);
    }
  });
});
