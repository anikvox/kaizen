import { Router, Request, Response } from "express";
import {
  computeAndSaveFocus,
  computeFocusForLastHours,
  getFocusHistory,
  getAverageFocus,
} from "../lib/inference";
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
// FOCUS INFERENCE ROUTES
// =============================================================================

interface ComputeFocusBody {
  windowStart?: string; // ISO date string
  windowEnd?: string; // ISO date string
  hours?: number; // Alternative: compute for last N hours
}

/**
 * POST /focus/compute - Compute focus score from attention data
 *
 * Body options:
 * - { hours: number } - Compute focus for the last N hours
 * - { windowStart: string, windowEnd: string } - Compute for a specific time window
 * - {} - Defaults to last 1 hour
 */
router.post(
  "/compute",
  async (req: AuthRequest<{}, {}, ComputeFocusBody>, res: Response) => {
    try {
      const { windowStart, windowEnd, hours } = req.body;
      const userId = req.auth!.userId;

      // Ensure user exists before computing focus
      await ensureUser(userId);

      let result;

      if (windowStart && windowEnd) {
        // Use provided time window
        const start = new Date(windowStart);
        const end = new Date(windowEnd);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
          res.status(400).json({ error: "Invalid date format" });
          return;
        }

        if (start >= end) {
          res.status(400).json({ error: "windowStart must be before windowEnd" });
          return;
        }

        result = await computeAndSaveFocus(start, end, userId);
      } else {
        // Use hours (default to 1)
        const hoursToCompute = hours && hours > 0 ? hours : 1;
        result = await computeFocusForLastHours(hoursToCompute, userId);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error("Error computing focus:", error);
      res.status(500).json({ error: "Failed to compute focus" });
    }
  }
);

/**
 * GET /focus - Get focus history
 *
 * Query params:
 * - limit: number (default 10)
 * - offset: number (default 0)
 */
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const offset = parseInt(req.query.offset as string) || 0;
    const userId = req.auth!.userId;

    const history = await getFocusHistory(limit, offset, userId);
    res.json(history);
  } catch (error) {
    console.error("Error fetching focus history:", error);
    res.status(500).json({ error: "Failed to fetch focus history" });
  }
});

/**
 * GET /focus/latest - Get the most recent focus calculation
 */
router.get("/latest", async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const latest = await prisma.focus.findFirst({
      where: { userId },
      orderBy: { timestamp: "desc" },
    });

    if (!latest) {
      res.status(404).json({ error: "No focus data found" });
      return;
    }

    res.json(latest);
  } catch (error) {
    console.error("Error fetching latest focus:", error);
    res.status(500).json({ error: "Failed to fetch latest focus" });
  }
});

/**
 * GET /focus/average - Get average focus score for a time period
 *
 * Query params:
 * - windowStart: ISO date string (required)
 * - windowEnd: ISO date string (required)
 */
router.get("/average", async (req: AuthRequest, res: Response) => {
  try {
    const { windowStart, windowEnd } = req.query;
    const userId = req.auth!.userId;

    if (!windowStart || !windowEnd) {
      res
        .status(400)
        .json({ error: "windowStart and windowEnd are required" });
      return;
    }

    const start = new Date(windowStart as string);
    const end = new Date(windowEnd as string);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      res.status(400).json({ error: "Invalid date format" });
      return;
    }

    const result = await getAverageFocus(start, end, userId);
    res.json(result);
  } catch (error) {
    console.error("Error calculating average focus:", error);
    res.status(500).json({ error: "Failed to calculate average focus" });
  }
});

/**
 * GET /focus/:id - Get a specific focus calculation by ID
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
      res.status(404).json({ error: "Focus record not found" });
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
      res.status(404).json({ error: "Focus record not found" });
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

    const [average, focusRecords] = await Promise.all([
      getAverageFocus(startOfDay, now, userId),
      prisma.focus.findMany({
        where: {
          userId,
          timestamp: {
            gte: startOfDay,
            lte: now,
          },
        },
        orderBy: { timestamp: "asc" },
        select: {
          id: true,
          score: true,
          category: true,
          timestamp: true,
        },
      }),
    ]);

    // Calculate category distribution
    const categoryDistribution = focusRecords.reduce(
      (acc, record) => {
        acc[record.category] = (acc[record.category] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    res.json({
      averageScore: average.average,
      totalRecords: average.count,
      categoryDistribution,
      timeline: focusRecords,
    });
  } catch (error) {
    console.error("Error fetching today's stats:", error);
    res.status(500).json({ error: "Failed to fetch today's stats" });
  }
});

// =============================================================================
// SCHEDULER CONTROL ROUTES
// =============================================================================

// For now, scheduler is global or needs further thought for multi-user
// We'll keep it as is but it might need userId in the future

// =============================================================================
// SCHEDULER CONTROL ROUTES
// =============================================================================

/**
 * GET /focus/scheduler/status - Get scheduler status
 */
router.get("/scheduler/status", (_req: Request, res: Response) => {
  const config = getSchedulerConfig();
  res.json({
    ...config,
    intervalMinutes: config.intervalMs / 60000,
  });
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
