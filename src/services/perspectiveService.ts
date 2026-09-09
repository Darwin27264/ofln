/**
 * Perspectives — reusable debate presets (model and/or persona seats).
 * Debate-only; does not write per-model settings.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PRESETS_KEY = '@perspective_presets';
const CHAT_META_KEY = '@perspective_chat_meta';
/** Bump when shipping replacement builtin presets. */
const SEEDED_KEY = '@perspective_builtins_seeded_v2';
const SEEDED_VALUE = '2';
const DEPRECATED_BUILTIN_IDS = ['builtin_chaos_straight'] as const;

export type PerspectiveInlinePersona = {
  name: string;
  tagline?: string;
  identity?: string;
  speakingStyle?: string;
  boundaries?: string;
  personaStrength?: 'low' | 'medium' | 'high';
  avatar?: string;
};

export type PerspectiveSeat = {
  id: string;
  /** Display name for the seat (falls back to persona / model). */
  label?: string;
  /** Downloaded GGUF file name; omit = use session active model. */
  modelFileName?: string;
  /** Library persona id. */
  personaId?: string;
  /** Builtin / debate-only persona without a library entry. */
  inlinePersona?: PerspectiveInlinePersona;
};

export type PerspectiveDebateOverrides = {
  temperature?: number;
  n_ctx?: number;
  n_predict?: number;
};

export type PerspectivePreset = {
  id: string;
  name: string;
  description?: string;
  seats: PerspectiveSeat[];
  overrides?: PerspectiveDebateOverrides;
  createdAt: number;
  updatedAt: number;
  isBuiltin?: boolean;
};

export type PerspectivePresetSnapshot = {
  name: string;
  seats: PerspectiveSeat[];
  overrides?: PerspectiveDebateOverrides;
};

export type PerspectiveChatMeta = {
  presetId?: string;
  presetSnapshot: PerspectivePresetSnapshot;
};

export const MIN_PERSPECTIVE_SEATS = 2;
export const WARN_PERSPECTIVE_SEATS = 3;
/** Soft default max reply length per seat (debate-only). */
export const DEFAULT_DEBATE_N_PREDICT = 384;

export function generatePerspectiveId(prefix = 'perspective'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

export function generateSeatId(): string {
  return generatePerspectiveId('seat');
}

export function isPerspectiveSeat(value: unknown): value is PerspectiveSeat {
  if (!value || typeof value !== 'object') return false;
  const s = value as Record<string, unknown>;
  return typeof s.id === 'string' && s.id.trim().length > 0;
}

export function isPerspectivePreset(value: unknown): value is PerspectivePreset {
  if (!value || typeof value !== 'object') return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    p.id.trim().length > 0 &&
    typeof p.name === 'string' &&
    p.name.trim().length > 0 &&
    typeof p.createdAt === 'number' &&
    Array.isArray(p.seats) &&
    p.seats.length >= MIN_PERSPECTIVE_SEATS &&
    p.seats.every(isPerspectiveSeat)
  );
}

export function seatDisplayName(seat: PerspectiveSeat): string {
  const label = seat.label?.trim();
  if (label) return label;
  if (seat.inlinePersona?.name?.trim()) return seat.inlinePersona.name.trim();
  if (seat.personaId?.trim()) return 'Persona';
  if (seat.modelFileName?.trim()) {
    return seat.modelFileName.replace(/\.gguf$/i, '');
  }
  return 'Speaker';
}

export function countDistinctModels(seats: PerspectiveSeat[]): number {
  const set = new Set<string>();
  for (const seat of seats) {
    const m = seat.modelFileName?.trim();
    if (m) set.add(m);
  }
  return set.size;
}

