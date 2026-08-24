import AsyncStorage from "@react-native-async-storage/async-storage";
import RNFS from "react-native-fs";
import {
  SYSTEM_PROMPT_GEMMA,
  SYSTEM_PROMPT_MOBILE,
  SYSTEM_PROMPT_PHI,
  SYSTEM_PROMPT_TINY,
} from "./inference/promptDefaults";

const PERSONAS_KEY = "@personas";
const AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/persona_avatars`;

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  tags?: string[];
  lastUsed?: number;
  createdAt: number;
  identity?: string;
  backstory?: string;
  speakingStyle?: string;
  boundaries?: string;
  breakCharacterWhen?: string;
  examples?: Array<{ user: string; persona: string }>;
  personaStrength?: "low" | "medium" | "high";
  /** Material icon name for seeded / icon-only personas. */
  avatar?: string;
  /** Durable local image URI (file://...) for a user-picked profile pic. */
  avatarUri?: string;
}

/**
 * Get all saved personas with validation
 */
export const getPersonas = async (): Promise<Persona[]> => {
  try {
    const personasJson = await AsyncStorage.getItem(PERSONAS_KEY);
    if (personasJson) {
      const parsed = JSON.parse(personasJson);
      if (!Array.isArray(parsed)) {
        console.error("Invalid personas data format, expected array");
        return [];
      }
      const validPersonas = parsed.filter((p: any) =>
        p &&
        typeof p.id === "string" &&
        p.id.trim().length > 0 &&
        typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        typeof p.createdAt === "number"
      );
      if (validPersonas.length !== parsed.length) {
        console.warn(`Filtered out ${parsed.length - validPersonas.length} invalid personas`);
        try {
          await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(validPersonas));
        } catch (saveError) {
          console.error("Error saving cleaned personas:", saveError);
        }
      }
      return validPersonas;
    }
    return [];
  } catch (error) {
    console.error("Error loading personas:", error);
    try {
      await AsyncStorage.removeItem(PERSONAS_KEY);
      console.warn("Cleared corrupted personas data");
    } catch (clearError) {
      console.error("Error clearing corrupted personas:", clearError);
    }
    return [];
  }
};

/**
 * Save a persona to storage with retry mechanism
 */
export const savePersona = async (persona: Persona): Promise<void> => {
  if (!persona || !persona.id || !persona.name || !persona.createdAt) {
    throw new Error("Invalid persona data: missing required fields (id, name, createdAt)");
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const personas = await getPersonas();
      const existingIndex = personas.findIndex((p) => p.id === persona.id);

      if (existingIndex >= 0) {
        personas[existingIndex] = {
          ...persona,
          lastUsed: persona.lastUsed || personas[existingIndex].lastUsed,
        };
      } else {
        const duplicateName = personas.find(
          (p) =>
            p.name.trim().toLowerCase() === persona.name.trim().toLowerCase() &&
            p.id !== persona.id
        );
        if (duplicateName) {
          console.warn(
            `Warning: Persona with name "${persona.name}" already exists with different ID`
          );
        }
        personas.push(persona);
      }

      await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
      const verifyPersonas = await getPersonas();
      const savedPersona = verifyPersonas.find((p) => p.id === persona.id);
      if (!savedPersona) {
        throw new Error("Persona was not saved correctly");
      }

      return;
    } catch (error) {
      lastError = error as Error;
      console.error(`Error saving persona (attempt ${attempt + 1}/${maxRetries}):`, error);

      if (attempt < maxRetries - 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      }
    }
  }

  console.error("Failed to save persona after all retries");
  throw lastError || new Error("Failed to save persona");
};

/**
 * Remove a persona from storage
 */
export const removePersona = async (personaId: string): Promise<void> => {
  try {
    const personas = await getPersonas();
    const filtered = personas.filter((p) => p.id !== personaId);
    await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(filtered));
    await deletePersonaAvatar(personaId).catch(() => {});
  } catch (error) {
    console.error("Error removing persona:", error);
    throw error;
  }
};

/**
 * Update last used timestamp for a persona
 */
export const updatePersonaLastUsed = async (personaId: string): Promise<void> => {
  try {
    const personas = await getPersonas();
    const persona = personas.find((p) => p.id === personaId);
    if (persona) {
      persona.lastUsed = Date.now();
      await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
    }
  } catch (error) {
    console.error("Error updating persona last used:", error);
  }
};

/**
 * Generate a unique ID for a new persona
 */
export const generatePersonaId = (): string => {
  return `persona_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
};

