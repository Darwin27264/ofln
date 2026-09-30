/**
 * Curated "Start here" GGUF shelf for first-run / model discovery.
 * Keep short; prefer Q4_0 (Android OpenCL/Hexagon allowlist) and ungated mirrors.
 */

export type StarterModelInfo = {
  id: string;
  name: string;
  repoId: string;
  fileName: string;
  size: string;
  /** Exact size in bytes from Hugging Face Git LFS for verified download integrity. */
  sizeBytes?: number;
  description: string;
  author: string;
  tags: string[];
  /**
   * Calm one-line shelf hint (fits / tier). Shown on the card meta row.
   * Not marketing — hardware honesty.
   */
  shelfHint: string;
  /** Optional SHA-256 digest from Hugging Face Git LFS for verified download integrity. */
  sha256?: string;
};

/**
 * Selection principles:
 *  • Q4_0 preferred for Android accel allowlist (Q4_0 / Q6_K).
 *  • Distinct tiers: ultra-light → balanced → flagship → specialist.
 *  • Quick actions (Downloaded): 0.8B–2B only (Android overlay RAM / cold-load budget).
 *  • Community mirrors (Unsloth / bartowski) so downloads work without an HF token.
 *  • Repos/filenames verified against Hugging Face — re-check before renaming.
 */
export const STARTER_MODELS: StarterModelInfo[] = [
  {
    id: 'qwen35-08b-q40',
    name: 'Qwen3.5 0.8B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-0.8B-GGUF',
    fileName: 'Qwen3.5-0.8B-Q4_0.gguf',
    size: '0.51 GB',
    sizeBytes: 507154688,
    description: 'Ultra-light footprint for constrained devices.',
    author: 'unsloth',
    tags: ['low-ram', 'q4_0', 'instruct', 'thinking'],
    shelfHint: 'Low RAM',
    sha256: '444406ddd926550c724ec18d5120a9d40ded44908a063b0e66e9a7e5464c652c',
  },
  {
    id: 'gemma3-1b-q40',
    name: 'Gemma 3 1B IT (Q4_0)',
    repoId: 'unsloth/gemma-3-1b-it-GGUF',
    fileName: 'gemma-3-1b-it-Q4_0.gguf',
    size: '0.67 GB',
    sizeBytes: 721918496,
    description: 'Tiny Google model built for on-device chat.',
    author: 'unsloth',
    tags: ['instruct', 'gemma3', 'small', 'q4_0'],
    shelfHint: 'On-device chat',
    sha256: '27ee88e03be02e9ba73def9a819d570d8ad73716e50769e87f374ae394b0276e',
  },
  {
    id: 'llama32-1b-q40',
    name: 'Llama 3.2 1B Instruct (Q4_0)',
    repoId: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    fileName: 'Llama-3.2-1B-Instruct-Q4_0.gguf',
    size: '0.72 GB',
    sizeBytes: 773025824,
    description: "Meta's compact instruct model for phones.",
    author: 'unsloth',
    tags: ['instruct', 'llama', 'small', 'q4_0'],
    shelfHint: 'Fast & light',
    sha256: '66bfbb2d48bdb77cd56bd03ef820deff3c4a74b1a09de3b917ae13e72c1a70c2',
  },
  {
    id: 'qwen35-2b-q40',
    name: 'Qwen3.5 2B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-2B-GGUF',
    fileName: 'Qwen3.5-2B-Q4_0.gguf',
    size: '1.13 GB',
    sizeBytes: 1214873856,
    description: 'Balanced capability for everyday use.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'small', 'q4_0'],
    shelfHint: 'Fits most phones',
    sha256: 'cd70221bebaee0503e0f6717e174250cd7825aa88438b3aabec9ad55731d9bb1',
  },
  {
    id: 'smollm3-3b-q40',
    name: 'SmolLM3 3B (Q4_0)',
    repoId: 'unsloth/SmolLM3-3B-GGUF',
    fileName: 'SmolLM3-3B-Q4_0.gguf',
    size: '1.82 GB',
    sizeBytes: 1811456544,
    description: 'Daily driver with long context.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'multilingual', 'q4_0'],
    shelfHint: 'Daily driver',
    sha256: '7077558daebcbb2b598aef526e420f82517d766084aff0e03950c56b86429622',
  },
  {
    id: 'phi4-mini-q40',
    name: 'Phi-4 Mini Instruct (Q4_0)',
    repoId: 'bartowski/microsoft_Phi-4-mini-instruct-GGUF',
    fileName: 'microsoft_Phi-4-mini-instruct-Q4_0.gguf',
    size: '2.33 GB',
    sizeBytes: 2331442560,
    description: 'Strong at math and logic.',
    author: 'bartowski',
    tags: ['instruct', 'reasoning', 'math', 'tools', 'q4_0'],
    shelfHint: 'Math / logic',
    sha256: '2124412a2d3410dd05c5d01796457283812210633165a2a86c909f815971518e',
  },
  {
    id: 'qwen35-4b-q40',
    name: 'Qwen3.5 4B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-4B-GGUF',
    fileName: 'Qwen3.5-4B-Q4_0.gguf',
    size: '2.41 GB',
    sizeBytes: 2583221408,
    description: 'Higher reasoning capacity; prefers more memory.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'code', 'q4_0'],
    shelfHint: 'More capable · needs RAM',
    sha256: '298fcb5fe7a77ccc79745ae24751560c5ac56874caff4bb39b1f2055bd72b8bb',
  },
  {
    id: 'gemma4-e2b-q40',
    name: 'Gemma 4 E2B IT (Q4_0)',
    repoId: 'unsloth/gemma-4-E2B-it-GGUF',
    fileName: 'gemma-4-E2B-it-Q4_0.gguf',
    size: '3.04 GB',
    sizeBytes: 3041378400,
    description: 'Efficient flagship. Text-only.',
    author: 'unsloth',
    tags: ['instruct', 'gemma4', 'q4_0'],
    shelfHint: 'Flagship general',
    sha256: '31d3a3c630d4e71a7416498c42660dd3805066948acaec76a47e1ffac7010132',
  },
];