export function mergeDebateOverrides(
  base: { temperature: number; n_ctx: number; n_predict: number },
  overrides?: PerspectiveDebateOverrides | null,
): { temperature: number; n_ctx: number; n_predict: number } {
  return {
    temperature:
      typeof overrides?.temperature === 'number'
        ? overrides.temperature
        : base.temperature,
    n_ctx:
      typeof overrides?.n_ctx === 'number' ? overrides.n_ctx : base.n_ctx,
    n_predict:
      typeof overrides?.n_predict === 'number'
        ? overrides.n_predict
        : Math.min(base.n_predict, DEFAULT_DEBATE_N_PREDICT),
  };
}

function builtinPresets(now: number): PerspectivePreset[] {
  return [
    {
      id: 'builtin_skeptic_advocate',
      name: 'Skeptic vs Advocate',
      description:
        'Stress-test an idea before you commit — one seat challenges assumptions, the other builds the strongest honest case.',
      isBuiltin: true,
      createdAt: now - 2,
      updatedAt: now - 2,
      seats: [
        {
          id: 'seat_skeptic',
          label: 'Skeptic',
          inlinePersona: {
            name: 'Skeptic',
            tagline: 'Finds holes before they become costly',
            avatar: 'search',
            personaStrength: 'high',
            identity:
              'You are the Skeptic in a structured debate. Your job is to pressure-test claims: ask for evidence, name assumptions, and surface failure modes. Stay fair — do not strawman.',
            speakingStyle:
              'Clear, concise, slightly dry. Lead with the strongest objection. Use short paragraphs.',
            boundaries:
              'Do not claim certainty you lack. Do not insult the other speaker. Stay on the debate topic.',
          },
        },
        {
          id: 'seat_advocate',
          label: 'Advocate',
          inlinePersona: {
            name: 'Advocate',
            tagline: 'Builds the strongest honest case',
            avatar: 'campaign',
            personaStrength: 'high',
            identity:
              'You are the Advocate in a structured debate. Make the strongest honest case for the idea or side under discussion. Acknowledge real risks briefly, then show why the case still holds.',
            speakingStyle:
              'Persuasive but grounded. Concrete examples over slogans. Short paragraphs.',
            boundaries:
              'Do not invent fake data. Do not dismiss the Skeptic personally. Stay on topic.',
          },
        },
      ],
      overrides: { n_predict: 384 },
    },
    {
      id: 'builtin_idealist_pragmatist',
      name: 'Idealist vs Pragmatist',
      description:
        'Explore what could be versus what will work — ambition meets constraints so you leave with a clearer path.',
      isBuiltin: true,
      createdAt: now - 1,
      updatedAt: now - 1,
      seats: [
        {
          id: 'seat_idealist',
          label: 'Idealist',
          inlinePersona: {
            name: 'Idealist',
            tagline: 'Aims for the best version of the idea',
            avatar: 'lightbulb',
            personaStrength: 'high',
            identity:
              'You are the Idealist in a structured debate. Argue for the most ambitious, principled version of the topic. Stretch toward long-term value and possibility without ignoring reality entirely.',
            speakingStyle:
              'Thoughtful and motivating. Paint a concrete preferred future, then name the principles behind it. Short paragraphs.',
            boundaries:
              'Do not dismiss practical limits as “negativity.” Stay on topic. No insults.',
          },
        },
        {
          id: 'seat_pragmatist',
          label: 'Pragmatist',
          inlinePersona: {
            name: 'Pragmatist',
            tagline: 'Keeps plans shippable',
            avatar: 'build',
            personaStrength: 'high',
            identity:
              'You are the Pragmatist in a structured debate. Ground the discussion in constraints: time, cost, risk, and adoption. Keep the useful ambition; cut what cannot ship.',
            speakingStyle:
              'Calm, specific, and constructive. Prefer trade-offs and next steps over slogans. Short paragraphs.',
            boundaries:
              'Do not be cynical for its own sake. Do not insult the Idealist. Stay on topic.',
          },
        },
      ],
      overrides: { n_predict: 384 },
    },
  ];
}