/**
 * Replace all personas (backup restore, replace mode).
 * Filters invalid entries; never writes secrets.
 */
export const replaceAllPersonas = async (personas: Persona[]): Promise<void> => {
  const valid = (personas || []).filter(
    (p) =>
      p &&
      typeof p.id === "string" &&
      p.id.trim().length > 0 &&
      typeof p.name === "string" &&
      p.name.trim().length > 0 &&
      typeof p.createdAt === "number"
  );
  await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(valid));
};

/**
 * Merge personas by id (import wins on collision).
 */
export const mergePersonasImport = async (incoming: Persona[]): Promise<void> => {
  const existing = await getPersonas();
  const map = new Map<string, Persona>();
  for (const p of existing) map.set(p.id, p);
  for (const p of incoming || []) {
    if (
      p &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      typeof p.createdAt === "number"
    ) {
      map.set(p.id, p);
    }
  }
  await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify([...map.values()]));
};

/** True when a string looks like a local / remote image URI rather than an icon name. */
export function isAvatarImageUri(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return (
    v.startsWith("file://") ||
    v.startsWith("content://") ||
    v.startsWith("/") ||
    v.startsWith("http://") ||
    v.startsWith("https://")
  );
}

/** Prefer user photo, then legacy avatar URI stored in `avatar`, else null. */
export function resolvePersonaAvatarUri(persona?: Persona | null): string | null {
  if (!persona) return null;
  if (persona.avatarUri && isAvatarImageUri(persona.avatarUri)) {
    return persona.avatarUri.startsWith("file://") || persona.avatarUri.startsWith("content://")
      ? persona.avatarUri
      : persona.avatarUri.startsWith("/")
        ? `file://${persona.avatarUri}`
        : persona.avatarUri;
  }
  if (persona.avatar && isAvatarImageUri(persona.avatar)) {
    return persona.avatar.startsWith("/") ? `file://${persona.avatar}` : persona.avatar;
  }
  return null;
}

async function ensureAvatarDir(): Promise<void> {
  try {
    if (!(await RNFS.exists(AVATAR_DIR))) {
      await RNFS.mkdir(AVATAR_DIR);
    }
  } catch (error) {
    console.error("Error creating persona avatar dir:", error);
  }
}

/**
 * Copy a picked image into durable app documents storage for this persona.
 * Returns a file:// URI suitable for Image + persistence.
 */
