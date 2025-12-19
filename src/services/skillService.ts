import AsyncStorage from "@react-native-async-storage/async-storage";

const SKILLS_KEY = "@skills";
const RUN_HISTORY_KEY = "@skill_runs";

// Discriminated union for skill blocks
export type SkillBlockType = "input" | "llm" | "codelib" | "output";

export interface SkillBlock {
  type: SkillBlockType;
  config: {
    // Input block config
    placeholder?: string;
    // LLM block config
    prompt?: string;
    maxTokens?: number;
    temperature?: number;
    // CodeLib block config
    codelibId?: string;
    // Output block config
    format?: "plain" | "bullets" | "checklist" | "json";
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  category?: string;
  iconKey?: string; // Optional icon identifier
  isPinned: boolean;
  isBuiltIn: boolean; // Built-in skills cannot be deleted
  blocks: SkillBlock[];
  defaultModelId?: string;
  defaultPersonaId?: string;
  createdAt: number;
  lastUsed?: number;
}

export interface RunRecord {
  id: string;
  skillId: string;
  timestamp: number;
  inputPreview: string; // First 100 chars
  outputPreview: string; // First 100 chars
  modelId?: string;
  personaId?: string;
  duration?: number; // milliseconds
  tokenCount?: number;
  tokensPerSecond?: number;
  error?: string;
}

/**
 * Get all saved skills
 */
export const getSkills = async (): Promise<Skill[]> => {
  try {
    const skillsJson = await AsyncStorage.getItem(SKILLS_KEY);
    if (skillsJson) {
      return JSON.parse(skillsJson);
    }
    return [];
  } catch (error) {
    console.error("Error loading skills:", error);
    return [];
  }
};

/**
 * Save a skill to storage
 */
export const saveSkill = async (skill: Skill): Promise<void> => {
  try {
    const skills = await getSkills();
    const existingIndex = skills.findIndex((s) => s.id === skill.id);
    if (existingIndex >= 0) {
      skills[existingIndex] = skill;
    } else {
      skills.push(skill);
    }
    await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
  } catch (error) {
    console.error("Error saving skill:", error);
    throw error;
  }
};

/**
 * Remove a skill from storage (only custom skills)
 */
export const removeSkill = async (skillId: string): Promise<void> => {
  try {
    const skills = await getSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (skill && skill.isBuiltIn) {
      throw new Error("Cannot delete built-in skills");
    }
    const filtered = skills.filter((s) => s.id !== skillId);
    await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error removing skill:", error);
    throw error;
  }
};

/**
 * Update last used timestamp for a skill
 */
export const updateSkillLastUsed = async (skillId: string): Promise<void> => {
  try {
    const skills = await getSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (skill) {
      skill.lastUsed = Date.now();
      await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
    }
  } catch (error) {
    console.error("Error updating skill last used:", error);
  }
};

/**
 * Toggle pin status for a skill
 */
export const toggleSkillPin = async (skillId: string): Promise<void> => {
  try {
    const skills = await getSkills();
    const skill = skills.find((s) => s.id === skillId);
    if (skill) {
      skill.isPinned = !skill.isPinned;
      await AsyncStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
    }
  } catch (error) {
    console.error("Error toggling skill pin:", error);
    throw error;
  }
};

/**
 * Generate a unique ID for a new skill
 */
export const generateSkillId = (): string => {
  return `skill_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Get run history (last 20 records)
 */
export const getRunHistory = async (limit: number = 20): Promise<RunRecord[]> => {
  try {
    const historyJson = await AsyncStorage.getItem(RUN_HISTORY_KEY);
    if (historyJson) {
      const allRecords: RunRecord[] = JSON.parse(historyJson);
      // Sort by timestamp descending and return last N
      return allRecords
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    }
    return [];
  } catch (error) {
    console.error("Error loading run history:", error);
    return [];
  }
};

/**
 * Save a run record
 */
export const saveRunRecord = async (record: RunRecord): Promise<void> => {
  try {
    const history = await getRunHistory(1000); // Get more to maintain history
    history.unshift(record); // Add to beginning
    // Keep only last 100 records
    const trimmed = history.slice(0, 100);
    await AsyncStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error("Error saving run record:", error);
    throw error;
  }
};

/**
 * Generate a unique ID for a run record
 */
export const generateRunRecordId = (): string => {
  return `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Seed built-in skills (Tier 1)
 * Creates 6-8 built-in skills with pipeline blocks
 */
export const seedBuiltInSkills = async (): Promise<void> => {
  try {
    const existingSkills = await getSkills();
    const builtInIds = [
      "skill_summarize",
      "skill_rewrite_tone",
      "skill_extract_tasks",
      "skill_reply_draft",
      "skill_notes_action",
      "skill_meeting_cleaner",
      "skill_scene_starter",
      "skill_rpg_dice",
    ];

    // Check if all built-in skills exist
    const existingBuiltIns = existingSkills.filter((s) =>
      builtInIds.includes(s.id)
    );
    if (existingBuiltIns.length === builtInIds.length) {
      return; // All built-ins already exist
    }

    const builtInSkills: Skill[] = [
      {
        id: "skill_summarize",
        name: "Summarize",
        description: "Create a concise summary with key points",
        category: "Text Processing",
        iconKey: "summarize",
        isPinned: true,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter text to summarize..." } },
          {
            type: "llm",
            config: {
              prompt: "Summarize the following text in a concise way, highlighting the key points:\n\n",
              maxTokens: 200,
            },
          },
          { type: "output", config: { format: "bullets" } },
        ],
        createdAt: Date.now() - 86400000 * 7,
      },
      {
        id: "skill_rewrite_tone",
        name: "Rewrite for Tone",
        description: "Rewrite text with a different tone or style",
        category: "Writing",
        iconKey: "edit",
        isPinned: true,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter text to rewrite..." } },
          {
            type: "llm",
            config: {
              prompt: "Rewrite the following text with a professional, friendly tone while keeping the meaning:\n\n",
              maxTokens: 300,
            },
          },
          { type: "output", config: { format: "plain" } },
        ],
        createdAt: Date.now() - 86400000 * 6,
      },
      {
        id: "skill_extract_tasks",
        name: "Extract Tasks",
        description: "Extract actionable tasks from text",
        category: "Productivity",
        iconKey: "checklist",
        isPinned: false,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter text with tasks..." } },
          {
            type: "llm",
            config: {
              prompt: "Extract all actionable tasks from the following text. List them clearly:\n\n",
              maxTokens: 250,
            },
          },
          { type: "codelib", config: { codelibId: "codelib_checklist_normalizer" } },
          { type: "output", config: { format: "checklist" } },
        ],
        createdAt: Date.now() - 86400000 * 5,
      },
      {
        id: "skill_reply_draft",
        name: "Reply Draft",
        description: "Draft a professional reply to a message",
        category: "Communication",
        iconKey: "reply",
        isPinned: true,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter the message to reply to..." } },
          {
            type: "llm",
            config: {
              prompt: "Draft a concise, professional reply to the following message:\n\n",
              maxTokens: 200,
            },
          },
          { type: "output", config: { format: "plain" } },
        ],
        createdAt: Date.now() - 86400000 * 4,
      },
      {
        id: "skill_notes_action",
        name: "Notes → Action Plan",
        description: "Convert meeting notes into an actionable plan",
        category: "Productivity",
        iconKey: "list",
        isPinned: false,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter meeting notes..." } },
          {
            type: "llm",
            config: {
              prompt: "Convert the following meeting notes into a clear action plan with tasks and owners:\n\n",
              maxTokens: 300,
            },
          },
          { type: "output", config: { format: "bullets" } },
        ],
        createdAt: Date.now() - 86400000 * 3,
      },
      {
        id: "skill_meeting_cleaner",
        name: "Meeting Notes Cleaner",
        description: "Clean and format messy meeting notes",
        category: "Productivity",
        iconKey: "cleaning-services",
        isPinned: false,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter messy meeting notes..." } },
          {
            type: "llm",
            config: {
              prompt: "Clean and format the following meeting notes, organizing them clearly:\n\n",
              maxTokens: 400,
            },
          },
          { type: "codelib", config: { codelibId: "codelib_markdown_cleanup" } },
          { type: "output", config: { format: "bullets" } },
        ],
        createdAt: Date.now() - 86400000 * 2,
      },
      {
        id: "skill_scene_starter",
        name: "Scene Starter",
        description: "Generate creative writing scene starters",
        category: "Creative",
        iconKey: "auto-stories",
        isPinned: false,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter a prompt or theme..." } },
          {
            type: "llm",
            config: {
              prompt: "Write a creative scene starter based on the following prompt:\n\n",
              maxTokens: 250,
            },
          },
          { type: "output", config: { format: "plain" } },
        ],
        createdAt: Date.now() - 86400000,
      },
      {
        id: "skill_rpg_dice",
        name: "RPG Dice + Narration",
        description: "Roll dice and generate narrative outcomes",
        category: "Creative",
        iconKey: "casino",
        isPinned: false,
        isBuiltIn: true,
        blocks: [
          { type: "input", config: { placeholder: "Enter action or scenario..." } },
          {
            type: "llm",
            config: {
              prompt: "Based on the following action, roll a d20 and narrate the outcome:\n\n",
              maxTokens: 200,
            },
          },
          { type: "codelib", config: { codelibId: "codelib_dice_roll_d20" } },
          { type: "output", config: { format: "plain" } },
        ],
        createdAt: Date.now(),
      },
    ];

    // Save all built-in skills
    for (const skill of builtInSkills) {
      const existing = existingSkills.find((s) => s.id === skill.id);
      if (!existing) {
        await saveSkill(skill);
      }
    }
  } catch (error) {
    console.error("Error seeding built-in skills:", error);
  }
};

