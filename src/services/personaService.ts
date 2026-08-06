import AsyncStorage from "@react-native-async-storage/async-storage";

const PERSONAS_KEY = "@personas";

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
  avatar?: string;
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
        typeof p.id === 'string' && 
        p.id.trim().length > 0 &&
        typeof p.name === 'string' && 
        p.name.trim().length > 0 &&
        typeof p.createdAt === 'number'
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
        const duplicateName = personas.find((p) => p.name.trim().toLowerCase() === persona.name.trim().toLowerCase() && p.id !== persona.id);
        if (duplicateName) {
          console.warn(`Warning: Persona with name "${persona.name}" already exists with different ID`);
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
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
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
      typeof p.createdAt === "number",
  );
  await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(valid));
};

/**
 * Merge personas by id (import wins on collision).
 */
export const mergePersonasImport = async (
  incoming: Persona[],
): Promise<void> => {
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

/**
 * Build a system prompt from persona settings
 * 
 * @param persona - The persona to build the prompt from
 * @param baseSystemPrompt - The base system prompt from model settings
 * @returns A combined system prompt string
 */
export const buildPersonaSystemPrompt = (
  persona: Persona | null,
  baseSystemPrompt: string
): string => {
  const appendHelpfulReplyRules = (prompt: string): string => {
    // Already has our reply-style guidance (new or legacy phrasing).
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
    // Keep appended rules minimal — long negative lists stall tiny models.
    return (
      `${prompt.trim()} ` +
      `Answer clearly. Keep simple asks short. ` +
      `Start with the answer — avoid openers like "I need to" or "Wait,".`
    );
  };

  if (!persona) {
    return appendHelpfulReplyRules(
      baseSystemPrompt || "You are a helpful, friendly assistant.",
    );
  }

  const personaParts: string[] = [];

  if (persona.identity && persona.identity.trim()) {
    personaParts.push(persona.identity.trim());
  }

  if (persona.backstory && persona.backstory.trim()) {
    personaParts.push(persona.backstory.trim());
  }

  if (persona.speakingStyle && persona.speakingStyle.trim()) {
    personaParts.push(persona.speakingStyle.trim());
  }

  if (persona.boundaries && persona.boundaries.trim()) {
    personaParts.push(persona.boundaries.trim());
  }

  if (persona.breakCharacterWhen && persona.breakCharacterWhen.trim()) {
    personaParts.push(`You should break character when: ${persona.breakCharacterWhen.trim()}`);
  }

  if (persona.examples && persona.examples.length > 0) {
    const validExamples = persona.examples.filter(
      (ex) => ex && ex.user && ex.persona && ex.user.trim() && ex.persona.trim()
    );
    if (validExamples.length > 0) {
      const exampleTexts = validExamples.map((example, idx) => {
        return `Example ${idx + 1}:\nUser: ${example.user.trim()}\nYou: ${example.persona.trim()}`;
      });
      personaParts.push(`Example conversations:\n${exampleTexts.join("\n\n")}`);
    }
  }

  // Strength-based response guidance: controls how strongly the persona
  // influences verbosity. Low strength stays brief, high strength can be
  // more expressive — but all strengths avoid rambling on simple messages.
  const strengthGuidance =
    persona.personaStrength === "high"
      ? "Express yourself fully in character, but always match response length to the complexity of the question — short questions deserve short answers."
      : persona.personaStrength === "low"
      ? "Stay in character subtly. Keep responses brief and natural."
      : "Stay in character. Keep responses concise and natural — match your reply length to how complex the question actually is.";

  personaParts.push(strengthGuidance);

  const personaContent = personaParts.join("\n\n");
  const defaultPrompt = "This is a conversation between user and assistant, a friendly chatbot.";
  const isDefaultPrompt = !baseSystemPrompt || baseSystemPrompt.trim() === defaultPrompt;

  if (isDefaultPrompt) {
    if (personaContent) {
      return appendHelpfulReplyRules(`You are ${persona.name}. ${personaContent}`);
    } else {
      return appendHelpfulReplyRules(`You are ${persona.name}.`);
    }
  } else {
    if (personaContent) {
      return appendHelpfulReplyRules(
        `${baseSystemPrompt}\n\nYou are roleplaying as ${persona.name}.\n\n${personaContent}`,
      );
    } else {
      return appendHelpfulReplyRules(
        `${baseSystemPrompt}\n\nYou are roleplaying as ${persona.name}.`,
      );
    }
  }
};