export async function persistPersonaAvatar(
  personaId: string,
  sourceUri: string
): Promise<string> {
  const trimmed = (sourceUri || "").trim();
  if (!trimmed || !personaId) {
    throw new Error("Missing persona id or image URI");
  }

  await ensureAvatarDir();

  let sourcePath = trimmed;
  if (trimmed.startsWith("file://")) {
    sourcePath = trimmed.replace(/^file:\/\//, "");
  } else if (trimmed.startsWith("content://")) {
    // Copy content:// into our dir via RNFS.copyFile (Android)
    const dest = `${AVATAR_DIR}/${personaId}.jpg`;
    await RNFS.copyFile(trimmed, dest);
    return `file://${dest}`;
  }

  const dest = `${AVATAR_DIR}/${personaId}.jpg`;
  if (sourcePath !== dest) {
    const exists = await RNFS.exists(sourcePath);
    if (!exists) {
      throw new Error("Picked image is no longer available");
    }
    await RNFS.copyFile(sourcePath, dest);
  }
  return `file://${dest}`;
}

export async function deletePersonaAvatar(personaId: string): Promise<void> {
  if (!personaId) return;
  const dest = `${AVATAR_DIR}/${personaId}.jpg`;
  try {
    if (await RNFS.exists(dest)) {
      await RNFS.unlink(dest);
    }
  } catch {
    // ignore
  }
}

/** Known default system prompts that should yield to the persona identity. */
const KNOWN_DEFAULT_PROMPTS = new Set(
  [
    "",
    "This is a conversation between user and assistant, a friendly chatbot.",
    "You are a helpful, friendly assistant.",
    SYSTEM_PROMPT_MOBILE,
    SYSTEM_PROMPT_TINY,
    SYSTEM_PROMPT_GEMMA,
    SYSTEM_PROMPT_PHI,
  ].map((s) => s.trim())
);

export function isDefaultSystemPrompt(baseSystemPrompt: string | null | undefined): boolean {
  const t = (baseSystemPrompt || "").trim();
  if (!t) return true;
  if (KNOWN_DEFAULT_PROMPTS.has(t)) return true;
  // Match current / future mobile assistant baselines without hardcoding every variant.
  if (
    /^You are a (helpful|concise|careful) assistant on (the user's device|this phone)/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Build a system prompt from persona settings.
 *
 * Persona identity replaces stock assistant prompts so small models stay in character.
 * Strength gates which fields are injected (matches editor copy).
 */
export const buildPersonaSystemPrompt = (
  persona: Persona | null,
  baseSystemPrompt: string
): string => {
  const appendHelpfulReplyRules = (prompt: string): string => {
    if (
      /Prefer a direct answer/i.test(prompt) ||
      /Never include chain-of-thought/i.test(prompt) ||
      /Never write chain-of-thought/i.test(prompt) ||
      /Do not narrate planning/i.test(prompt) ||
      /Start with the answer/i.test(prompt) ||
      /Keep simple asks short/i.test(prompt)
    ) {
      return prompt;
    }
    return (
      `${prompt.trim()} ` +
      `Answer clearly. Keep simple asks short. ` +
      `Start with the answer — avoid openers like "I need to" or "Wait,".`
    );
  };

  if (!persona) {
    return appendHelpfulReplyRules(
      baseSystemPrompt || "You are a helpful, friendly assistant."
    );
  }

  const strength = persona.personaStrength || "medium";
  const personaParts: string[] = [];

  const push = (value?: string) => {
    const t = value?.trim();
    if (t) personaParts.push(t);
  };

  // Strength gates fields (editor: low=style, medium=+identity+boundaries, high=+backstory+examples)
  if (strength === "low") {
    push(persona.speakingStyle);
  } else if (strength === "medium") {
    push(persona.identity);
    push(persona.speakingStyle);
    push(persona.boundaries);
  } else {
    push(persona.identity);
    push(persona.backstory);
    push(persona.speakingStyle);
    push(persona.boundaries);
    if (persona.breakCharacterWhen?.trim()) {
      personaParts.push(
        `Only leave character if the user explicitly asks, or if: ${persona.breakCharacterWhen.trim()}`
      );
    }
    if (persona.examples && persona.examples.length > 0) {
      const validExamples = persona.examples.filter(
        (ex) => ex && ex.user && ex.persona && ex.user.trim() && ex.persona.trim()
      );
      if (validExamples.length > 0) {
        const exampleTexts = validExamples.map((example, idx) => {
          return `Example ${idx + 1}:\nUser: ${example.user.trim()}\nYou: ${example.persona.trim()}`;
        });
        personaParts.push(`Match this voice:\n${exampleTexts.join("\n\n")}`);
      }
    }
  }

  // Character lock — keep short; tiny models need a clear primary identity.
  const characterLock =
    strength === "low"
      ? `Stay subtly in character as ${persona.name}. Sound natural; do not announce that you are roleplaying.`
      : strength === "high"
        ? `You ARE ${persona.name}. Stay fully in character at all times. Do not mention being an AI, a language model, or an assistant unless the user explicitly asks you to break character. Write as this person would.`
        : `You are ${persona.name}. Stay in character. Do not mention being an AI or break character unless the user explicitly asks.`;

  personaParts.push(characterLock);

  const lengthGuidance =
    strength === "high"
      ? "Match reply length to the question — short questions get short answers, still in character."
      : strength === "low"
        ? "Keep replies brief and natural."
        : "Keep replies concise and natural — match length to how complex the question is.";

  personaParts.push(lengthGuidance);

  const personaContent = personaParts.join("\n\n");
  const header = `You are ${persona.name}.`;
  const personaBlock = personaContent
    ? `${header}\n\n${personaContent}`
    : header;

  // Default model prompts fight character — replace them. Custom user prompts stay secondary.
  if (isDefaultSystemPrompt(baseSystemPrompt)) {
    // Skip "Start with the answer" rules for medium/high RP — they flatten voice.
    if (strength === "low") {
      return appendHelpfulReplyRules(personaBlock);
    }
    return personaBlock;
  }

  const combined =
    `${personaBlock}\n\n` +
    `Also respect these user instructions when they do not conflict with staying in character:\n` +
    `${baseSystemPrompt.trim()}`;

  if (strength === "low") {
    return appendHelpfulReplyRules(combined);
  }
  return combined;
};
