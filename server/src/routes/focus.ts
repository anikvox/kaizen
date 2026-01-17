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

const router = Router();

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
  async (req: Request<{}, {}, ComputeFocusBody>, res: Response) => {
    try {
      const { windowStart, windowEnd, hours } = req.body;

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

        result = await computeAndSaveFocus(start, end);
      } else {
        // Use hours (default to 1)
        const hoursToCompute = hours && hours > 0 ? hours : 1;
        result = await computeFocusForLastHours(hoursToCompute);
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
router.get("/", async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    const history = await getFocusHistory(limit, offset);
    res.json(history);
  } catch (error) {
    console.error("Error fetching focus history:", error);
    res.status(500).json({ error: "Failed to fetch focus history" });
  }
});

/**
 * GET /focus/latest - Get the most recent focus calculation
 */
router.get("/latest", async (_req: Request, res: Response) => {
  try {
    const latest = await prisma.focus.findFirst({
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
router.get("/average", async (req: Request, res: Response) => {
  try {
    const { windowStart, windowEnd } = req.query;

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

    const result = await getAverageFocus(start, end);
    res.json(result);
  } catch (error) {
    console.error("Error calculating average focus:", error);
    res.status(500).json({ error: "Failed to calculate average focus" });
  }
});

/**
 * GET /focus/:id - Get a specific focus calculation by ID
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid focus ID" });
      return;
    }

    const focus = await prisma.focus.findUnique({
      where: { id },
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
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid focus ID" });
      return;
    }

    const existing = await prisma.focus.findUnique({ where: { id } });
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
router.get("/stats/today", async (_req: Request, res: Response) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [average, focusRecords] = await Promise.all([
      getAverageFocus(startOfDay, now),
      prisma.focus.findMany({
        where: {
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