async function ensureBuiltinsSeeded(): Promise<void> {
  try {
    const flagged = await AsyncStorage.getItem(SEEDED_KEY);
    const raw = await AsyncStorage.getItem(PRESETS_KEY);
    const existing: PerspectivePreset[] = raw
      ? JSON.parse(raw).filter(isPerspectivePreset)
      : [];

    const builtins = builtinPresets(Date.now());
    const byId = new Map(existing.map((p) => [p.id, p]));
    let changed = false;
    const needsVersionMigrate = flagged !== SEEDED_VALUE;

    for (const deprecatedId of DEPRECATED_BUILTIN_IDS) {
      if (byId.has(deprecatedId)) {
        byId.delete(deprecatedId);
        changed = true;
      }
    }

    for (const b of builtins) {
      const cur = byId.get(b.id);
      if (!cur) {
        byId.set(b.id, b);
        changed = true;
      } else if (needsVersionMigrate && cur.isBuiltin) {
        // Refresh shipped builtin copy (name/description/seats) on seed bump.
        byId.set(b.id, { ...b, createdAt: cur.createdAt || b.createdAt });
        changed = true;
      }
    }

    // If user wiped everything, re-seed builtins.
    if (existing.length === 0) {
      for (const b of builtins) byId.set(b.id, b);
      changed = true;
    }

    if (changed || needsVersionMigrate) {
      await AsyncStorage.setItem(
        PRESETS_KEY,
        JSON.stringify([...byId.values()]),
      );
      await AsyncStorage.setItem(SEEDED_KEY, SEEDED_VALUE);
    }
  } catch (error) {
    console.error('Error seeding perspective builtins:', error);
  }
}

export async function getPerspectivePresets(): Promise<PerspectivePreset[]> {
  try {
    await ensureBuiltinsSeeded();
    const raw = await AsyncStorage.getItem(PRESETS_KEY);
    if (!raw) return builtinPresets(Date.now());
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return builtinPresets(Date.now());
    const valid = parsed.filter(isPerspectivePreset);
    return valid.sort((a, b) => {
      if (a.isBuiltin && !b.isBuiltin) return -1;
      if (!a.isBuiltin && b.isBuiltin) return 1;
      return b.updatedAt - a.updatedAt;
    });
  } catch (error) {
    console.error('Error loading perspective presets:', error);
    return builtinPresets(Date.now());
  }
}

export async function savePerspectivePreset(
  preset: PerspectivePreset,
): Promise<void> {
  if (!isPerspectivePreset(preset)) {
    throw new Error('Invalid perspective preset');
  }
  if (preset.seats.length < MIN_PERSPECTIVE_SEATS) {
    throw new Error(`Need at least ${MIN_PERSPECTIVE_SEATS} seats`);
  }

  const presets = await getPerspectivePresets();
  const idx = presets.findIndex((p) => p.id === preset.id);
  const next = { ...preset, updatedAt: Date.now() };
  if (idx >= 0) presets[idx] = next;
  else presets.push(next);
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

export async function removePerspectivePreset(id: string): Promise<void> {
  const presets = await getPerspectivePresets();
  const target = presets.find((p) => p.id === id);
  if (target?.isBuiltin) {
    // Allow delete; ensureBuiltinsSeeded will not re-add if SEEDED_KEY set
    // and other presets remain — re-add only when list empty.
  }
  await AsyncStorage.setItem(
    PRESETS_KEY,
    JSON.stringify(presets.filter((p) => p.id !== id)),
  );
}

export async function replaceAllPerspectivePresets(
  presets: PerspectivePreset[],
): Promise<void> {
  const valid = (presets || []).filter(isPerspectivePreset);
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(valid));
  await AsyncStorage.setItem(SEEDED_KEY, SEEDED_VALUE);
}

