import { Router, Request, Response } from "express";
import {
  processFocusSession,
  getActiveFocus,
  getFocusHistory,
} from "../lib/focus";
import {
  startFocusScheduler,
  stopFocusScheduler,
  getSchedulerConfig,
} from "../lib/scheduler";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middleware/auth";

const router = Router();

// Helper to ensure user exists in our DB
async function ensureUser(clerkId: string) {
  const user = await prisma.user.findUnique({ where: { id: clerkId } });
  if (!user) {
    // In a real app, you might get more info from Clerk SDK here
    await prisma.user.create({
      data: {
        id: clerkId,
        email: "unknown@example.com", // This should be updated via webhook or Clerk SDK
      },
    });
  }
}

// =============================================================================
// FOCUS TRACKING ROUTES (Neuropilot approach)
// =============================================================================

/**
 * POST /focus/detect - Manually trigger focus detection
 * Useful for testing or on-demand focus calculation
 */
router.post("/detect", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;

    // Ensure user exists
    await ensureUser(userId);

    const result = await processFocusSession(userId);

    res.status(200).json(result);
  } catch (error) {
    console.error("Error detecting focus:", error);
    res.status(500).json({ error: "Failed to detect focus" });
  }
});

/**
 * GET /focus - Get focus history
 *
 * Query params:
 * - limit: number (default 10, max 100)
 * - offset: number (default 0)
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.auth!.userId;

    const history = await getFocusHistory(userId, limit, offset);
    res.json(history);
  } catch (error) {
    console.error("Error fetching focus history:", error);
    res.status(500).json({ error: "Failed to fetch focus history" });
  }
});

/**
 * GET /focus/current - Get the current/most recent focus
 */
router.get("/current", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const current = await getActiveFocus(userId);

    if (!current) {
      res.status(404).json({ error: "No focus data found" });
      return;
    }

    res.json(current);
  } catch (error) {
    console.error("Error fetching current focus:", error);
    res.status(500).json({ error: "Failed to fetch current focus" });
  }
});

/**
 * GET /focus/:id - Get a specific focus by ID
 */
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.auth!.userId;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid focus ID" });
      return;
    }

    const focus = await prisma.focus.findUnique({
      where: { id, userId },
    });

    if (!focus) {
      res.status(404).json({ error: "Focus not found" });
      return;
    }

    res.json(focus);
  } catch (error) {
    console.error("Error fetching focus:", error);
    res.status(500).json({ error: "Failed to fetch focus" });
  }
});

/**
 * DELETE /focus/:id - Delete a focus record
 */
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const userId = req.auth!.userId;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid focus ID" });
      return;
    }

    const existing = await prisma.focus.findUnique({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Focus not found" });
      return;
    }

    await prisma.focus.delete({ where: { id } });
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting focus:", error);
    res.status(500).json({ error: "Failed to delete focus" });
  }
});

/**
 * GET /focus/stats/today - Get today's focus statistics
 */
router.get("/stats/today", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const focusRecords = await prisma.focus.findMany({
      where: {
        userId,
        lastUpdated: {
          gte: startOfDay,
          lte: now,
        },
      },
      orderBy: { lastUpdated: "asc" },
    });

    // Calculate total time per focus item
    const itemStats = focusRecords.reduce(
      (acc, record) => {
        const timeSpent = record.timeSpent as Array<{ start: number; end: number | null }>;
        let totalMs = 0;

        for (const segment of timeSpent) {
          if (segment.end) {
            totalMs += segment.end - segment.start;
          } else {
            // Active segment
            totalMs += Date.now() - segment.start;
          }
        }

        if (!acc[record.item]) {
          acc[record.item] = {
            item: record.item,
            keywords: record.keywords,
            totalTimeMs: 0,
            sessionCount: 0,
          };
        }

        acc[record.item].totalTimeMs += totalMs;
        acc[record.item].sessionCount += 1;

        return acc;
      },
      {} as Record<
        string,
        { item: string; keywords: string[]; totalTimeMs: number; sessionCount: number }
      >
    );

    const stats = Object.values(itemStats).map((stat) => ({
      ...stat,
      totalTimeMinutes: Math.round(stat.totalTimeMs / 60000),
    }));

    // Sort by total time descending
    stats.sort((a, b) => b.totalTimeMs - a.totalTimeMs);

    res.json({
      totalRecords: focusRecords.length,
      focusItems: stats,
      timeline: focusRecords.map((r) => ({
        id: r.id,
        item: r.item,
        keywords: r.keywords,
        lastUpdated: r.lastUpdated,
      })),
    });
  } catch (error) {
    console.error("Error fetching today's stats:", error);
    res.status(500).json({ error: "Failed to fetch today's stats" });
  }
});

// =============================================================================
// SCHEDULER CONTROL ROUTES
// =============================================================================

/**
 * GET /focus/scheduler/status - Get scheduler status
 */
router.get("/scheduler/status", (_req: Request, res: Response) => {
  const config = getSchedulerConfig();
  res.json(config);
});

/**
 * POST /focus/scheduler/start - Start the scheduler
 */
router.post("/scheduler/start", (_req: Request, res: Response) => {
  startFocusScheduler();
  res.json({ message: "Scheduler started", ...getSchedulerConfig() });
});

/**
 * POST /focus/scheduler/stop - Stop the scheduler
 */
router.post("/scheduler/stop", (_req: Request, res: Response) => {
  stopFocusScheduler();
  res.json({ message: "Scheduler stopped", ...getSchedulerConfig() });
});

export default router;
