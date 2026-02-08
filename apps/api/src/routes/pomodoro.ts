import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, events } from "../lib/index.js";
import {
  getPomodoroStatus,
  pausePomodoro,
  resumePomodoro,
  resetPomodoro,
  type PomodoroStatus,
} from "../lib/pomodoro/index.js";

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
 * GET /pomodoro
 * Get current Pomodoro status
 */
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const status = await getPomodoroStatus(userId);
  return c.json({ status });
});

/**
 * POST /pomodoro/pause
 * Pause the Pomodoro timer
 */
app.post("/pause", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const status = await pausePomodoro(userId);
  return c.json({ status });
});

/**
 * POST /pomodoro/resume
 * Resume the Pomodoro timer
 */
app.post("/resume", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const status = await resumePomodoro(userId);
  return c.json({ status });
});

/**
 * POST /pomodoro/reset
 * Reset the Pomodoro timer
 */
app.post("/reset", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const status = await resetPomodoro(userId);
  return c.json({ status });
});

export default app;

// Separate app for Pomodoro SSE with 1-second ticks
export const pomodoroSSE = new Hono();

pomodoroSSE.get("/", async (c) => {
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

    // Get initial status
    const initialStatus = await getPomodoroStatus(userId);

    // Send initial connection with current status
    await stream.writeSSE({
      data: JSON.stringify({
        connected: true,
        status: initialStatus,
      }),
      event: "connected",
      id: String(id++),
    });

    // Listen for status change events
    const cleanup = events.onPomodoroStatusChanged(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify({ status: data.status }),
          event: "status-changed",
          id: String(id++),
        });
      }
    });

    // Send ticks every second
    try {
      while (true) {
        const status = await getPomodoroStatus(userId);

        // Emit tick event for real-time updates
        events.emitPomodoroTick({ userId, status });

        await stream.writeSSE({
          data: JSON.stringify({ status }),
          event: "tick",
          id: String(id++),
        });

        await stream.sleep(1000);
      }
    } finally {
      cleanup();
    }
  });
});
