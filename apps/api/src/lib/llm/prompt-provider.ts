/**
 * Unified prompt provider with Opik integration and local fallback.
 * This is the main interface for getting prompts throughout the application.
 */

import {
  getPromptFromOpik,
  isOpikPromptsEnabled,
  PROMPT_NAMES,
  type PromptName,
  type OpikPromptResult,
} from "./prompts-opik.js";
import * as LocalPrompts from "./system-prompts.js";

// Map Opik prompt names to local prompt constants
const LOCAL_PROMPT_MAP: Record<PromptName, string> = {
  [PROMPT_NAMES.CHAT]: LocalPrompts.CHAT_SYSTEM_PROMPT,
  [PROMPT_NAMES.CHAT_AGENT]: LocalPrompts.CHAT_AGENT_SYSTEM_PROMPT,
  [PROMPT_NAMES.TITLE_GENERATION]: LocalPrompts.TITLE_GENERATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.FOCUS_ANALYSIS]: LocalPrompts.FOCUS_ANALYSIS_SYSTEM_PROMPT,
  [PROMPT_NAMES.FOCUS_AGENT]: LocalPrompts.FOCUS_AGENT_SYSTEM_PROMPT,
  [PROMPT_NAMES.TEXT_SUMMARIZATION]:
    LocalPrompts.TEXT_SUMMARIZATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.IMAGE_SUMMARIZATION]:
    LocalPrompts.IMAGE_SUMMARIZATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.INDIVIDUAL_IMAGE]: LocalPrompts.INDIVIDUAL_IMAGE_SYSTEM_PROMPT,
  [PROMPT_NAMES.QUIZ_GENERATION]: LocalPrompts.QUIZ_GENERATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.FOCUS_GUARDIAN]: LocalPrompts.FOCUS_GUARDIAN_SYSTEM_PROMPT,
  [PROMPT_NAMES.MENTAL_HEALTH_AGENT]:
    LocalPrompts.MENTAL_HEALTH_AGENT_SYSTEM_PROMPT,
};

export interface PromptWithMetadata {
  content: string;
  /** Prompt name in Opik */
  promptName: string;
  /** Prompt version/commit hash from Opik (undefined if using local) */
  promptVersion?: string;
  /** Whether this prompt was fetched from Opik or is local fallback */
  source: "opik" | "local";
}

/**
 * Get a prompt by name with metadata for trace linking.
 * Tries Opik first if enabled, falls back to local prompts.
 */
export async function getPromptWithMetadata(
  name: PromptName,
): Promise<PromptWithMetadata> {
  // Try Opik first if enabled
  if (isOpikPromptsEnabled()) {
    const opikPrompt = await getPromptFromOpik(name);
    if (opikPrompt && opikPrompt.content) {
      return {
        content: opikPrompt.content,
        promptName: opikPrompt.name,
        promptVersion: opikPrompt.commit,
        source: "opik",
      };
    }
    // Opik enabled but fetch failed - fall through to local
    console.log(`[Prompts] Using local fallback for ${name}`);
  }

  // Fallback to local prompt
  const localContent = LOCAL_PROMPT_MAP[name];
  if (!localContent) {
    throw new Error(`No prompt found for ${name}`);
  }

  return {
    content: localContent,
    promptName: name,
    promptVersion: undefined,
    source: "local",
  };
}

/**
 * Get a prompt by name (content only, for simple use cases).
 * Tries Opik first if enabled, falls back to local prompts.
 */
export async function getPrompt(name: PromptName): Promise<string> {
  const result = await getPromptWithMetadata(name);
  return result.content;
}

/**
 * Get all prompts as a record (for syncing to Opik).
 */
export function getAllLocalPrompts(): Record<PromptName, string> {
  return LOCAL_PROMPT_MAP;
}

// Re-export prompt names for convenience
export { PROMPT_NAMES } from "./prompts-opik.js";
export type { PromptName } from "./prompts-opik.js";