/** First-run onboarding shows this subset (smallest → mid). */
export const ONBOARDING_STARTER_IDS = [
  'qwen35-08b-q40',
  'qwen35-2b-q40',
  'qwen35-4b-q40',
] as const;

export const STARTER_SHELF_TITLE = 'Available Models';

export const STARTER_SHELF_SUBTITLE = '';

export type StarterShelfTabId = 'general' | 'personas' | 'coding';

export const STARTER_SHELF_TABS: {
  id: StarterShelfTabId;
  label: string;
  subtitle: string;
}[] = [
  {
    id: 'general',
    label: 'General',
    subtitle: '',
  },
  {
    id: 'personas',
    label: 'Personas',
    subtitle: '',
  },
  {
    id: 'coding',
    label: 'Coding',
    subtitle: '',
  },
];

/** Downloaded list: every file vs the small models used by Android Share. */
export type DownloadedShelfTabId = 'all' | 'quickActions';

export const DOWNLOADED_SHELF_TABS: {
  id: DownloadedShelfTabId;
  label: string;
  subtitle: string;
  infoTitle?: string;
  infoMessage?: string;
}[] = [
  {
    id: 'all',
    label: 'All',
    subtitle: '',
  },
  {
    id: 'quickActions',
    label: 'Quick actions',
    subtitle: 'Small models for sharing from other apps.',
    infoTitle: 'Quick actions',
    infoMessage:
      'These run in the Android Share overlay when you share text from Chrome or other apps — summarize, rephrase, key points, and simplify.\n\n' +
      'Downloaded picks sit at the top. Gray cards are still downloadable — expand the list to browse them without crowding Available Models.\n\n' +
      'Star a downloaded model to load it first. You can still pick a different model in the overlay.\n\n' +
      'Prefer 0.8B–2B Q4_0 picks so the overlay can sit beside Chrome without running out of RAM.',
  },
];

function withShareShelf(
  id: string,
  description: string,
  shelfHint: string,
): StarterModelInfo {
  const base = STARTER_MODELS.find((m) => m.id === id);
  if (!base) {
    throw new Error(`starterModels: unknown id ${id}`);
  }
  return {
    ...base,
    description,
    shelfHint,
    tags: base.tags.includes('share') ? base.tags : [...base.tags, 'share'],
  };
}

