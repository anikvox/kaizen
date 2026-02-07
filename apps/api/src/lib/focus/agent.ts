import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { UserSettings } from "@prisma/client";
import { db } from "../db.js";
import { events } from "../events.js";
import { getTelemetrySettings } from "../telemetry.js";
import { createFocusTools } from "./tools.js";
import { formatAttentionData, hasMinimalContent, extractFocusSettings } from "./utils.js";
import { formatAttentionForPrompt } from "./prompts.js";
import type { RawAttentionData } from "../attention.js";
import { decryptApiKey } from "../llm/encryption.js";
import { SYSTEM_DEFAULT_MODEL } from "../llm/models.js";
import { env } from "../env.js";

/**
 * System prompt for the focus clustering agent.
 * Instructs the LLM how to manage multiple concurrent focuses.
 */
const FOCUS_AGENT_SYSTEM_PROMPT = `You are a focus tracking agent that manages multiple concurrent focus sessions for a user.

Your job is to analyze the user's recent browsing attention data and manage their focus sessions appropriately.

## Key Responsibilities:

1. **Context Clustering**: Group related attention into appropriate focus sessions. A user can have multiple active focuses simultaneously (e.g., "React Development" and "Trip Planning").

2. **Focus Management**:
   - Create new focuses when attention clearly indicates a new topic not covered by existing focuses
   - Update existing focuses when attention relates to them (add keywords)
   - Merge focuses that are too similar (e.g., "JavaScript Basics" and "JavaScript Tutorial" should be merged)
   - End focuses that have had no related activity recently
   - Resume recently ended focuses if new attention matches them

3. **Decision Guidelines**:
   - Be conservative about creating new focuses - prefer updating existing ones if there's any relation
   - Merge focuses with overlapping topics into one coherent focus
   - Keywords help track the evolution of a focus over time
   - Focus items should be 2-3 descriptive words (e.g., "Machine Learning", "Home Renovation", "Python APIs")

## Process:
1. First, call get_active_focuses to see current active focuses
2. Also call get_resumable_focuses to see recently ended focuses that can be resumed
3. Analyze the attention data provided
4. Make decisions using the tools:
   - update_focus: If attention relates to an existing focus
   - resume_focus: If attention matches a recently ended focus
   - create_focus: If attention is about a genuinely new topic
   - merge_focuses: If you notice two similar focuses
   - end_focus: Only if explicitly needed (inactivity is handled separately)

Always use tools to make changes. Do not just describe what you would do.`;

/**
 * Create an LLM provider instance for Vercel AI SDK based on user settings.
 */
function createAIProvider(settings: UserSettings | null) {
  // Check user's configured provider first
  if (settings?.llmProvider) {
    const providerType = settings.llmProvider;

    switch (providerType) {
      case "gemini": {
        const apiKey = decryptApiKey(settings.geminiApiKeyEncrypted);
        if (apiKey) {
          return createGoogleGenerativeAI({ apiKey });
        }
        break;
      }
      case "anthropic": {
        const apiKey = decryptApiKey(settings.anthropicApiKeyEncrypted);
        if (apiKey) {
          return createAnthropic({ apiKey });
        }
        break;
      }
      case "openai": {
        const apiKey = decryptApiKey(settings.openaiApiKeyEncrypted);
        if (apiKey) {
          return createOpenAI({ apiKey });
        }
        break;
      }
    }
  }

  // Fall back to system Gemini
  if (!env.geminiApiKey) {
    throw new Error("No LLM provider available");
  }
  return createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
}

/**
 * Get the model ID for the provider
 */
function getModelId(settings: UserSettings | null): string {
  if (settings?.llmModel) {
    return settings.llmModel;
  }

  if (settings?.llmProvider) {
    switch (settings.llmProvider) {
      case "gemini":
        return "gemini-2.0-flash";
      case "anthropic":
        return "claude-3-5-haiku-latest";
      case "openai":
        return "gpt-4o-mini";
    }
  }

  return SYSTEM_DEFAULT_MODEL;
}

