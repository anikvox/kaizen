import { z } from "zod";
import { db } from "../db.js";
import { emitFocusChange } from "./utils.js";

/**
 * Create focus management tools for the agent.
 * These tools allow the LLM agent to manage multiple concurrent focuses.
 */
export function createFocusTools(userId: string, inactivityThresholdMs: number) {
  return {
    /**
     * Get all active focuses for the user
     */
    get_active_focuses: {
      description: "Get all currently active focus sessions for the user. Use this to understand what the user is currently working on before making decisions.",
      inputSchema: z.object({}),
      execute: async () => {
        const focuses = await db.focus.findMany({
          where: {
            userId,
            isActive: true,
          },
          orderBy: {
            lastActivityAt: "desc",
          },
        });

        return focuses.map((f) => ({
          id: f.id,
          item: f.item,
          keywords: f.keywords,
          isActive: f.isActive,
          startedAt: f.startedAt.toISOString(),
          lastActivityAt: f.lastActivityAt.toISOString(),
        }));
      },
    },

    /**
     * Create a new focus
     */
    create_focus: {
      description: "Create a new focus session when the attention data indicates a topic that doesn't match any existing active focus. Only create if no similar focus exists.",
      inputSchema: z.object({
        item: z.string().describe("2-3 word description of the focus topic (e.g., 'React Development', 'Machine Learning')"),
        keywords: z.array(z.string()).describe("Initial keywords for this focus"),
      }),
      execute: async ({ item, keywords }: { item: string; keywords: string[] }) => {
        const now = new Date();
        const newFocus = await db.focus.create({
          data: {
            userId,
            item,
            keywords,
            isActive: true,
            startedAt: now,
            lastCalculatedAt: now,
            lastActivityAt: now,
          },
        });

        emitFocusChange(userId, newFocus, "created");

        return {
          success: true,
          focus: {
            id: newFocus.id,
            item: newFocus.item,
            keywords: newFocus.keywords,
            isActive: newFocus.isActive,
            startedAt: newFocus.startedAt.toISOString(),
            lastActivityAt: newFocus.lastActivityAt.toISOString(),
          },
        };
      },
    },

    /**
     * Update an existing focus with new activity
     */
    update_focus: {
      description: "Update an existing focus session with new keywords from recent attention. Use this when attention data relates to an existing focus.",
      inputSchema: z.object({
        focusId: z.string().describe("The ID of the focus to update"),
        newKeywords: z.array(z.string()).describe("New keywords to add to the focus"),
        newItem: z.string().optional().describe("Optional updated 2-3 word description if the focus has evolved"),
      }),
      execute: async ({ focusId, newKeywords, newItem }: { focusId: string; newKeywords: string[]; newItem?: string }) => {
        const existingFocus = await db.focus.findUnique({
          where: { id: focusId },
        });

        if (!existingFocus || existingFocus.userId !== userId) {
          return { success: false, error: "Focus not found" };
        }

        const now = new Date();
        const mergedKeywords = [...new Set([...newKeywords, ...existingFocus.keywords])].slice(0, 20);

        const updatedFocus = await db.focus.update({
          where: { id: focusId },
          data: {
            keywords: mergedKeywords,
            item: newItem || existingFocus.item,
            lastCalculatedAt: now,
            lastActivityAt: now,
          },
        });

        emitFocusChange(userId, updatedFocus, "updated");

        return {
          success: true,
          focus: {
            id: updatedFocus.id,
            item: updatedFocus.item,
            keywords: updatedFocus.keywords,
            isActive: updatedFocus.isActive,
            startedAt: updatedFocus.startedAt.toISOString(),
            lastActivityAt: updatedFocus.lastActivityAt.toISOString(),
          },
        };
      },
    },

    /**
     * Merge similar focuses together
     */
    merge_focuses: {
      description: "Merge two similar focus sessions into one. Use this when you detect that two active focuses are essentially about the same topic.",
      inputSchema: z.object({
        primaryFocusId: z.string().describe("The focus to keep (will absorb keywords from secondary)"),
        secondaryFocusId: z.string().describe("The focus to merge into primary and then end"),
        mergedItem: z.string().describe("The new 2-3 word description for the merged focus"),
      }),
      execute: async ({ primaryFocusId, secondaryFocusId, mergedItem }: { primaryFocusId: string; secondaryFocusId: string; mergedItem: string }) => {
        const [primary, secondary] = await Promise.all([
          db.focus.findUnique({ where: { id: primaryFocusId } }),
          db.focus.findUnique({ where: { id: secondaryFocusId } }),
        ]);

        if (!primary || !secondary || primary.userId !== userId || secondary.userId !== userId) {
          return { success: false, error: "One or both focuses not found" };
        }

        const now = new Date();
        const mergedKeywords = [...new Set([...primary.keywords, ...secondary.keywords])].slice(0, 20);

        // Update primary with merged data
        const updatedPrimary = await db.focus.update({
          where: { id: primaryFocusId },
          data: {
            item: mergedItem,
            keywords: mergedKeywords,
            lastCalculatedAt: now,
            lastActivityAt: now,
          },
        });

        // End secondary
        const endedSecondary = await db.focus.update({
          where: { id: secondaryFocusId },
          data: {
            isActive: false,
            endedAt: now,
          },
        });

        emitFocusChange(userId, updatedPrimary, "updated");
        emitFocusChange(userId, endedSecondary, "ended");

        return {
          success: true,
          focus: {
            id: updatedPrimary.id,
            item: updatedPrimary.item,
            keywords: updatedPrimary.keywords,
            isActive: updatedPrimary.isActive,
            startedAt: updatedPrimary.startedAt.toISOString(),
            lastActivityAt: updatedPrimary.lastActivityAt.toISOString(),
          },
        };
      },
    },

    /**
     * End a focus due to inactivity
     */
    end_focus: {
      description: "End a focus session. Use this when a focus has had no related activity for a significant time.",
      inputSchema: z.object({
        focusId: z.string().describe("The ID of the focus to end"),
        reason: z.string().optional().describe("Optional reason for ending (e.g., 'inactivity', 'completed')"),
      }),
      execute: async ({ focusId, reason }: { focusId: string; reason?: string }) => {
        const focus = await db.focus.findUnique({
          where: { id: focusId },
        });

        if (!focus || focus.userId !== userId) {
          return { success: false, error: "Focus not found" };
        }

        const now = new Date();
        const endedFocus = await db.focus.update({
          where: { id: focusId },
          data: {
            isActive: false,
            endedAt: now,
          },
        });

        emitFocusChange(userId, endedFocus, "ended");

        return {
          success: true,
          message: `Focus "${focus.item}" ended${reason ? ` (${reason})` : ""}`,
        };
      },
    },

    /**
     * Resume a focus if within inactivity threshold
     */
    resume_focus: {
      description: `Resume a recently ended focus if it ended within the inactivity threshold (${inactivityThresholdMs}ms). Use this when attention data matches a recently ended focus.`,
      inputSchema: z.object({
        focusId: z.string().describe("The ID of the focus to resume"),
        newKeywords: z.array(z.string()).optional().describe("Optional new keywords to add"),
      }),
      execute: async ({ focusId, newKeywords }: { focusId: string; newKeywords?: string[] }) => {
        const focus = await db.focus.findUnique({
          where: { id: focusId },
        });

        if (!focus || focus.userId !== userId) {
          return { success: false, error: "Focus not found" };
        }

        if (focus.isActive) {
          return { success: false, error: "Focus is already active" };
        }

        // Check if within inactivity threshold
        const now = new Date();
        if (focus.endedAt) {
          const timeSinceEnded = now.getTime() - focus.endedAt.getTime();
          if (timeSinceEnded > inactivityThresholdMs) {
            return { success: false, error: "Focus ended too long ago to resume" };
          }
        }

        const mergedKeywords = newKeywords
          ? [...new Set([...newKeywords, ...focus.keywords])].slice(0, 20)
          : focus.keywords;

        const resumedFocus = await db.focus.update({
          where: { id: focusId },
          data: {
            isActive: true,
            endedAt: null,
            keywords: mergedKeywords,
            lastCalculatedAt: now,
            lastActivityAt: now,
          },
        });

        emitFocusChange(userId, resumedFocus, "updated");

        return {
          success: true,
          focus: {
            id: resumedFocus.id,
            item: resumedFocus.item,
            keywords: resumedFocus.keywords,
            isActive: resumedFocus.isActive,
            startedAt: resumedFocus.startedAt.toISOString(),
            lastActivityAt: resumedFocus.lastActivityAt.toISOString(),
          },
        };
      },
    },

    /**
     * Get recently ended focuses that can still be resumed
     */
    get_resumable_focuses: {
      description: "Get focuses that ended recently and can still be resumed. Useful for checking if new attention data matches a recently ended focus.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        const threshold = new Date(now.getTime() - inactivityThresholdMs);

        const focuses = await db.focus.findMany({
          where: {
            userId,
            isActive: false,
            endedAt: {
              gte: threshold,
            },
          },
          orderBy: {
            endedAt: "desc",
          },
          take: 10,
        });

        return focuses.map((f) => ({
          id: f.id,
          item: f.item,
          keywords: f.keywords,
          endedAt: f.endedAt?.toISOString(),
        }));
      },
    },
  };
}

export type FocusTools = ReturnType<typeof createFocusTools>;
