import { Hono } from "hono";
import { db } from "../lib/index.js";
import {
  startQuizGeneration,
  getQuizJobStatus,
  getQueueStatus,
  getCurrentQuiz,
  submitAnswer,
} from "../lib/quiz/index.js";
import { getJob } from "../lib/jobs/index.js";

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
 * GET /quiz/current
 * Get the current quiz for the user.
 * Returns null if no quiz exists or it's expired.
 */
app.get("/current", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const quiz = await getCurrentQuiz(userId);
    return c.json({ quiz });
  } catch (error) {
    console.error("[Quiz] Error getting current quiz:", error);
    return c.json({ error: "Failed to get current quiz" }, 500);
  }
});

/**
 * POST /quiz/generate
 * Start quiz generation via job queue.
 * Client should poll GET /quiz/job/:jobId for status.
 */
app.post("/generate", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  try {
    const result = await startQuizGeneration(userId);

    // If pre-check failed (no activity data), return error immediately
    if (result.status === "failed") {
      return c.json({
        jobId: null,
        status: "failed",
        error: result.error,
        code: result.code,
      });
    }

    return c.json({
      jobId: result.jobId,
      status: result.status,
    });
  } catch (error) {
    console.error("[Quiz] Error starting generation:", error);
    return c.json({ error: "Failed to start quiz generation" }, 500);
  }
});

/**
 * GET /quiz/job/:jobId
 * Get the status of a quiz generation job.
 * Returns the quiz when completed.
 */
app.get("/job/:jobId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const jobId = c.req.param("jobId");

  try {
    // Get job from pg-boss
    const job = await getJob(jobId);

    if (!job) {
      // Job not found in pg-boss - check if quiz was already generated
      const quiz = await getCurrentQuiz(userId);
      if (quiz) {
        return c.json({ status: "completed", quiz });
      }
      // Job might still be pending - return pending status
      return c.json({ status: "pending" });
    }

    // Check that job belongs to user
    const data = job.data as { userId?: string };
    if (data.userId !== userId) {
      return c.json({ error: "Job not found" }, 404);
    }

    // Return full result if completed
    if (job.state === "completed" && job.output) {
      const quiz = await getCurrentQuiz(userId);
      return c.json({
        status: "completed",
        quiz,
      });
    }

    if (job.state === "failed") {
      // Check if the failure reason was no activity data
      const output = job.output as { message?: string } | null;
      const errorMessage = output?.message || "";
      const isNoActivityError = errorMessage.includes("NO_ACTIVITY_DATA");

      return c.json({
        status: "failed",
        error: isNoActivityError ? "Not enough activity data to generate quiz" : "Quiz generation failed",
        code: isNoActivityError ? "NO_ACTIVITY_DATA" : "INTERNAL_ERROR",
      });
    }

    // Map job state to API status
    const statusMap: Record<string, string> = {
      created: "pending",
      retry: "pending",
      active: "processing",
    };

    return c.json({
      status: statusMap[job.state] || job.state,
    });
  } catch (error) {
    // pg-boss throws "Queue X does not exist" when job is very new
    // Check if quiz was already generated, otherwise return pending
    const quiz = await getCurrentQuiz(userId);
    if (quiz) {
      return c.json({ status: "completed", quiz });
    }
    return c.json({ status: "pending" });
  }
});

/**
 * POST /quiz/:quizId/answer
 * Submit an answer for a quiz question.
 */
app.post("/:quizId/answer", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const quizId = c.req.param("quizId");

  try {
    const body = await c.req.json<{ questionIndex: number; selectedIndex: number }>();

    if (typeof body.questionIndex !== "number" || typeof body.selectedIndex !== "number") {
      return c.json({ error: "questionIndex and selectedIndex are required" }, 400);
    }

    const result = await submitAnswer(userId, quizId, body.questionIndex, body.selectedIndex);

    if (!result.success) {
      return c.json({ error: result.error }, 400);
    }

    // Get updated quiz state
    const quiz = await getCurrentQuiz(userId);

    return c.json({
      success: true,
      isCorrect: result.isCorrect,
      quiz,
    });
  } catch (error) {
    console.error("[Quiz] Error submitting answer:", error);
    return c.json({ error: "Failed to submit answer" }, 500);
  }
});

/**
 * POST /quiz/result
 * Save a quiz result (legacy endpoint for backward compatibility).
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
