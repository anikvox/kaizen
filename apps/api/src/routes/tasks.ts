/**
 * Jobs Routes
 *
 * API endpoints for job queue visibility and management.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../lib/index.js";
import {
  getUserJobsStatus,
  getQueueStats,
  getJob,
  cancelJob,
  sendFocusCalculation,
  sendQuizGeneration,
  sendSummarization,
  JOB_NAMES,
} from "../lib/jobs/index.js";
import { events } from "../lib/events.js";

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: { get: (key: string) => string | undefined }): Promise<string | null> {
  const deviceUserId = c.get("userId");
  if (deviceUserId) {
    return deviceUserId;
  }

  const clerkUserId = c.get("clerkUserId");
  if (clerkUserId) {
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    return user?.id || null;
  }

  return null;
}

// Middleware that supports both device token and Clerk auth
async function dualAuthMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() },
    });
    c.set("userId", deviceToken.user.id);
    c.set("deviceTokenId", deviceToken.id);
    return next();
  }

  // Try Clerk auth
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
    return next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

// ============================================================================
// User Job Queue Endpoints
// ============================================================================

/**
 * GET /tasks
 * Get the current user's job queue status.
 */
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const status = await getUserJobsStatus(userId);

    return c.json({
      pending: status.pending,
      processing: status.active,
      history: status.recent,
      stats: {
        pendingCount: status.stats.pendingCount,
        processingCount: status.stats.activeCount,
        completedToday: status.stats.completedToday,
        failedToday: status.stats.failedToday,
      },
    });
  } catch (error) {
    console.error("[Tasks] Error getting queue status:", error);
    return c.json({ error: "Failed to get queue status" }, 500);
  }
});

/**
 * GET /tasks/:jobId
 * Get details of a specific job.
 */
app.get("/:jobId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const jobId = c.req.param("jobId");

  try {
    const job = await getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    if ((job.data as any).userId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    return c.json(job);
  } catch (error) {
    console.error("[Tasks] Error getting job:", error);
    return c.json({ error: "Failed to get job" }, 500);
  }
});

/**
 * DELETE /tasks/:jobId
 * Cancel a pending job.
 */
app.delete("/:jobId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const jobId = c.req.param("jobId");

  try {
    const job = await getJob(jobId);

    if (!job) {
      return c.json({ error: "Job not found" }, 404);
    }

    if ((job.data as any).userId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const cancelled = await cancelJob(jobId);

    if (!cancelled) {
      return c.json({ error: "Job cannot be cancelled" }, 400);
    }

    return c.json({ success: true, jobId });
  } catch (error) {
    console.error("[Tasks] Error cancelling job:", error);
    return c.json({ error: "Failed to cancel job" }, 500);
  }
});

// ============================================================================
// Job Creation Endpoints
// ============================================================================

/**
 * POST /tasks/focus
 * Trigger a focus calculation job.
 */
app.post("/focus", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ force?: boolean }>().catch(() => ({} as { force?: boolean }));
    const jobId = await sendFocusCalculation(userId, body.force);

    return c.json({
      jobId,
      status: "created",
      type: JOB_NAMES.FOCUS_CALCULATION,
    });
  } catch (error) {
    console.error("[Tasks] Error creating focus job:", error);
    return c.json({ error: "Failed to create job" }, 500);
  }
});

/**
 * POST /tasks/quiz
 * Trigger a quiz generation job.
 */
app.post("/quiz", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ answerOptionsCount?: number; activityDays?: number }>().catch(() => ({}));
    const jobId = await sendQuizGeneration(userId, body);

    return c.json({
      jobId,
      status: "created",
      type: JOB_NAMES.QUIZ_GENERATION,
    });
  } catch (error) {
    console.error("[Tasks] Error creating quiz job:", error);
    return c.json({ error: "Failed to create job" }, 500);
  }
});

/**
 * POST /tasks/summarize
 * Trigger a summarization job.
 */
app.post("/summarize", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ visitIds?: string[] }>().catch(() => ({} as { visitIds?: string[] }));
    const jobId = await sendSummarization(userId, body.visitIds);

    return c.json({
      jobId,
      status: "created",
      type: JOB_NAMES.SUMMARIZATION,
    });
  } catch (error) {
    console.error("[Tasks] Error creating summarization job:", error);
    return c.json({ error: "Failed to create job" }, 500);
  }
});

// ============================================================================
// Admin/Debug Endpoints
// ============================================================================

/**
 * GET /tasks/admin/stats
 * Get global queue statistics.
 */
app.get("/admin/stats", async (c) => {
  try {
    const stats = await getQueueStats();
    return c.json(stats);
  } catch (error) {
    console.error("[Tasks] Error getting global stats:", error);
    return c.json({ error: "Failed to get stats" }, 500);
  }
});

export default app;

// ============================================================================
// Separate SSE App (supports query param auth for EventSource)
// ============================================================================

export const tasksSSE = new Hono();

/**
 * GET /sse/tasks
 * Subscribe to real-time job queue updates.
 */
tasksSSE.get("/", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  let userId: string;

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    userId = deviceToken.user.id;
  } else {
    // Try Clerk auth
    try {
      const { verifyToken } = await import("@clerk/backend");
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const user = await db.user.findUnique({
        where: { clerkId: payload.sub },
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      userId = user.id;
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Send initial status
    const initialStatus = await getUserJobsStatus(userId);
    await stream.writeSSE({
      data: JSON.stringify({
        pending: initialStatus.pending,
        processing: initialStatus.active,
        stats: initialStatus.stats,
      }),
      event: "connected",
      id: String(id++),
    });

    // Subscribe to job events
    const unsubscribeCreated = events.onJobCreated(async (event) => {
      if (event.userId !== userId) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify({
            jobId: event.jobId,
            type: event.name,
            status: "created",
            changeType: "created",
          }),
          event: "jobChanged",
          id: String(id++),
        });
      } catch {
        // Stream closed
      }
    });

    const unsubscribeCompleted = events.onJobCompleted(async (event) => {
      if (event.userId !== userId) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify({
            jobId: event.jobId,
            type: event.name,
            status: "completed",
            changeType: "completed",
            result: event.result,
          }),
          event: "jobChanged",
          id: String(id++),
        });
      } catch {
        // Stream closed
      }
    });

    const unsubscribeFailed = events.onJobFailed(async (event) => {
      if (event.userId !== userId) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify({
            jobId: event.jobId,
            type: event.name,
            status: "failed",
            changeType: "failed",
            error: event.error,
          }),
          event: "jobChanged",
          id: String(id++),
        });
      } catch {
        // Stream closed
      }
    });

    // Keep connection alive
    try {
      while (true) {
        await stream.writeSSE({
          data: JSON.stringify({ time: new Date().toISOString() }),
          event: "ping",
          id: String(id++),
        });
        await stream.sleep(30000);
      }
    } finally {
      unsubscribeCreated();
      unsubscribeCompleted();
      unsubscribeFailed();
    }
  });
});
