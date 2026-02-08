/**
 * Task Queue Routes
 *
 * API endpoints for task queue visibility and management.
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../lib/index.js";
import {
  getUserQueueStatus,
  getQueueStats,
  getTask,
  cancelTask,
  pushFocusCalculation,
  pushQuizGeneration,
  pushSummarization,
  getWorkerStatus,
  TASK_TYPES,
  type TaskType,
} from "../lib/task-queue/index.js";
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
// User Task Queue Endpoints
// ============================================================================

/**
 * GET /tasks
 * Get the current user's task queue status.
 * Includes pending tasks, processing tasks, and recent history.
 */
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const status = await getUserQueueStatus(userId);

    return c.json({
      pending: status.pendingTasks.map(formatTask),
      processing: status.processingTasks.map(formatTask),
      history: status.recentHistory.map(formatHistoryItem),
      stats: status.stats,
    });
  } catch (error) {
    console.error("[Tasks] Error getting queue status:", error);
    return c.json({ error: "Failed to get queue status" }, 500);
  }
});

/**
 * GET /tasks/:taskId
 * Get details of a specific task.
 */
app.get("/:taskId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const taskId = c.req.param("taskId");

  try {
    const task = await getTask(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.userId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    return c.json(formatTask(task));
  } catch (error) {
    console.error("[Tasks] Error getting task:", error);
    return c.json({ error: "Failed to get task" }, 500);
  }
});

/**
 * DELETE /tasks/:taskId
 * Cancel a pending task.
 */
app.delete("/:taskId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const taskId = c.req.param("taskId");

  try {
    const task = await getTask(taskId);

    if (!task) {
      return c.json({ error: "Task not found" }, 404);
    }

    if (task.userId !== userId) {
      return c.json({ error: "Unauthorized" }, 403);
    }

    const cancelled = await cancelTask(taskId);

    if (!cancelled) {
      return c.json({ error: "Task cannot be cancelled (not pending)" }, 400);
    }

    return c.json({ success: true, taskId });
  } catch (error) {
    console.error("[Tasks] Error cancelling task:", error);
    return c.json({ error: "Failed to cancel task" }, 500);
  }
});

// ============================================================================
// Task Creation Endpoints
// ============================================================================

/**
 * POST /tasks/focus
 * Trigger a focus calculation task.
 */
app.post("/focus", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ force?: boolean }>().catch(() => ({} as { force?: boolean }));
    const task = await pushFocusCalculation(userId, body.force);

    return c.json({
      taskId: task.id,
      status: task.status,
      type: task.type,
    });
  } catch (error) {
    console.error("[Tasks] Error creating focus task:", error);
    return c.json({ error: "Failed to create task" }, 500);
  }
});

/**
 * POST /tasks/quiz
 * Trigger a quiz generation task.
 */
app.post("/quiz", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ answerOptionsCount?: number; activityDays?: number }>().catch(() => ({}));
    const task = await pushQuizGeneration(userId, body);

    return c.json({
      taskId: task.id,
      status: task.status,
      type: task.type,
    });
  } catch (error) {
    console.error("[Tasks] Error creating quiz task:", error);
    return c.json({ error: "Failed to create task" }, 500);
  }
});

/**
 * POST /tasks/summarize
 * Trigger a summarization task.
 */
app.post("/summarize", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ visitIds?: string[] }>().catch(() => ({} as { visitIds?: string[] }));
    const task = await pushSummarization(userId, body.visitIds);

    return c.json({
      taskId: task.id,
      status: task.status,
      type: task.type,
    });
  } catch (error) {
    console.error("[Tasks] Error creating summarization task:", error);
    return c.json({ error: "Failed to create task" }, 500);
  }
});

// ============================================================================
// Admin/Debug Endpoints
// ============================================================================

/**
 * GET /tasks/admin/stats
 * Get global queue statistics (admin only - no auth for now).
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

/**
 * GET /tasks/admin/worker
 * Get worker status (admin only).
 */
app.get("/admin/worker", async (c) => {
  try {
    const status = getWorkerStatus();
    return c.json(status);
  } catch (error) {
    console.error("[Tasks] Error getting worker status:", error);
    return c.json({ error: "Failed to get worker status" }, 500);
  }
});

// ============================================================================
// Helpers
// ============================================================================

function formatTask(task: any) {
  return {
    id: task.id,
    type: task.type,
    status: task.status,
    priority: task.priority,
    payload: task.payload,
    scheduledFor: task.scheduledFor?.toISOString(),
    startedAt: task.startedAt?.toISOString(),
    completedAt: task.completedAt?.toISOString(),
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    result: task.result,
    error: task.error,
    createdAt: task.createdAt?.toISOString(),
    updatedAt: task.updatedAt?.toISOString(),
  };
}

function formatHistoryItem(item: any) {
  return {
    id: item.id,
    type: item.type,
    status: item.status,
    priority: item.priority,
    payload: item.payload,
    scheduledFor: item.scheduledFor?.toISOString(),
    startedAt: item.startedAt?.toISOString(),
    completedAt: item.completedAt?.toISOString(),
    attempts: item.attempts,
    durationMs: item.durationMs,
    result: item.result,
    error: item.error,
    archivedAt: item.archivedAt?.toISOString(),
  };
}

export default app;

// ============================================================================
// Separate SSE App (supports query param auth for EventSource)
// ============================================================================

export const tasksSSE = new Hono();

/**
 * GET /sse/tasks
 * Subscribe to real-time task queue updates.
 * Supports both device token and Clerk auth via query param.
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
    const initialStatus = await getUserQueueStatus(userId);
    await stream.writeSSE({
      data: JSON.stringify({
        pending: initialStatus.pendingTasks.map(formatTask),
        processing: initialStatus.processingTasks.map(formatTask),
        stats: initialStatus.stats,
      }),
      event: "connected",
      id: String(id++),
    });

    // Subscribe to task queue events
    const unsubscribe = events.onTaskQueueChanged(async (event) => {
      if (event.userId !== userId) return;

      try {
        await stream.writeSSE({
          data: JSON.stringify({
            taskId: event.taskId,
            type: event.type,
            status: event.status,
            changeType: event.changeType,
            result: event.result,
            error: event.error,
          }),
          event: "taskChanged",
          id: String(id++),
        });
      } catch {
        // Stream closed
      }
    });

    // Keep connection alive with periodic pings
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
      unsubscribe();
    }
  });
});
