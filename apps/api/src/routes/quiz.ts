import { Hono } from "hono";
import { db } from "../lib/index.js";
import { startQuizGeneration, getQuizTaskStatus, getQueueStatus } from "../lib/quiz/index.js";
import { getTask, TASK_STATUS } from "../lib/task-queue/index.js";

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

/**
 * POST /quiz/generate
 * Start quiz generation via task queue.
 * Client should poll GET /quiz/job/:taskId for status.
 */
app.post("/generate", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const result = await startQuizGeneration(userId);
    return c.json({
      jobId: result.taskId, // Keep 'jobId' for backward compatibility
      taskId: result.taskId,
      status: result.status,
    });
  } catch (error) {
    console.error("[Quiz] Error starting generation:", error);
    return c.json({ error: "Failed to start quiz generation" }, 500);
  }
});

/**
 * GET /quiz/job/:jobId
 * Get the status of a quiz generation task.
 * Returns the quiz when completed.
 */
app.get("/job/:jobId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const taskId = c.req.param("jobId");

  try {
    // Get task from the task queue
    const task = await getTask(taskId);

    if (!task || task.userId !== userId) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Return full result if completed, otherwise just status
    if (task.status === TASK_STATUS.COMPLETED && task.result) {
      return c.json({
        status: "completed",
        quiz: task.result,
      });
    }

    if (task.status === TASK_STATUS.FAILED) {
      return c.json({
        status: "failed",
        error: task.error || "Quiz generation failed",
        code: task.error?.includes("Not enough activity") ? "INSUFFICIENT_DATA" : "INTERNAL_ERROR",
      });
    }

    // Map task status to legacy job status
    const statusMap: Record<string, string> = {
      [TASK_STATUS.PENDING]: "pending",
      [TASK_STATUS.PROCESSING]: "processing",
    };

    return c.json({
      status: statusMap[task.status] || task.status,
    });
  } catch (error) {
    console.error("[Quiz] Error getting job status:", error);
    return c.json({ error: "Failed to get job status" }, 500);
  }
});

/**
 * POST /quiz/result
 * Save a quiz result.
 */
app.post("/result", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const body = await c.req.json<{ totalQuestions: number; correctAnswers: number }>();

    if (typeof body.totalQuestions !== "number" || typeof body.correctAnswers !== "number") {
      return c.json({ error: "totalQuestions and correctAnswers are required" }, 400);
    }

    const result = await db.quizResult.create({
      data: {
        userId,
        totalQuestions: body.totalQuestions,
        correctAnswers: body.correctAnswers,
      },
    });

    return c.json({ id: result.id, saved: true });
  } catch (error) {
    console.error("[Quiz] Error saving result:", error);
    return c.json({ error: "Failed to save result" }, 500);
  }
});

/**
 * GET /quiz/history
 * Get the user's quiz history.
 */
app.get("/history", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const results = await db.quizResult.findMany({
    where: { userId },
    orderBy: { completedAt: "desc" },
    take: 20,
  });

  const stats = await db.quizResult.aggregate({
    where: { userId },
    _sum: {
      totalQuestions: true,
      correctAnswers: true,
    },
    _count: true,
  });

  return c.json({
    results: results.map((r) => ({
      id: r.id,
      totalQuestions: r.totalQuestions,
      correctAnswers: r.correctAnswers,
      completedAt: r.completedAt.toISOString(),
    })),
    stats: {
      totalQuizzes: stats._count,
      totalQuestions: stats._sum.totalQuestions || 0,
      totalCorrect: stats._sum.correctAnswers || 0,
    },
  });
});

/**
 * GET /quiz/status
 * Get the current queue status (for debugging).
 */
app.get("/status", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  const status = await getQueueStatus(userId || undefined);
  return c.json(status);
});

export default app;
