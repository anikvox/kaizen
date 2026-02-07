import { generateText, stepCountIs } from "ai";
import type { UserSettings } from "@prisma/client";
import { db } from "../db.js";
import { events } from "../events.js";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import { startTrace, getPromptWithMetadata, PROMPT_NAMES } from "../llm/index.js";
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
  // Details for tracing
  focusDetails?: {
    created?: Array<{ item: string; keywords: string[] }>;
    updated?: Array<{ id: string; item: string }>;
    merged?: Array<{ sourceId: string; targetId: string }>;
    ended?: Array<{ id: string; item: string }>;
    resumed?: Array<{ id: string; item: string }>;
  };
}

/**
 * Run the focus clustering agent on attention data.
 * Uses Vercel AI SDK's tool calling to manage multiple concurrent focuses.
 * @param userId - The user's ID
 * @param attentionData - The raw attention data to process
 * @param settings - User settings for LLM provider
 * @param earliestAttentionTime - The earliest timestamp from the attention data (used for focus start times)
 * @param latestAttentionTime - The latest timestamp from the attention data (used for lastActivityAt)
 */
export async function runFocusAgent(
  userId: string,
  attentionData: RawAttentionData,
  settings: UserSettings | null,
  earliestAttentionTime?: Date,
  latestAttentionTime?: Date
): Promise<FocusAgentResult> {
  const result: FocusAgentResult = {
    success: false,
    focusesCreated: 0,
    focusesUpdated: 0,
    focusesMerged: 0,
    focusesEnded: 0,
    focusesResumed: 0,
    focusDetails: {
      created: [],
      updated: [],
      merged: [],
      ended: [],
      resumed: [],
    },
  };

  // Check if there's enough data to process
  if (!hasMinimalContent(attentionData)) {
    result.success = true; // Not an error, just nothing to process
    return result;
  }

  const focusSettings = extractFocusSettings(settings);

  // Fetch prompt from Opik (with local fallback)
  const promptData = await getPromptWithMetadata(PROMPT_NAMES.FOCUS_AGENT);

  // Format attention data for the prompt
  const formattedItems = formatAttentionData(attentionData);
  const formattedAttention = formatAttentionForPrompt(formattedItems);

  // Start trace for this agent run (don't include userId for privacy)
  const trace = startTrace({
    name: "focus-agent",
    input: {
      pageCount: attentionData.pages?.length || 0,
      attention: formattedAttention, // Include the actual attention data
      attentionItems: formattedItems.map((item) => ({
        title: item.title,
        url: item.url,
        focusType: item.focusType,
      })),
    },
    metadata: {
      promptName: promptData.promptName,
      promptVersion: promptData.promptVersion,
      promptSource: promptData.source,
    },
  });

  try {
    // Create the AI provider and tools
    const provider = createAgentProvider(settings);
    const modelId = getAgentModelId(settings);
    const tools = createFocusTools(userId, focusSettings.focusInactivityThresholdMs, earliestAttentionTime, latestAttentionTime);

    // Create span for the LLM call
    const llmSpan = trace?.span({
      name: "generateText",
      type: "llm",
      input: {
        model: modelId,
        attentionLength: formattedAttention.length,
      },
    });

    // Run the agent with tool calling
    const { steps } = await generateText({
      model: provider(modelId),
      system: promptData.content,
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
      stopWhen: stepCountIs(10),
    });

    llmSpan?.end({ stepCount: steps.length });

    // Count the operations from tool calls and capture focus details
    for (const step of steps) {
      if (step.toolCalls) {
        for (const toolCall of step.toolCalls) {
          // Find the corresponding tool result
          const toolResult = (step.toolResults as any)?.find((r: any) => r.toolCallId === toolCall.toolCallId)?.result;

          // Create a span for each tool call
          const toolSpan = trace?.span({
            name: `tool:${toolCall.toolName}`,
            type: "tool",
            input: { args: toolCall.args },
          });

          switch (toolCall.toolName) {
            case "create_focus":
              result.focusesCreated++;
              if (toolCall.args && toolResult?.focus) {
                result.focusDetails?.created?.push({
                  item: toolResult.focus.item || toolCall.args.item,
                  keywords: toolResult.focus.keywords || toolCall.args.keywords,
                });
              }
              break;
            case "update_focus":
              result.focusesUpdated++;
              if (toolCall.args && toolResult?.focus) {
                result.focusDetails?.updated?.push({
                  id: toolResult.focus.id || toolCall.args.focusId,
                  item: toolResult.focus.item,
                });
              }
              break;
            case "merge_focuses":
              result.focusesMerged++;
              if (toolCall.args) {
                result.focusDetails?.merged?.push({
                  sourceId: toolCall.args.sourceFocusId,
                  targetId: toolCall.args.targetFocusId,
                });
              }
              break;
            case "end_focus":
              result.focusesEnded++;
              if (toolCall.args && toolResult?.focus) {
                result.focusDetails?.ended?.push({
                  id: toolCall.args.focusId,
                  item: toolResult.focus.item,
                });
              }
              break;
            case "resume_focus":
              result.focusesResumed++;
              if (toolCall.args && toolResult?.focus) {
                result.focusDetails?.resumed?.push({
                  id: toolCall.args.focusId,
                  item: toolResult.focus.item,
                });
              }
              break;
          }

          toolSpan?.end({ toolName: toolCall.toolName, result: toolResult });
        }
      }
    }

    result.success = true;

    // End trace with output
    await trace?.end({
      success: true,
      ...result,
    });

    return result;
  } catch (error) {
    console.error("[FocusAgent] Error running agent:", error);
    result.error = error instanceof Error ? error.message : "Unknown error";

    // End trace with error
    await trace?.end({
      success: false,
      error: result.error,
    });

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