/**
 * Light instruct GGUFs for the Android share overlay (summarize / key points /
 * rephrase / simplify). Same files as General — 0.8B–2B Q4_0 so the overlay
 * can sit on Chrome without the LMK killing the host app.
 */
export const SHARE_SHEET_MODELS: StarterModelInfo[] = [
  withShareShelf(
    'qwen35-08b-q40',
    'Fastest share-sheet load. Text transforms with a tiny RAM footprint.',
    'Share sheet · fastest',
  ),
  withShareShelf(
    'gemma3-1b-q40',
    'Tiny Google instruct for on-device share actions.',
    'Share sheet · light',
  ),
  withShareShelf(
    'llama32-1b-q40',
    'Compact Meta instruct — quick summaries beside the host app.',
    'Share sheet · fast',
  ),
  withShareShelf(
    'qwen35-2b-q40',
    'More capable share-sheet pick; still light enough for most phones.',
    'Share sheet · more capable',
  ),
];

/**
 * Curated roleplay / persona shelf — uncensored or abliterated instruct GGUFs.
 * Prefer Q4_0 when available (Android OpenCL/Hexagon allowlist). Filenames verified on HF.
 */
export const PERSONA_ROLEPLAY_MODELS: StarterModelInfo[] = [
  {
    id: 'dolphin3-qwen25-15b-q40',
    name: 'Dolphin 3.0 Qwen2.5 1.5B (Q4_0)',
    repoId: 'bartowski/Dolphin3.0-Qwen2.5-1.5B-GGUF',
    fileName: 'Dolphin3.0-Qwen2.5-1.5B-Q4_0.gguf',
    size: '0.94 GB',
    sizeBytes: 937538624,
    description: 'Uncensored instruct — stays in character on most phones.',
    author: 'bartowski',
    tags: ['uncensored', 'roleplay', 'dolphin', 'q4_0', 'small'],
    shelfHint: 'Best for personas · low RAM',
    sha256: '3d9dc778f039abe533706081a11373c4f3eda3a5cb86f7b579eb3e37726ccc50',
  },
  {
    id: 'qwen25-15b-abliterated-q4ks',
    name: 'Qwen2.5 1.5B Abliterated (Q4_K_S)',
    repoId: 'mradermacher/Qwen2.5-1.5B-Instruct-abliterated-GGUF',
    fileName: 'Qwen2.5-1.5B-Instruct-abliterated.Q4_K_S.gguf',
    size: '0.94 GB',
    sizeBytes: 940313152,
    description: 'Abliterated instruct — fewer refusals, strong roleplay.',
    author: 'mradermacher',
    tags: ['abliterated', 'roleplay', 'qwen', 'small'],
    shelfHint: 'Less refusal',
    sha256: 'b2fef9592916c7e0d12f24fc5cc03a978beb33661c40e9e99efe839cda46e144',
  },
  {
    id: 'dolphin3-qwen25-3b-q40',
    name: 'Dolphin 3.0 Qwen2.5 3B (Q4_0)',
    repoId: 'bartowski/Dolphin3.0-Qwen2.5-3B-GGUF',
    fileName: 'Dolphin3.0-Qwen2.5-3b-Q4_0.gguf',
    size: '1.83 GB',
    sizeBytes: 1828489184,
    description: 'Stronger uncensored pick when you have more RAM.',
    author: 'bartowski',
    tags: ['uncensored', 'roleplay', 'dolphin', 'q4_0'],
    shelfHint: 'Stronger · needs more RAM',
    sha256: '2043eae883d6b1624d815ee0087aab1cc4bc03f549bd224c2224729a6fc0a7f7',
  },
];

/**
 * Curated coding shelf — Qwen Coder instruct GGUFs (Q4_0 for Android accel).
 * Filenames verified on Hugging Face — re-check before renaming.
 */
