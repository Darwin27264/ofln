/**
 * Skill Execution Service
 * 
 * Executes Skills by running blocks in pipeline order:
 * Input → LLM → CodeLib → Output
 * 
 * Handles:
 * - LLM inference via llama.rn
 * - CodeLib deterministic transforms
 * - Speed Mode optimizations
 * - Error handling and cancellation
 * - Performance metrics tracking
 */

import { Skill, SkillBlock } from "./skillService";
import { CodeLibFunction, getCodeLibFunctions, testCodeLibFunction } from "./codelibService";
import { ModelSettings, getModelSettings, DEFAULT_SETTINGS } from "./modelSettingsService";
import { Persona, buildPersonaSystemPrompt } from "./personaService";

export interface SkillExecutionResult {
  output: string;
  duration: number;
  tokenCount?: number;
  tokensPerSecond?: number;
  error?: string;
}

export interface SkillExecutionOptions {
  context: any; // Llama context
  skill: Skill;
  input: string;
  modelFileName: string;
  persona?: Persona | null;
  speedMode?: boolean;
  onProgress?: (output: string) => void; // For streaming updates
  cancellationToken?: { cancelled: boolean }; // For cancellation support
}

/**
 * Execute a single LLM block
 */
async function executeLLMBlock(
  block: SkillBlock,
  input: string,
  context: any,
  modelSettings: ModelSettings,
  persona: Persona | null | undefined,
  speedMode: boolean,
  onProgress?: (output: string) => void,
  cancellationToken?: { cancelled: boolean }
): Promise<string> {
  if (!context) {
    throw new Error("Model context not available");
  }

  // Build prompt from block config
  const blockPrompt = block.config.prompt || "";
  // If prompt exists, combine with input; otherwise use input directly
  const fullPrompt = blockPrompt 
    ? (blockPrompt.endsWith("\n") || blockPrompt.endsWith("\n\n") 
        ? `${blockPrompt}${input}` 
        : `${blockPrompt}\n\n${input}`)
    : input;

  // Adjust settings for Speed Mode
  const maxTokens = speedMode
    ? Math.min(block.config.maxTokens || 100, 150) // Limit to 150 tokens in speed mode
    : block.config.maxTokens || modelSettings.n_predict;

  // Build system prompt with persona
  const systemPrompt = buildPersonaSystemPrompt(persona, modelSettings.systemPrompt);

  // Prepare messages for completion
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: fullPrompt },
  ];

  const stopWords = [
    "</s>",
    "<|end|>",
    "user:",
    "assistant:",
    "<|im_end|>",
    "<|eot_id|>",
    "<|end▁of▁sentence|>",
    "<|end_of_text|>",
    "<｜end▁of▁sentence｜>",
    "<end_of_turn>",
    "<eos>",
    "</eos>",
  ];

  let output = "";
  let isCancelled = false;

  try {
    const result = await context.completion(
      {
        messages,
        n_predict: maxTokens,
        temperature: speedMode ? 0.3 : block.config.temperature || modelSettings.temperature,
        top_p: modelSettings.top_p,
        top_k: modelSettings.top_k,
        repeat_penalty: modelSettings.repeat_penalty,
        stop: stopWords,
      },
      (data: { token: string }) => {
        // Check for cancellation
        if (cancellationToken?.cancelled) {
          isCancelled = true;
          return;
        }

        const token = data.token;
        output += token;

        // Remove thinking blocks and end tokens for cleaner output (matching llamaService format)
        const visibleContent = output
          .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
          .replace(/<think>.*$/gs, "")
          .replace(/<end_of_turn>/g, "") // Remove end of turn tokens
          .replace(/<\/?eos>/g, "") // Remove eos tokens (both <eos> and </eos>)
          .trim();

        // Call progress callback if provided
        if (onProgress) {
          onProgress(visibleContent);
        }
      }
    );

    // Handle cancellation
    if (isCancelled || cancellationToken?.cancelled) {
      throw new Error("Generation cancelled");
    }

    // Clean up final output (matching llamaService format)
    output = output
      .replace(/<think>.*?<\/redacted_reasoning>/gs, "")
      .replace(/<think>.*$/gs, "")
      .replace(/<end_of_turn>/g, "") // Remove end of turn tokens
      .replace(/<\/?eos>/g, "") // Remove eos tokens (both <eos> and </eos>)
      .trim();

    return output;
  } catch (error) {
    if (isCancelled || cancellationToken?.cancelled) {
      throw new Error("Generation cancelled");
    }
    throw error;
  }
}

/**
 * Execute a CodeLib block
 */
async function executeCodeLibBlock(
  block: SkillBlock,
  input: string
): Promise<string> {
  if (!block.config.codelibId) {
    throw new Error("CodeLib block missing codelibId");
  }

  // Get CodeLib function
  const functions = await getCodeLibFunctions();
  const codeLibFunction = functions.find((f) => f.id === block.config.codelibId);

  if (!codeLibFunction) {
    throw new Error(`CodeLib function not found: ${block.config.codelibId}`);
  }

  // Execute transform
  const result = testCodeLibFunction(codeLibFunction, input);
  if (result.error) {
    throw new Error(`CodeLib execution error: ${result.error}`);
  }

  return result.output;
}

/**
 * Execute a complete Skill pipeline
 */
