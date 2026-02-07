/**
 * Unified prompt provider with Opik integration and local fallback.
 * This is the main interface for getting prompts throughout the application.
 */

import { getPromptFromOpik, isOpikPromptsEnabled, PROMPT_NAMES, type PromptName } from "./prompts-opik.js";
import * as LocalPrompts from "./system-prompts.js";

// Map Opik prompt names to local prompt constants
const LOCAL_PROMPT_MAP: Record<PromptName, string> = {
  [PROMPT_NAMES.CHAT]: LocalPrompts.CHAT_SYSTEM_PROMPT,
  [PROMPT_NAMES.CHAT_AGENT]: LocalPrompts.CHAT_AGENT_SYSTEM_PROMPT,
  [PROMPT_NAMES.TITLE_GENERATION]: LocalPrompts.TITLE_GENERATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.FOCUS_ANALYSIS]: LocalPrompts.FOCUS_ANALYSIS_SYSTEM_PROMPT,
  [PROMPT_NAMES.FOCUS_AGENT]: LocalPrompts.FOCUS_AGENT_SYSTEM_PROMPT,
  [PROMPT_NAMES.TEXT_SUMMARIZATION]: LocalPrompts.TEXT_SUMMARIZATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.IMAGE_SUMMARIZATION]: LocalPrompts.IMAGE_SUMMARIZATION_SYSTEM_PROMPT,
  [PROMPT_NAMES.INDIVIDUAL_IMAGE]: LocalPrompts.INDIVIDUAL_IMAGE_SYSTEM_PROMPT,
  [PROMPT_NAMES.QUIZ_GENERATION]: LocalPrompts.QUIZ_GENERATION_SYSTEM_PROMPT,
};

/**
 * Get a prompt by name.
 * Tries Opik first if enabled, falls back to local prompts.
 */
export async function getPrompt(name: PromptName): Promise<string> {
  // Try Opik first if enabled
  if (isOpikPromptsEnabled()) {
    const opikPrompt = await getPromptFromOpik(name);
    if (opikPrompt) {
      return opikPrompt;
    }
  }

  // Fallback to local prompt
  return LOCAL_PROMPT_MAP[name];
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
