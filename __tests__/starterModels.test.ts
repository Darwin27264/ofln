import {
  STARTER_MODELS,
  STARTER_SHELF_TITLE,
  STARTER_SHELF_SUBTITLE,
  STARTER_SHELF_TABS,
  DOWNLOADED_SHELF_TABS,
  getAvailableStarterModels,
  getStarterShelfCatalog,
  findStarterByFileName,
  isShareSheetModelFile,
  pickQuickActionsModelFile,
  splitQuickActionsCatalog,
  ONBOARDING_STARTER_IDS,
  PERSONA_ROLEPLAY_MODELS,
  CODING_STARTER_MODELS,
  SHARE_SHEET_MODELS,
} from '../src/services/starterModels';

describe('starterModels shelf', () => {
  it('keeps a short curated list with shelf hints', () => {
    expect(STARTER_MODELS.length).toBeGreaterThanOrEqual(3);
    expect(STARTER_MODELS.length).toBeLessThanOrEqual(8);
    expect(STARTER_SHELF_TITLE).toBe('Available Models');
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

  it('coding shelf has Q4_0 code-specialized picks', () => {
    expect(CODING_STARTER_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of CODING_STARTER_MODELS) {
      expect(m.fileName.toLowerCase().endsWith('.gguf')).toBe(true);
      expect(m.repoId).toContain('/');
      expect(m.shelfHint.length).toBeGreaterThan(0);
      expect(m.tags.map((t) => t.toLowerCase())).toContain('code');
    }
  });

  it('start here tabs map to catalogs', () => {
    expect(STARTER_SHELF_TABS.map((t) => t.id)).toEqual([
      'general',
      'personas',
      'coding',
    ]);
    expect(getStarterShelfCatalog('general')).toBe(STARTER_MODELS);
    expect(getStarterShelfCatalog('personas')).toBe(PERSONA_ROLEPLAY_MODELS);
    expect(getStarterShelfCatalog('coding')).toBe(CODING_STARTER_MODELS);
  });

  it('downloaded tabs split all vs quick-actions models', () => {
    expect(DOWNLOADED_SHELF_TABS.map((t) => t.id)).toEqual(['all', 'quickActions']);
    expect(DOWNLOADED_SHELF_TABS[1].label.toLowerCase()).toContain('quick');
    expect(isShareSheetModelFile(SHARE_SHEET_MODELS[0].fileName)).toBe(true);
    expect(isShareSheetModelFile('not-a-share-model.gguf')).toBe(false);
  });

  it('picks the Quick actions default when that file is on disk', () => {
    const share = SHARE_SHEET_MODELS[0].fileName;
    const other = 'Huge-70B-Q4_K_M.gguf';
    expect(pickQuickActionsModelFile([], share)).toBeNull();
    expect(pickQuickActionsModelFile([other, share], share)).toBe(share);
    expect(pickQuickActionsModelFile([other, share], other)).toBe(other);
    expect(pickQuickActionsModelFile([other, share], 'gone.gguf')).toBe(share);
    expect(pickQuickActionsModelFile([other], null)).toBe(other);
  });

  it('splits Quick actions catalog into downloaded vs downloadable', () => {
    const have = SHARE_SHEET_MODELS[0].fileName;
    const split = splitQuickActionsCatalog([have, 'other.gguf']);
    expect(split.downloaded.map((m) => m.fileName)).toEqual([have]);
    expect(split.downloadable.map((m) => m.fileName)).toEqual(
      SHARE_SHEET_MODELS.slice(1).map((m) => m.fileName),
    );
    expect(splitQuickActionsCatalog([]).downloaded).toEqual([]);
    expect(splitQuickActionsCatalog([]).downloadable).toHaveLength(SHARE_SHEET_MODELS.length);
  });

  it('share-from-apps picks stay light Q4_0 instruct for Android overlay', () => {
    expect(SHARE_SHEET_MODELS.length).toBeGreaterThanOrEqual(3);
    expect(SHARE_SHEET_MODELS.length).toBeLessThanOrEqual(4);
    const generalIds = new Set(STARTER_MODELS.map((m) => m.id));
    for (const m of SHARE_SHEET_MODELS) {
      expect(generalIds.has(m.id)).toBe(true);
      expect(m.fileName.toLowerCase().endsWith('.gguf')).toBe(true);
      expect(m.fileName.toLowerCase()).toContain('q4_0');
      expect(m.repoId).toContain('/');
      expect(m.shelfHint.toLowerCase()).toContain('share');
      expect(m.tags.map((t) => t.toLowerCase())).toContain('share');
      expect(m.sizeBytes).toBeLessThan(1.5 * 1024 * 1024 * 1024);
    }
  });

  it('finds starters across all shelves', () => {
    expect(findStarterByFileName(PERSONA_ROLEPLAY_MODELS[0].fileName)?.id).toBe(
      PERSONA_ROLEPLAY_MODELS[0].id,
    );
    expect(findStarterByFileName(CODING_STARTER_MODELS[0].fileName)?.id).toBe(
      CODING_STARTER_MODELS[0].id,
    );
    expect(findStarterByFileName(SHARE_SHEET_MODELS[0].fileName)?.id).toBe(
      SHARE_SHEET_MODELS[0].id,
    );
  });

  it('all starter models define valid 64-char hex SHA-256 digests', () => {
    const all = [
      ...STARTER_MODELS,
      ...SHARE_SHEET_MODELS,
      ...PERSONA_ROLEPLAY_MODELS,
      ...CODING_STARTER_MODELS,
    ];
    for (const model of all) {
      expect(model.sha256).toBeDefined();
      expect(model.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('all starter models define exact positive byte counts (sizeBytes)', () => {
    const all = [
      ...STARTER_MODELS,
      ...SHARE_SHEET_MODELS,
      ...PERSONA_ROLEPLAY_MODELS,
      ...CODING_STARTER_MODELS,
    ];
    for (const model of all) {
      expect(typeof model.sizeBytes).toBe('number');
      expect(model.sizeBytes).toBeGreaterThan(100_000_000);
      expect(Number.isInteger(model.sizeBytes)).toBe(true);
    }
  });
});
