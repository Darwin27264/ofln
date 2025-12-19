import AsyncStorage from "@react-native-async-storage/async-storage";

const CODELIB_KEY = "@codelib";

export type CodeLibType = "formatter" | "extractor" | "validator" | "utility";

export type CodeLibContract = "text→text" | "text→checklist" | "text→json";

export interface CodeLibTransform {
  // Template-based transform config
  type: "template";
  config: {
    // Regex find/replace list
    regexReplacements?: Array<{
      pattern: string;
      replacement: string;
      flags?: string;
    }>;
    // Line operations
    lineOperations?: Array<"trim" | "dedupe" | "sort">;
    // Prefix/suffix wrappers
    prefix?: string;
    suffix?: string;
    // Dice roll config
    diceConfig?: {
      type: "d20" | "d6" | "custom";
      sides?: number;
    };
    // Length limits
    maxLength?: number;
    minLength?: number;
    // Other template options
    [key: string]: any;
  };
}

export interface CodeLibFunction {
  id: string;
  name: string;
  description: string;
  type: CodeLibType;
  contract: CodeLibContract;
  transform: CodeLibTransform;
  isBuiltIn: boolean;
  createdAt: number;
  lastUsed?: number;
}

/**
 * Get all CodeLib functions
 */
export const getCodeLibFunctions = async (): Promise<CodeLibFunction[]> => {
  try {
    const functionsJson = await AsyncStorage.getItem(CODELIB_KEY);
    if (functionsJson) {
      return JSON.parse(functionsJson);
    }
    return [];
  } catch (error) {
    console.error("Error loading CodeLib functions:", error);
    return [];
  }
};

/**
 * Save a CodeLib function
 */
export const saveCodeLibFunction = async (func: CodeLibFunction): Promise<void> => {
  try {
    const functions = await getCodeLibFunctions();
    const existingIndex = functions.findIndex((f) => f.id === func.id);
    if (existingIndex >= 0) {
      functions[existingIndex] = func;
    } else {
      functions.push(func);
    }
    await AsyncStorage.setItem(CODELIB_KEY, JSON.stringify(functions));
  } catch (error) {
    console.error("Error saving CodeLib function:", error);
    throw error;
  }
};

/**
 * Remove a CodeLib function (only custom functions)
 */