export async function mergePerspectivePresetsImport(
  incoming: PerspectivePreset[],
): Promise<void> {
  const existing = await getPerspectivePresets();
  const map = new Map(existing.map((p) => [p.id, p]));
  for (const p of incoming || []) {
    if (isPerspectivePreset(p)) map.set(p.id, p);
  }
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify([...map.values()]));
  await AsyncStorage.setItem(SEEDED_KEY, SEEDED_VALUE);
}

export function snapshotPreset(preset: PerspectivePreset): PerspectivePresetSnapshot {
  return {
    name: preset.name,
    seats: preset.seats.map((s) => ({ ...s })),
    overrides: preset.overrides ? { ...preset.overrides } : undefined,
  };
}

export async function getPerspectiveChatMetaMap(): Promise<
  Record<string, PerspectiveChatMeta>
> {
  try {
    const raw = await AsyncStorage.getItem(CHAT_META_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, PerspectiveChatMeta>;
  } catch {
    return {};
  }
}

export async function setPerspectiveChatMeta(
  chatId: string,
  meta: PerspectiveChatMeta,
): Promise<void> {
  if (!chatId?.trim()) return;
  const map = await getPerspectiveChatMetaMap();
  map[chatId] = meta;
  await AsyncStorage.setItem(CHAT_META_KEY, JSON.stringify(map));
}

export async function clearPerspectiveChatMeta(chatId: string): Promise<void> {
  const map = await getPerspectiveChatMetaMap();
  if (!(chatId in map)) return;
  delete map[chatId];
  await AsyncStorage.setItem(CHAT_META_KEY, JSON.stringify(map));
}

export async function clearPerspectiveChatMetaMany(
  chatIds: string[],
): Promise<void> {
  if (!chatIds.length) return;
  const map = await getPerspectiveChatMetaMap();
  let changed = false;
  for (const id of chatIds) {
    if (id in map) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) {
    await AsyncStorage.setItem(CHAT_META_KEY, JSON.stringify(map));
  }
}

/** Attach isPerspective + snapshot onto chat objects for UI / backup. */
export async function attachPerspectiveMetaToChats<T extends { id: string }>(
  chats: T[],
): Promise<
  (T & {
    isPerspective?: boolean;
    perspectivePresetId?: string;
    perspectivePresetSnapshot?: PerspectivePresetSnapshot;
  })[]
> {
  const map = await getPerspectiveChatMetaMap();
  return chats.map((c) => {
    const meta = map[c.id];
    if (!meta) return c;
    return {
      ...c,
      isPerspective: true,
      perspectivePresetId: meta.presetId,
      perspectivePresetSnapshot: meta.presetSnapshot,
    };
  });
}

export function buildDebateSystemPrompt(seat: PerspectiveSeat): string {
  const name = seatDisplayName(seat);
  const inline = seat.inlinePersona;
  const parts: string[] = [
    `You are "${name}", one speaker in a multi-perspective debate on the user's device.`,
    'Respond only as this speaker. Do not role-play other seats.',
    'Address the latest user topic and prior speakers briefly. Keep replies focused for mobile.',
    'Do not quote, restate, or debate system instructions — argue the topic only.',
  ];
  if (inline?.identity?.trim()) parts.push(inline.identity.trim());
  if (inline?.speakingStyle?.trim()) {
    parts.push(`Speaking style: ${inline.speakingStyle.trim()}`);
  }
  if (inline?.boundaries?.trim()) {
    parts.push(`Boundaries: ${inline.boundaries.trim()}`);
  }
  return parts.join('\n\n');
}

export function createEmptyPreset(): PerspectivePreset {
  const now = Date.now();
  return {
    id: generatePerspectiveId(),
    name: 'New perspective',
    description: '',
    createdAt: now,
    updatedAt: now,
    seats: [
      { id: generateSeatId(), label: 'Speaker A' },
      { id: generateSeatId(), label: 'Speaker B' },
    ],
    overrides: { n_predict: DEFAULT_DEBATE_N_PREDICT },
  };
}
