import { generateText, stepCountIs } from "ai";
import type { UserSettings } from "@prisma/client";
import { db } from "../db.js";
import { events } from "../events.js";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import { getTelemetrySettings, FOCUS_AGENT_SYSTEM_PROMPT } from "../llm/index.js";
import { createFocusTools } from "./tools.js";
import { formatAttentionData, hasMinimalContent, extractFocusSettings } from "./utils.js";
import { formatAttentionForPrompt } from "./prompts.js";
import type { RawAttentionData } from "../attention.js";

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
    const provider = createAgentProvider(settings);
    const modelId = getAgentModelId(settings);
    const tools = createFocusTools(userId, focusSettings.focusInactivityThresholdMs);

    // Format attention data for the prompt
    const formattedItems = formatAttentionData(attentionData);
    const formattedAttention = formatAttentionForPrompt(formattedItems);

    // Get Opik telemetry settings
    const telemetry = getTelemetrySettings({ name: "focus-agent", userId });

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