export const CODING_STARTER_MODELS: StarterModelInfo[] = [
  {
    id: 'qwen25-coder-15b-q40',
    name: 'Qwen2.5 Coder 1.5B Instruct (Q4_0)',
    repoId: 'bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-1.5B-Instruct-Q4_0.gguf',
    size: '0.94 GB',
    sizeBytes: 937535776,
    description: 'Lightweight code model for quick fixes on most phones.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0', 'small'],
    shelfHint: 'Code · low RAM',
    sha256: '1165e56fbe4751906354a065e0d1d84e7db0352750929d6fe508fd0565f650a4',
  },
  {
    id: 'qwen25-coder-3b-q40',
    name: 'Qwen2.5 Coder 3B Instruct (Q4_0)',
    repoId: 'bartowski/Qwen2.5-Coder-3B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-3B-Instruct-Q4_0.gguf',
    size: '1.70 GB',
    sizeBytes: 1828486400,
    description: 'Stronger completions and refactors; needs more RAM.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0'],
    shelfHint: 'Stronger code · mid RAM',
    sha256: '4a1bb431ec1095cc3c9c9741f1a9473841d9631adabf1839ef690376d4653938',
  },
  {
    id: 'qwen25-coder-7b-q40',
    name: 'Qwen2.5 Coder 7B Instruct (Q4_0)',
    repoId: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-7B-Instruct-Q4_0.gguf',
    size: '4.14 GB',
    sizeBytes: 4444121888,
    description: 'Best code quality in this shelf; flagship RAM only.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0'],
    shelfHint: 'Flagship code · high RAM',
    sha256: '01f98a604944c259f33704faa5828bf2be9ada568a6c0d44fc7aef2463c2ec6a',
  },
];

const STARTER_SHELF_CATALOGS: Record<StarterShelfTabId, StarterModelInfo[]> = {
  general: STARTER_MODELS,
  personas: PERSONA_ROLEPLAY_MODELS,
  coding: CODING_STARTER_MODELS,
};

const SHARE_SHEET_FILE_NAMES = new Set(
  SHARE_SHEET_MODELS.map((m) => m.fileName),
);

/** True when this GGUF is a curated Android Share overlay pick (0.8B–2B). */
export function isShareSheetModelFile(fileName: string): boolean {
  return SHARE_SHEET_FILE_NAMES.has(fileName);
}

/** Pick which on-disk file Quick actions / Share overlay should load. */
export function pickQuickActionsModelFile(
  fileNames: string[],
  preferred: string | null | undefined,
): string | null {
  if (fileNames.length === 0) return null;
  if (preferred && fileNames.includes(preferred)) return preferred;
  const share = fileNames.find((name) => isShareSheetModelFile(name));
  return share ?? fileNames[0];
}

/** Split the Quick actions catalog into on-disk vs still-downloadable. */
export function splitQuickActionsCatalog(downloadedFileNames: string[]): {
  downloaded: StarterModelInfo[];
  downloadable: StarterModelInfo[];
} {
  const have = new Set(downloadedFileNames);
  const downloaded: StarterModelInfo[] = [];
  const downloadable: StarterModelInfo[] = [];
  for (const model of SHARE_SHEET_MODELS) {
    if (have.has(model.fileName)) downloaded.push(model);
    else downloadable.push(model);
  }
  return { downloaded, downloadable };
}

/** Catalog for a Start here tab. */
export function getStarterShelfCatalog(tab: StarterShelfTabId): StarterModelInfo[] {
  return STARTER_SHELF_CATALOGS[tab];
}

/** Starters not yet on disk (by final .gguf file name). */
export function getAvailableStarterModels(
  downloadedFileNames: string[],
  catalog: StarterModelInfo[] = STARTER_MODELS,
): StarterModelInfo[] {
  const have = new Set(downloadedFileNames);
  return catalog.filter((m) => !have.has(m.fileName));
}

export function findStarterByFileName(
  fileName: string,
  catalog?: StarterModelInfo[],
): StarterModelInfo | undefined {
  const catalogs = catalog
    ? [catalog]
    : [STARTER_MODELS, SHARE_SHEET_MODELS, PERSONA_ROLEPLAY_MODELS, CODING_STARTER_MODELS];
  for (const shelf of catalogs) {
    const found = shelf.find((m) => m.fileName === fileName);
    if (found) return found;
  }
  return undefined;
}