export async function executeSkill(
  options: SkillExecutionOptions
): Promise<SkillExecutionResult> {
  const {
    context,
    skill,
    input,
    modelFileName,
    persona,
    speedMode = false,
    onProgress,
    cancellationToken,
  } = options;

  const startTime = Date.now();
  let currentOutput = input;
  let tokenCount = 0;
  let tokensPerSecond = 0;

  try {
    // Validate input
    if (!input || !input.trim()) {
      throw new Error("Input is required");
    }

    // Validate context
    if (!context) {
      throw new Error("Model not loaded");
    }

    // Get model settings
    let modelSettings: ModelSettings;
    try {
      modelSettings = await getModelSettings(modelFileName);
    } catch (error) {
      console.warn("Error loading model settings, using defaults:", error);
      modelSettings = DEFAULT_SETTINGS;
    }

    // Execute blocks in order
    for (let i = 0; i < skill.blocks.length; i++) {
      const block = skill.blocks[i];

      // Check for cancellation
      if (cancellationToken?.cancelled) {
        throw new Error("Execution cancelled");
      }

      switch (block.type) {
        case "input":
          // Input block just passes through (already have input)
          currentOutput = input;
          break;

        case "llm":
          // Execute LLM block
          try {
            // Use block prompt if available, otherwise build from skill name/description
            let blockPrompt = block.config.prompt;
            if (!blockPrompt || !blockPrompt.trim()) {
              // Build prompt based on skill if block doesn't have one
              blockPrompt = buildSkillPrompt(skill, currentOutput);
            }
            
            const llmBlockWithPrompt: SkillBlock = {
              ...block,
              config: {
                ...block.config,
                prompt: blockPrompt,
              },
            };
            
            const llmOutput = await executeLLMBlock(
              llmBlockWithPrompt,
              currentOutput,
              context,
              modelSettings,
              persona,
              speedMode,
              onProgress,
              cancellationToken
            );
            currentOutput = llmOutput;

            // Estimate token count (rough approximation)
            tokenCount = currentOutput.split(/\s+/).filter((t) => t.length > 0).length;
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`LLM block execution failed: ${errorMessage}`);
          }
          break;

        case "codelib":
          // Execute CodeLib block
          try {
            currentOutput = await executeCodeLibBlock(block, currentOutput);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Unknown error";
            throw new Error(`CodeLib block execution failed: ${errorMessage}`);
          }
          break;

        case "output":
          // Output block - apply format if specified
          if (block.config.format === "bullets") {
            // Ensure bullet format
            const lines = currentOutput.split("\n").filter((l) => l.trim());
            currentOutput = lines.map((line) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                return trimmed;
              }
              return `- ${trimmed}`;
            }).join("\n");
          } else if (block.config.format === "checklist") {
            // Ensure checklist format
            const lines = currentOutput.split("\n").filter((l) => l.trim());
            currentOutput = lines.map((line) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("- [ ]") || trimmed.startsWith("- [x]") || trimmed.startsWith("- [X]")) {
                return trimmed;
              }
              if (trimmed.startsWith("-")) {
                return trimmed.replace(/^-\s*/, "- [ ] ");
              }
              return `- [ ] ${trimmed}`;
            }).join("\n");
          }
          // "plain" and "json" formats don't need transformation
          break;

        default:
          console.warn(`Unknown block type: ${(block as any).type}`);
          break;
      }
    }

    // Calculate metrics
    const duration = Date.now() - startTime;
    if (duration > 0 && tokenCount > 0) {
      tokensPerSecond = (tokenCount / (duration / 1000)); // tokens per second
    }

    return {
      output: currentOutput,
      duration,
      tokenCount,
      tokensPerSecond,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    return {
      output: currentOutput, // Return partial output if available
      duration,
      tokenCount,
      tokensPerSecond,
      error: errorMessage,
    };
  }
}

/**
 * Build prompt template for a skill's LLM block
 * This can be enhanced to support variable substitution
 */
export function buildSkillPrompt(
  skill: Skill,
  input: string,
  blockPrompt?: string
): string {
  // Use block-specific prompt if provided, otherwise use a generic one
  if (blockPrompt) {
    return blockPrompt.includes("{input}") || blockPrompt.includes("{{input}}")
      ? blockPrompt.replace(/\{input\}|\{\{input\}\}/g, input)
      : `${blockPrompt}\n\n${input}`;
  }

  // Default prompt based on skill name/description
  const skillName = skill.name.toLowerCase();
  if (skillName.includes("summar")) {
    return `Summarize the following text in a concise way, highlighting the key points:\n\n${input}`;
  } else if (skillName.includes("rewrite") || skillName.includes("tone")) {
    return `Rewrite the following text with a professional, friendly tone while keeping the meaning:\n\n${input}`;
  } else if (skillName.includes("task") || skillName.includes("extract")) {
    return `Extract all actionable tasks from the following text. List them clearly:\n\n${input}`;
  } else if (skillName.includes("reply") || skillName.includes("draft")) {
    return `Draft a concise, professional reply to the following message:\n\n${input}`;
  } else if (skillName.includes("action") || skillName.includes("plan")) {
    return `Convert the following notes into a clear action plan with tasks:\n\n${input}`;
  } else if (skillName.includes("clean") || skillName.includes("format")) {
    return `Clean and format the following text, organizing it clearly:\n\n${input}`;
  }

  // Generic fallback
  return input;
}

