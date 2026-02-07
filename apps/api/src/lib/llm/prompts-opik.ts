/**
 * Opik Prompt Library integration.
 * Always fetches prompts from Opik, falls back to local if fetch fails.
 */

import { Opik } from "opik";
import { env } from "../env.js";

// Prompt names as stored in Opik
export const PROMPT_NAMES = {
  CHAT: "kaizen-chat",
  CHAT_AGENT: "kaizen-chat-agent",
  TITLE_GENERATION: "kaizen-title-generation",
  FOCUS_ANALYSIS: "kaizen-focus-analysis",
  FOCUS_AGENT: "kaizen-focus-agent",
  TEXT_SUMMARIZATION: "kaizen-text-summarization",
  IMAGE_SUMMARIZATION: "kaizen-image-summarization",
  INDIVIDUAL_IMAGE: "kaizen-individual-image",
  QUIZ_GENERATION: "kaizen-quiz-generation",
} as const;

export type PromptName = (typeof PROMPT_NAMES)[keyof typeof PROMPT_NAMES];

let opikClient: Opik | null = null;

/**
 * Get the Opik client singleton
 */
function getOpikClient(): Opik | null {
  if (!env.opikApiKey) {
    return null;
  }

  if (!opikClient) {
    opikClient = new Opik({
      apiKey: env.opikApiKey,
      workspaceName: env.opikWorkspace,
      projectName: env.opikProjectName,
    });
  }

  return opikClient;
}

/**
 * Check if Opik prompt library is enabled
 */
export function isOpikPromptsEnabled(): boolean {
  return !!env.opikApiKey;
}

/**
 * Fetch a prompt from Opik's prompt library.
 * Always fetches fresh from Opik - no caching.
 * Returns null if Opik is not enabled or fetch fails.
 */
export async function getPromptFromOpik(name: PromptName): Promise<string | null> {
  const client = getOpikClient();
  if (!client) {
    return null;
  }

  try {
    const prompt = await client.getPrompt({ name });
    return prompt.text;
  } catch (error) {
    console.warn(`[Opik] Failed to fetch prompt ${name}:`, error);
    return null;
  }
}

/**
 * Create or update a prompt in Opik's library.
 * Used for initial sync of prompts.
 */
export async function syncPromptToOpik(
  name: PromptName,
  content: string,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  const client = getOpikClient();
  if (!client) {
    console.warn("[Opik] Cannot sync prompt - Opik not configured");
    return false;
  }

  try {
    await client.createPrompt({
      name,
      prompt: content,
      metadata: {
        ...metadata,
        source: "kaizen-api",
        syncedAt: new Date().toISOString(),
      },
    });

    console.log(`[Opik] Synced prompt: ${name}`);
    return true;
  } catch (error) {
    console.error(`[Opik] Failed to sync prompt ${name}:`, error);
    return false;
  }
}

/**
 * Sync all prompts from local definitions to Opik.
 */
export async function syncAllPromptsToOpik(
  prompts: Record<PromptName, string>
): Promise<{ synced: number; failed: number }> {
  const results = { synced: 0, failed: 0 };

  for (const [name, content] of Object.entries(prompts)) {
    const success = await syncPromptToOpik(name as PromptName, content);
    if (success) {
      results.synced++;
    } else {
      results.failed++;
    }
  }

  console.log(`[Opik] Prompt sync complete: ${results.synced} synced, ${results.failed} failed`);
  return results;
}