export interface FocusAgentResult {
  success: boolean;
  focusesCreated: number;
  focusesUpdated: number;
  focusesMerged: number;
  focusesEnded: number;
  focusesResumed: number;
  error?: string;
}

/**
 * Run the focus clustering agent on attention data.
 * Uses Vercel AI SDK's tool calling to manage multiple concurrent focuses.
 */
export async function runFocusAgent(
  userId: string,
  attentionData: RawAttentionData,
  settings: UserSettings | null
): Promise<FocusAgentResult> {
  const result: FocusAgentResult = {
    success: false,
    focusesCreated: 0,
    focusesUpdated: 0,
    focusesMerged: 0,
    focusesEnded: 0,
    focusesResumed: 0,
  };

  // Check if there's enough data to process
  if (!hasMinimalContent(attentionData)) {
    result.success = true; // Not an error, just nothing to process
    return result;
  }

  const focusSettings = extractFocusSettings(settings);

  try {
    // Create the AI provider and tools
    const provider = createAIProvider(settings);
    const modelId = getModelId(settings);
    const tools = createFocusTools(userId, focusSettings.focusInactivityThresholdMs);

    // Format attention data for the prompt
    const formattedItems = formatAttentionData(attentionData);
    const formattedAttention = formatAttentionForPrompt(formattedItems);

    // Get Opik telemetry settings
    const telemetry = await getTelemetrySettings("focus-agent", { userId });

    // Run the agent with tool calling
    const { steps } = await generateText({
      model: provider(modelId),
      system: FOCUS_AGENT_SYSTEM_PROMPT,
      prompt: `Here is the user's recent attention data. Analyze it and manage their focus sessions appropriately using the available tools.

ATTENTION DATA:
---
${formattedAttention}
---

Remember to:
1. First check existing active and resumable focuses
2. Then decide whether to update existing, resume old, or create new focuses
3. Merge any similar focuses you notice
4. Use the tools to make changes, don't just describe them`,
      tools,
      stopWhen: stepCountIs(10), // Allow up to 10 tool call steps
      experimental_telemetry: telemetry as any,
    });

    // Count the operations from tool calls
    for (const step of steps) {
      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          switch (toolCall.toolName) {
            case "create_focus":
              result.focusesCreated++;
              break;
            case "update_focus":
              result.focusesUpdated++;
              break;
            case "merge_focuses":
              result.focusesMerged++;
              break;
            case "end_focus":
              result.focusesEnded++;
              break;
            case "resume_focus":
              result.focusesResumed++;
              break;
          }
        }
      }
    }

    result.success = true;
    return result;
  } catch (error) {
    console.error("[FocusAgent] Error running agent:", error);
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  }
}

/**
 * Check for inactive focuses and end them.
 * This runs separately from the agent to ensure focuses are ended even when there's no new attention.
 */
export async function checkAndEndInactiveFocuses(
  userId: string,
  inactivityThresholdMs: number
): Promise<number> {
  const now = new Date();
  const threshold = new Date(now.getTime() - inactivityThresholdMs);

  // Find focuses that haven't had activity within the threshold
  const inactiveFocuses = await db.focus.findMany({
    where: {
      userId,
      isActive: true,
      lastActivityAt: {
        lt: threshold,
      },
    },
  });

  if (inactiveFocuses.length === 0) {
    return 0;
  }

  // End all inactive focuses
  await db.focus.updateMany({
    where: {
      id: {
        in: inactiveFocuses.map((f) => f.id),
      },
    },
    data: {
      isActive: false,
      endedAt: now,
    },
  });

  // Emit events for each ended focus
  for (const focus of inactiveFocuses) {
    events.emitFocusChanged({
      userId,
      focus: {
        id: focus.id,
        item: focus.item,
        keywords: focus.keywords,
        isActive: false,
        startedAt: focus.startedAt.toISOString(),
        endedAt: now.toISOString(),
        lastActivityAt: focus.lastActivityAt.toISOString(),
      },
      changeType: "ended",
    });
  }

  console.log(`[Focus] Ended ${inactiveFocuses.length} inactive focuses for user ${userId}`);
  return inactiveFocuses.length;
}
