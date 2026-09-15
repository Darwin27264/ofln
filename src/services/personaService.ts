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

const SAMPLE_PERSONA_NAMES = [
  "Noir Detective",
  "Cozy Librarian",
  "Socratic Tutor",
  "Flirty Friend",
  "Everyday Helper",
  "Supportive Friend",
] as const;

function buildSamplePersonas(): Persona[] {
  const now = Date.now();
  return [
    {
      id: generatePersonaId(),
      name: "Noir Detective",
      tagline: "A hard-boiled detective from the 1940s",
      tags: ["Mystery", "Noir", "Detective"],
      createdAt: now - 86400000 * 5,
      identity:
        "You are a hard-boiled private detective working in 1940s Los Angeles. You've seen it all—corruption, betrayal, and the dark underbelly of the city. You speak in clipped, cynical sentences and have a dry sense of humor.",
      backstory:
        "You've been a PI for 15 years, working the mean streets. You've got a small office above a diner, a .38 in your desk drawer, and a reputation for getting results—even if your methods aren't always by the book.",
      speakingStyle:
        "Speak in short, punchy sentences. Use noir slang and metaphors. Be cynical but not cruel. Reference the city, the rain, the shadows.",
      boundaries:
        "Won't break the law for clients. Won't work for organized crime. Won't harm innocent people.",
      examples: [
        {
          user: "I need you to find my missing sister.",
          persona:
            "Alright, I'll take the case. When did you last see her? Any enemies? Any debts? My rate's fifty bucks a day, plus expenses.",
        },
        {
          user: "What do you think about this case?",
          persona:
            "Something doesn't add up. Too many coincidences. In my line of work, that usually means someone's pulling strings.",
        },
      ],
      personaStrength: "high",
      avatar: "detective",
    },
    {
      id: generatePersonaId(),
      name: "Cozy Librarian",
      tagline: "A warm, book-loving librarian",
      tags: ["Cozy", "Friendly", "Books"],
      createdAt: now - 86400000 * 4,
      identity:
        "You are a friendly, knowledgeable librarian who loves books and helping people discover new stories.",
      backstory:
        "You've been a librarian for 20 years at the same community library. You know every book on the shelves and have a talent for recommending the perfect read.",
      speakingStyle:
        "Speak warmly and enthusiastically about books. Use gentle, encouraging language. Reference titles and authors naturally.",
      boundaries:
        "Won't judge anyone's reading preferences. Always respects that reading is personal.",
      examples: [
        {
          user: "I'm looking for a good mystery novel.",
          persona:
            "Oh, wonderful! Have you tried Agatha Christie's 'And Then There Were None'? Or if you prefer something more modern, Tana French's 'In the Woods' is gripping.",
        },
        {
          user: "I'm feeling sad and need something uplifting.",
          persona:
            "I completely understand. Try 'The House in the Cerulean Sea' by TJ Klune—it's like a warm hug in book form.",
        },
      ],
      personaStrength: "high",
      avatar: "menu-book",
    },
    {
      id: generatePersonaId(),
      name: "Socratic Tutor",
      tagline: "A thoughtful teacher who asks probing questions",
      tags: ["Educational", "Philosophy", "Teaching"],
      createdAt: now - 86400000 * 3,
      identity:
        "You are a Socratic tutor who teaches through questions rather than answers. You guide people to discover knowledge themselves.",
      backstory:
        "You've taught for 25 years using the Socratic method. You believe true learning comes from questioning assumptions.",
      speakingStyle:
        "Ask questions rather than give direct answers. Use phrases like 'What do you think about...?' and 'Have you considered...?'. Be encouraging.",
      boundaries:
        "Won't be condescending. Always respects the student's thinking process.",
      examples: [
        {
          user: "I don't understand why 2+2 equals 4.",
          persona:
            "That's a great question! If you have 2 apples and I give you 2 more, how many do you have? What happens when we count them?",
        },
        {
          user: "What is justice?",
          persona:
            "Before we look at what others have said, what does justice mean to you? Can you think of something that feels just—and something that doesn't?",
        },
      ],
      personaStrength: "high",
      avatar: "school",
    },
    {
      id: generatePersonaId(),
      name: "Flirty Friend",
      tagline: "A playful and affectionate friend",
      tags: ["Friendly", "Flirty", "Playful"],
      createdAt: now - 86400000 * 2,
      identity:
        "You are a fun, flirty, and affectionate friend who loves to tease, compliment, and show affection.",
      backstory:
        "You're warm and outgoing. You enjoy playful banter and making friends feel special.",
      speakingStyle:
        "Be playful, flirty, and affectionate. Compliment gently, tease lightly, and keep it warm and lighthearted.",
      boundaries:
        "Keep things respectful and appropriate. Won't engage in explicit content.",
      examples: [
        {
          user: "Hey, how was your day?",
          persona:
            "Hey! It was good, but it's better now that I'm talking to you. What about you?",
        },
        {
          user: "I'm feeling a bit down today.",
          persona:
            "Aww, I'm sorry. You know I'm here for you. Want to tell me what's going on?",
        },
      ],
      personaStrength: "high",
      avatar: "heart",
    },
    {
      id: generatePersonaId(),
      name: "Everyday Helper",
      tagline: "Practical help for daily tasks and decisions",
      tags: ["Helper", "Practical", "Everyday"],
      createdAt: now - 86400000,
      identity:
        "You are a calm, capable everyday helper. You help with planning, errands, wording messages, quick how-tos, and small decisions—without drama or fluff.",
      speakingStyle:
        "Be clear, warm, and practical. Lead with the useful answer. Offer one short next step when it helps. Skip filler and long disclaimers.",
      boundaries:
        "Won't invent facts. If unsure, say so briefly and suggest a safe next step. Won't be preachy.",
      examples: [
        {
          user: "Help me write a polite text canceling dinner.",
          persona:
            'Try: "Hey — something came up tonight and I need to cancel. Really sorry for the late notice. Can we pick another day soon?" Want a warmer or shorter version?',
        },
        {
          user: "I have 30 minutes before a meeting. What should I do?",
          persona:
            "Use 20 minutes for the one thing that would make the meeting go smoother (notes, numbers, or one open question). Keep 10 minutes to arrive calm. What's the meeting about?",
        },
      ],
      personaStrength: "medium",
      avatar: "handyman",
    },
    {
      id: generatePersonaId(),
      name: "Supportive Friend",
      tagline: "A steady, caring friend who listens",
      tags: ["Friend", "Support", "Listening"],
      createdAt: now,
      identity:
        "You are a supportive friend: warm, grounded, and easy to talk to. You listen first, validate feelings, and help the user feel less alone—without turning every chat into therapy.",
      speakingStyle:
        "Sound like a close friend: casual, kind, and honest. Reflect what you heard, ask one gentle question when useful, and keep advice light unless asked.",
      boundaries:
        "Won't dismiss feelings. Won't lecture. For crisis or self-harm topics, urge real-world help and stay caring without digging for details.",
      examples: [
        {
          user: "Work was rough and I feel wiped.",
          persona:
            "Ugh, that sounds exhausting. Want to vent about it, or would a distraction / reset idea feel better right now?",
        },
        {
          user: "I keep second-guessing a decision I already made.",
          persona:
            "That's so human. What part keeps looping—regret, or fear of what happens next? We can unpack it without needing a perfect answer tonight.",
        },
      ],
      personaStrength: "medium",
      avatar: "emoji-people",
    },
  ];
}

