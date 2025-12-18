import AsyncStorage from "@react-native-async-storage/async-storage";

const PERSONAS_KEY = "@personas";

export interface Persona {
  id: string;
  name: string;
  tagline: string;
  tags?: string[];
  lastUsed?: number; // timestamp
  createdAt: number; // timestamp
  // Fields for Step 2 (editor) - placeholder structure
  identity?: string;
  backstory?: string;
  speakingStyle?: string;
  boundaries?: string;
  breakCharacterWhen?: string;
  examples?: Array<{ user: string; persona: string }>;
  personaStrength?: "low" | "medium" | "high";
  avatar?: string; // icon name or color
}

/**
 * Get all saved personas
 */
export const getPersonas = async (): Promise<Persona[]> => {
  try {
    const personasJson = await AsyncStorage.getItem(PERSONAS_KEY);
    if (personasJson) {
      return JSON.parse(personasJson);
    }
    return [];
  } catch (error) {
    console.error("Error loading personas:", error);
    return [];
  }
};

/**
 * Save a persona to storage
 */
export const savePersona = async (persona: Persona): Promise<void> => {
  try {
    const personas = await getPersonas();
    // Check if persona already exists (by id)
    const existingIndex = personas.findIndex((p) => p.id === persona.id);
    if (existingIndex >= 0) {
      // Update existing persona
      personas[existingIndex] = persona;
    } else {
      // Add new persona
      personas.push(persona);
    }
    await AsyncStorage.setItem(PERSONAS_KEY, JSON.stringify(personas));
  } catch (error) {
    console.error("Error saving persona:", error);
    throw error;
  }
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
  return `persona_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Build a system prompt from persona settings
 * Combines persona identity, backstory, speaking style, boundaries, and examples
 * into a comprehensive system prompt for the model.
 * 
 * @param persona - The persona to build the prompt from
 * @param baseSystemPrompt - The base system prompt from model settings
 * @returns A combined system prompt string
 */
export const buildPersonaSystemPrompt = (
  persona: Persona | null,
  baseSystemPrompt: string
): string => {
  // If no persona is selected, return the base prompt
  if (!persona) {
    return baseSystemPrompt;
  }

  // Start building the persona-specific parts
  const personaParts: string[] = [];

  // Add persona identity
  if (persona.identity && persona.identity.trim()) {
    personaParts.push(persona.identity.trim());
  }

  // Add backstory
  if (persona.backstory && persona.backstory.trim()) {
    personaParts.push(persona.backstory.trim());
  }

  // Add speaking style
  if (persona.speakingStyle && persona.speakingStyle.trim()) {
    personaParts.push(persona.speakingStyle.trim());
  }

  // Add boundaries
  if (persona.boundaries && persona.boundaries.trim()) {
    personaParts.push(persona.boundaries.trim());
  }

  // Add break character condition
  if (persona.breakCharacterWhen && persona.breakCharacterWhen.trim()) {
    personaParts.push(`You should break character when: ${persona.breakCharacterWhen.trim()}`);
  }

  // Add examples if available
  if (persona.examples && persona.examples.length > 0) {
    const validExamples = persona.examples.filter(
      (ex) => ex.user.trim() && ex.persona.trim()
    );
    if (validExamples.length > 0) {
      const exampleTexts = validExamples.map((example, idx) => {
        return `Example ${idx + 1}:\nUser: ${example.user.trim()}\nYou: ${example.persona.trim()}`;
      });
      personaParts.push(`Example conversations:\n${exampleTexts.join("\n\n")}`);
    }
  }

  // Combine persona parts
  const personaContent = personaParts.join("\n\n");

  // Check if base prompt is the default
  const defaultPrompt = "This is a conversation between user and assistant, a friendly chatbot.";
  const isDefaultPrompt = !baseSystemPrompt || baseSystemPrompt.trim() === defaultPrompt;

  // Build final prompt
  if (isDefaultPrompt) {
    // If using default prompt, create a persona-focused prompt
    if (personaContent) {
      return `You are ${persona.name}. ${personaContent}`;
    } else {
      return `You are ${persona.name}.`;
    }
  } else {
    // If there's a custom base prompt, combine it with persona content
    if (personaContent) {
      return `${baseSystemPrompt}\n\nYou are roleplaying as ${persona.name}.\n\n${personaContent}`;
    } else {
      return `${baseSystemPrompt}\n\nYou are roleplaying as ${persona.name}.`;
    }
  }
};