export const removeCodeLibFunction = async (functionId: string): Promise<void> => {
  try {
    const functions = await getCodeLibFunctions();
    const func = functions.find((f) => f.id === functionId);
    if (func && func.isBuiltIn) {
      throw new Error("Cannot delete built-in CodeLib functions");
    }
    const filtered = functions.filter((f) => f.id !== functionId);
    await AsyncStorage.setItem(CODELIB_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error("Error removing CodeLib function:", error);
    throw error;
  }
};

/**
 * Generate a unique ID for a CodeLib function
 */
export const generateCodeLibId = (): string => {
  return `codelib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Test a CodeLib function with sample input
 */
export const testCodeLibFunction = (
  func: CodeLibFunction,
  sampleInput: string
): { output: string; error?: string } => {
  try {
    if (func.transform.type !== "template") {
      return { output: "", error: "Only template transforms are supported" };
    }

    let result = sampleInput;
    const config = func.transform.config;

    // Apply regex replacements
    if (config.regexReplacements && config.regexReplacements.length > 0) {
      for (const replacement of config.regexReplacements) {
        try {
          const flags = replacement.flags || "g";
          const regex = new RegExp(replacement.pattern, flags);
          result = result.replace(regex, replacement.replacement);
        } catch (error) {
          return { output: "", error: `Invalid regex pattern: ${replacement.pattern}` };
        }
      }
    }

    // Apply line operations
    if (config.lineOperations && config.lineOperations.length > 0) {
      const lines = result.split("\n");
      let processedLines = [...lines];

      for (const op of config.lineOperations) {
        if (op === "trim") {
          processedLines = processedLines.map((line) => line.trim());
        } else if (op === "dedupe") {
          processedLines = Array.from(new Set(processedLines));
        } else if (op === "sort") {
          processedLines = processedLines.sort();
        }
      }

      result = processedLines.join("\n");
    }

    // Apply prefix/suffix
    if (config.prefix) {
      result = config.prefix + result;
    }
    if (config.suffix) {
      result = result + config.suffix;
    }

    // Apply length limits
    if (config.maxLength && result.length > config.maxLength) {
      result = result.substring(0, config.maxLength) + "...";
    }
    if (config.minLength && result.length < config.minLength) {
      result = result.padEnd(config.minLength, " ");
    }

    // Special handling for dice roll
    if (config.diceConfig) {
      const { type, sides } = config.diceConfig;
      const diceSides = sides || (type === "d20" ? 20 : type === "d6" ? 6 : 20);
      const roll = Math.floor(Math.random() * diceSides) + 1;
      result = `[Dice Roll: ${roll} on d${diceSides}]\n\n${result}`;
    }

    // Special handling for checklist normalizer
    if (func.id === "codelib_checklist_normalizer" || func.name.toLowerCase().includes("checklist")) {
      // Ensure lines start with "- [ ] " or "- [x] "
      const lines = result.split("\n");
      const normalized = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return line;
        // Already in checklist format
        if (trimmed.match(/^-\s*\[[\sxX]\]\s/)) {
          return line;
        }
        // Convert bullet points to checklist
        if (trimmed.startsWith("-")) {
          return line.replace(/^-\s*/, "- [ ] ");
        }
        // Convert numbered lists or plain text to checklist
        if (trimmed.match(/^\d+[\.\)]\s/)) {
          return line.replace(/^\d+[\.\)]\s*/, "- [ ] ");
        }
        // Convert plain text lines
        return `- [ ] ${trimmed}`;
      });
      result = normalized.join("\n");
    }

    return { output: result };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { output: "", error: errorMessage };
  }
};

/**
 * Seed built-in CodeLib functions
 */
export const seedBuiltInCodeLibFunctions = async (): Promise<void> => {
  try {
    const existingFunctions = await getCodeLibFunctions();
    const builtInIds = [
      "codelib_bullets_format",
      "codelib_title_bullets",
      "codelib_clamp_length",
      "codelib_markdown_cleanup",
      "codelib_dedupe_lines",
      "codelib_trim_whitespace",
      "codelib_slugify_title",
      "codelib_dice_roll_d20",
      "codelib_limit_output",
      "codelib_checklist_normalizer",
    ];

    const existingBuiltIns = existingFunctions.filter((f) =>
      builtInIds.includes(f.id)
    );
    if (existingBuiltIns.length === builtInIds.length) {
      return; // All built-ins already exist
    }

    const builtInFunctions: CodeLibFunction[] = [
      {
        id: "codelib_bullets_format",
        name: "Bullets Format",
        description: "Format text as bullet points",
        type: "formatter",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            lineOperations: ["trim"],
            prefix: "",
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 7,
      },
      {
        id: "codelib_title_bullets",
        name: "Title + Bullets",
        description: "Add a title and format as bullets",
        type: "formatter",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            lineOperations: ["trim"],
            prefix: "## Summary\n\n",
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 6,
      },
      {
        id: "codelib_clamp_length",
        name: "Clamp Length",
        description: "Limit text to a maximum length",
        type: "formatter",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            maxLength: 500,
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 5,
      },
      {
        id: "codelib_markdown_cleanup",
        name: "Markdown Cleanup",
        description: "Clean and normalize markdown formatting",
        type: "formatter",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            regexReplacements: [
              { pattern: "\\n{3,}", replacement: "\n\n", flags: "g" },
              { pattern: "^\\s+", replacement: "", flags: "gm" },
            ],
            lineOperations: ["trim"],
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 4,
      },
      {
        id: "codelib_dedupe_lines",
        name: "Dedupe Lines",
        description: "Remove duplicate lines",
        type: "utility",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            lineOperations: ["dedupe"],
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 3,
      },
      {
        id: "codelib_trim_whitespace",
        name: "Trim Whitespace",
        description: "Trim leading and trailing whitespace from lines",
        type: "utility",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            lineOperations: ["trim"],
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000 * 2,
      },
      {
        id: "codelib_slugify_title",
        name: "Slugify Title",
        description: "Convert text to URL-friendly slug",
        type: "utility",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            regexReplacements: [
              { pattern: "[^a-z0-9]+", replacement: "-", flags: "gi" },
              { pattern: "^-|-$", replacement: "", flags: "g" },
            ],
            lineOperations: ["trim"],
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000,
      },
      {
        id: "codelib_dice_roll_d20",
        name: "Dice Roll (d20)",
        description: "Roll a d20 die and prepend result",
        type: "utility",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            diceConfig: {
              type: "d20",
              sides: 20,
            },
          },
        },
        isBuiltIn: true,
        createdAt: Date.now() - 86400000,
      },
      {
        id: "codelib_limit_output",
        name: "Limit Output Length",
        description: "Truncate output to specified length",
        type: "utility",
        contract: "text→text",
        transform: {
          type: "template",
          config: {
            maxLength: 1000,
          },
        },
        isBuiltIn: true,
        createdAt: Date.now(),
      },
      {
        id: "codelib_checklist_normalizer",
        name: "Checklist Normalizer",
        description: "Ensure checklist format (- [ ] or - [x])",
        type: "validator",
        contract: "text→checklist",
        transform: {
          type: "template",
          config: {
            lineOperations: ["trim"],
          },
        },
        isBuiltIn: true,
        createdAt: Date.now(),
      },
    ];

    // Save all built-in functions
    for (const func of builtInFunctions) {
      const existing = existingFunctions.find((f) => f.id === func.id);
      if (!existing) {
        await saveCodeLibFunction(func);
      }
    }
  } catch (error) {
    console.error("Error seeding built-in CodeLib functions:", error);
  }
};