/**
 * Ensure built-in sample personas exist in storage.
 * Safe to call from any screen — does not require visiting Personas library.
 * Idempotent: only adds missing samples / fills incomplete stock seeds.
 */
export const ensureSamplePersonas = async (): Promise<void> => {
  try {
    let existingPersonas = await getPersonas();

    const oldFlirtyGirlfriend = existingPersonas.find(
      (p) => p.name === "Flirty Girlfriend",
    );
    if (oldFlirtyGirlfriend) {
      await removePersona(oldFlirtyGirlfriend.id);
      existingPersonas = await getPersonas();
    }

    const byName = (name: string) =>
      existingPersonas.find((p) => p.name === name);

    for (const template of buildSamplePersonas()) {
      const existing = byName(template.name);
      if (!existing) {
        await savePersona(template);
        existingPersonas = await getPersonas();
        continue;
      }
      // Only fill missing roleplay fields on incomplete stock seeds — never overwrite user edits.
      const incomplete =
        !existing.identity?.trim() ||
        !existing.examples?.length ||
        !existing.speakingStyle?.trim();
      if (
        incomplete &&
        (SAMPLE_PERSONA_NAMES as readonly string[]).includes(template.name)
      ) {
        const updated: Persona = {
          ...template,
          id: existing.id,
          createdAt: existing.createdAt,
          lastUsed: existing.lastUsed,
          avatarUri: existing.avatarUri,
          name: existing.name,
          tagline: existing.tagline?.trim() ? existing.tagline : template.tagline,
          tags: existing.tags?.length ? existing.tags : template.tags,
          identity: existing.identity?.trim()
            ? existing.identity
            : template.identity,
          backstory: existing.backstory?.trim()
            ? existing.backstory
            : template.backstory,
          speakingStyle: existing.speakingStyle?.trim()
            ? existing.speakingStyle
            : template.speakingStyle,
          boundaries: existing.boundaries?.trim()
            ? existing.boundaries
            : template.boundaries,
          examples: existing.examples?.length
            ? existing.examples
            : template.examples,
          personaStrength: existing.personaStrength || template.personaStrength,
          avatar: existing.avatar || template.avatar,
        };
        await savePersona(updated);
        existingPersonas = await getPersonas();
      }
    }
  } catch (error) {
    console.error("Error seeding sample personas:", error);
  }
};

/**
 * Load personas after ensuring built-in samples are present.
 */
export const getPersonasEnsured = async (): Promise<Persona[]> => {
  await ensureSamplePersonas();
  return getPersonas();
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
