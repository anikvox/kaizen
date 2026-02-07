import { z } from "zod";
import { tool } from "ai";
import { getAttentionData, serializeAttentionForLLM } from "../attention.js";

// Time range options in milliseconds
const TIME_RANGE_MS: Record<string, number> = {
  "30m": 30 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "all": 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
};

/**
 * Create chat tools for the agentic chat.
 * These tools allow the LLM to perform actions during conversation.
 */
export function createChatTools(userId: string) {
  return {
    /**
     * Get the current UTC time
     */
    get_current_utc_time: tool({
      description: "Get the current time in UTC. Use this when the user asks about the current time, date, or needs timestamp information.",
      parameters: z.object({
        format: z.enum(["iso", "human", "unix"]).optional().describe(
          "Output format: 'iso' for ISO 8601 (default), 'human' for human-readable, 'unix' for Unix timestamp"
        ),
      }),
      execute: async ({ format = "iso" }) => {
        const now = new Date();

        switch (format) {
          case "iso":
            return {
              time: now.toISOString(),
              format: "ISO 8601",
            };
          case "human":
            return {
              time: now.toUTCString(),
              format: "Human readable UTC",
            };
          case "unix":
            return {
              time: Math.floor(now.getTime() / 1000),
              format: "Unix timestamp (seconds)",
            };
          default:
            return {
              time: now.toISOString(),
              format: "ISO 8601",
            };
        }
      },
    }),

    /**
     * Get user's recent browsing attention data
     */
    get_user_attention_data: tool({
      description: "Get the user's recent browsing activity and attention data. Use this when the user asks about what they were reading, watching, browsing, or when you need context about their recent online activity. This includes websites visited, text read, images viewed, videos watched, etc.",
      parameters: z.object({
        timeRange: z.enum(["30m", "2h", "1d", "all"]).optional().describe(
          "Time range for attention data: '30m' for last 30 minutes, '2h' for last 2 hours (default), '1d' for last 24 hours, 'all' for all available data"
        ),
      }),
      execute: async ({ timeRange = "2h" }) => {
        try {
          const now = new Date();
          const rangeMs = TIME_RANGE_MS[timeRange] || TIME_RANGE_MS["2h"];
          const from = new Date(now.getTime() - rangeMs);

          const attentionData = await getAttentionData(userId, { from, to: now });

          if (attentionData.pages.length === 0) {
            return {
              found: false,
              message: `No browsing activity found in the last ${timeRange}.`,
              timeRange,
            };
          }

          const serialized = serializeAttentionForLLM(attentionData);

          return {
            found: true,
            timeRange,
            data: serialized,
            summary: `Found ${attentionData.pages.length} pages visited in the last ${timeRange}.`,
          };
        } catch (error) {
          return {
            found: false,
            error: error instanceof Error ? error.message : "Failed to fetch attention data",
            timeRange,
          };
        }
      },
    }),
  };
}

export type ChatTools = ReturnType<typeof createChatTools>;
