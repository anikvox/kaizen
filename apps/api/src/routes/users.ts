import { Hono } from "hono";
import { db } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";
import { scheduleInitialJobs } from "../lib/jobs/index.js";
import { getBoss, isBossRunning } from "../lib/jobs/boss.js";
import { JOB_NAMES } from "../lib/jobs/types.js";

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: {
  get: (key: string) => string | undefined;
}): Promise<string | null> {
  // Check for device token auth first
  const deviceUserId = c.get("userId");
  if (deviceUserId) {
    return deviceUserId;
  }

  // Check for Clerk auth
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
    // Update last used timestamp
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
 * Cancel all scheduled jobs for a user
 */
async function cancelUserJobs(userId: string): Promise<void> {
  if (!isBossRunning()) {
    return;
  }

  const boss = await getBoss();
  const singletonKeys = [
    `focus-${userId}`,
    `quiz-${userId}`,
    `visit-summarize-${userId}`,
    `pulse-${userId}`,
  ];

  // pg-boss stores jobs in pgboss.job table with singletonkey column
  // We need to cancel jobs by their singleton keys
  for (const queueName of Object.values(JOB_NAMES)) {
    for (const singletonKey of singletonKeys) {
      try {
        // Use raw query to find and cancel jobs by singleton key
        await db.$executeRaw`
          UPDATE pgboss.job
          SET state = 'cancelled', completed_on = now()
          WHERE name = ${queueName}
            AND singleton_key = ${singletonKey}
            AND state IN ('created', 'retry', 'active')
        `;
      } catch (error) {
        // Ignore errors - job may not exist
        console.error(`[Users] Failed to cancel job ${singletonKey}:`, error);
      }
    }
  }
}

// GET /me - supports both Clerk and device token auth
app.get("/me", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

// POST /sync - Clerk auth only (web app)
app.post("/sync", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const body = await c.req.json<{ email: string; name?: string }>();

  // Check if user exists before upsert to detect new users
  const existingUser = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });
  const isNewUser = !existingUser;

  const user = await db.user.upsert({
    where: { clerkId: clerkUserId },
    update: {
      email: body.email,
      name: body.name,
    },
    create: {
      clerkId: clerkUserId,
      email: body.email,
      name: body.name,
    },
  });

  // Schedule initial jobs for new users
  if (isNewUser) {
    try {
      // Get or create settings with default intervals
      const settings = await db.userSettings.upsert({
        where: { userId: user.id },
        update: {},
        create: {
          userId: user.id,
          cognitiveAttentionDebugMode: false,
          cognitiveAttentionShowOverlay: false,
        },
      });

      await scheduleInitialJobs(user.id, settings);
      console.log(
        `[Users] Scheduled initial jobs for new user ${user.id} (${body.email})`,
      );
    } catch (error) {
      console.error("[Users] Failed to schedule initial jobs:", error);
      // Don't fail user creation if job scheduling fails
    }
  }

  return c.json(user);
});

// DELETE /me - Delete all user data (supports both auth methods)
app.delete("/me", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const user = await db.user.findUnique({
    where: { id: userId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  console.log(`[Users] Deleting all data for user ${userId} (${user.email})`);

  try {
    // 1. Cancel all scheduled jobs for this user
    await cancelUserJobs(userId);
    console.log(`[Users] Cancelled jobs for user ${userId}`);

    // 2. Delete tables without User relation (Pulse and AttentionInsight)
    await db.pulse.deleteMany({ where: { userId } });
    await db.attentionInsight.deleteMany({ where: { userId } });
    console.log(`[Users] Deleted pulses and insights for user ${userId}`);

    // 3. Delete user (cascades to all related tables)
    await db.user.delete({ where: { id: userId } });
    console.log(`[Users] Deleted user ${userId}`);

    return c.json({ success: true, message: "All data deleted successfully" });
  } catch (error) {
    console.error(`[Users] Failed to delete user ${userId}:`, error);
    return c.json({ error: "Failed to delete user data" }, 500);
  }
});

export default app;
