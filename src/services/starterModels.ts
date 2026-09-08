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
  description: string;
  author: string;
  tags: string[];
  /**
   * Calm one-line shelf hint (fits / tier). Shown on the card meta row.
   * Not marketing — hardware honesty.
   */
  shelfHint: string;
};

/**
 * Selection principles:
 *  • Q4_0 preferred for Android accel allowlist (Q4_0 / Q6_K).
 *  • Distinct tiers: ultra-light → balanced → flagship → specialist.
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
    description: 'Ultra-light footprint for constrained devices.',
    author: 'unsloth',
    tags: ['low-ram', 'q4_0', 'instruct', 'thinking'],
    shelfHint: 'Low RAM',
  },
  {
    id: 'gemma3-1b-q40',
    name: 'Gemma 3 1B IT (Q4_0)',
    repoId: 'unsloth/gemma-3-1b-it-GGUF',
    fileName: 'gemma-3-1b-it-Q4_0.gguf',
    size: '0.67 GB',
    description: 'Tiny Google model built for on-device chat.',
    author: 'unsloth',
    tags: ['instruct', 'gemma3', 'small', 'q4_0'],
    shelfHint: 'On-device chat',
  },
  {
    id: 'llama32-1b-q40',
    name: 'Llama 3.2 1B Instruct (Q4_0)',
    repoId: 'unsloth/Llama-3.2-1B-Instruct-GGUF',
    fileName: 'Llama-3.2-1B-Instruct-Q4_0.gguf',
    size: '0.72 GB',
    description: "Meta's compact instruct model for phones.",
    author: 'unsloth',
    tags: ['instruct', 'llama', 'small', 'q4_0'],
    shelfHint: 'Fast & light',
  },
  {
    id: 'qwen35-2b-q40',
    name: 'Qwen3.5 2B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-2B-GGUF',
    fileName: 'Qwen3.5-2B-Q4_0.gguf',
    size: '1.13 GB',
    description: 'Balanced capability for everyday use.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'small', 'q4_0'],
    shelfHint: 'Fits most phones',
  },
  {
    id: 'smollm3-3b-q40',
    name: 'SmolLM3 3B (Q4_0)',
    repoId: 'unsloth/SmolLM3-3B-GGUF',
    fileName: 'SmolLM3-3B-Q4_0.gguf',
    size: '1.82 GB',
    description: 'Daily driver with long context.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'multilingual', 'q4_0'],
    shelfHint: 'Daily driver',
  },
  {
    id: 'phi4-mini-q40',
    name: 'Phi-4 Mini Instruct (Q4_0)',
    repoId: 'bartowski/microsoft_Phi-4-mini-instruct-GGUF',
    fileName: 'microsoft_Phi-4-mini-instruct-Q4_0.gguf',
    size: '2.33 GB',
    description: 'Strong at math and logic.',
    author: 'bartowski',
    tags: ['instruct', 'reasoning', 'math', 'tools', 'q4_0'],
    shelfHint: 'Math / logic',
  },
  {
    id: 'qwen35-4b-q40',
    name: 'Qwen3.5 4B Instruct (Q4_0)',
    repoId: 'unsloth/Qwen3.5-4B-GGUF',
    fileName: 'Qwen3.5-4B-Q4_0.gguf',
    size: '2.41 GB',
    description: 'Higher reasoning capacity; prefers more memory.',
    author: 'unsloth',
    tags: ['instruct', 'thinking', 'code', 'q4_0'],
    shelfHint: 'More capable · needs RAM',
  },
  {
    id: 'gemma4-e2b-q40',
    name: 'Gemma 4 E2B IT (Q4_0)',
    repoId: 'unsloth/gemma-4-E2B-it-GGUF',
    fileName: 'gemma-4-E2B-it-Q4_0.gguf',
    size: '3.04 GB',
    description: 'Efficient flagship. Text-only.',
    author: 'unsloth',
    tags: ['instruct', 'gemma4', 'q4_0'],
    shelfHint: 'Flagship general',
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
    description: 'Uncensored instruct — stays in character on most phones.',
    author: 'bartowski',
    tags: ['uncensored', 'roleplay', 'dolphin', 'q4_0', 'small'],
    shelfHint: 'Best for personas · low RAM',
  },
  {
    id: 'qwen25-15b-abliterated-q4ks',
    name: 'Qwen2.5 1.5B Abliterated (Q4_K_S)',
    repoId: 'mradermacher/Qwen2.5-1.5B-Instruct-abliterated-GGUF',
    fileName: 'Qwen2.5-1.5B-Instruct-abliterated.Q4_K_S.gguf',
    size: '0.94 GB',
    description: 'Abliterated instruct — fewer refusals, strong roleplay.',
    author: 'mradermacher',
    tags: ['abliterated', 'roleplay', 'qwen', 'small'],
    shelfHint: 'Less refusal',
  },
  {
    id: 'dolphin3-qwen25-3b-q40',
    name: 'Dolphin 3.0 Qwen2.5 3B (Q4_0)',
    repoId: 'bartowski/Dolphin3.0-Qwen2.5-3B-GGUF',
    fileName: 'Dolphin3.0-Qwen2.5-3b-Q4_0.gguf',
    size: '1.83 GB',
    description: 'Stronger uncensored pick when you have more RAM.',
    author: 'bartowski',
    tags: ['uncensored', 'roleplay', 'dolphin', 'q4_0'],
    shelfHint: 'Stronger · needs more RAM',
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
    description: 'Lightweight code model for quick fixes on most phones.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0', 'small'],
    shelfHint: 'Code · low RAM',
  },
  {
    id: 'qwen25-coder-3b-q40',
    name: 'Qwen2.5 Coder 3B Instruct (Q4_0)',
    repoId: 'bartowski/Qwen2.5-Coder-3B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-3B-Instruct-Q4_0.gguf',
    size: '1.70 GB',
    description: 'Stronger completions and refactors; needs more RAM.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0'],
    shelfHint: 'Stronger code · mid RAM',
  },
  {
    id: 'qwen25-coder-7b-q40',
    name: 'Qwen2.5 Coder 7B Instruct (Q4_0)',
    repoId: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF',
    fileName: 'Qwen2.5-Coder-7B-Instruct-Q4_0.gguf',
    size: '4.14 GB',
    description: 'Best code quality in this shelf; flagship RAM only.',
    author: 'bartowski',
    tags: ['coder', 'code', 'qwen', 'q4_0'],
    shelfHint: 'Flagship code · high RAM',
  },
];

const STARTER_SHELF_CATALOGS: Record<StarterShelfTabId, StarterModelInfo[]> = {
  general: STARTER_MODELS,
  personas: PERSONA_ROLEPLAY_MODELS,
  coding: CODING_STARTER_MODELS,
};

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
    : [STARTER_MODELS, PERSONA_ROLEPLAY_MODELS, CODING_STARTER_MODELS];
  for (const shelf of catalogs) {
    const found = shelf.find((m) => m.fileName === fileName);
    if (found) return found;
  }
  return undefined;
}
