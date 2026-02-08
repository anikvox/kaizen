import { Hono } from "hono";
import { db } from "../lib/index.js";
import { recordNudgeResponse } from "../lib/agent/focus-agent.js";

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
 * POST /agent/nudges/:nudgeId/respond
 * Respond to a nudge (acknowledged, false_positive, or dismissed)
 */
app.post("/nudges/:nudgeId/respond", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const { nudgeId } = c.req.param();
  const { response } = await c.req.json();

  if (!response || !["acknowledged", "false_positive", "dismissed"].includes(response)) {
    return c.json({ error: "Invalid response" }, 400);
  }

  try {
    await recordNudgeResponse(nudgeId, userId, response);
    return c.json({ success: true });
  } catch (error) {
    console.error("[Agent] Failed to record nudge response:", error);
    return c.json({ error: "Failed to record response" }, 500);
  }
});

/**
 * GET /agent/settings
 * Get agent settings for the user
 */
app.get("/settings", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: {
      focusAgentEnabled: true,
      focusAgentSensitivity: true,
      focusAgentCooldownMs: true,
    },
  });

  if (!settings) {
    return c.json({
      focusAgentEnabled: true,
      focusAgentSensitivity: 0.5,
      focusAgentCooldownMs: 300000,
    });
  }

  return c.json(settings);
});

/**
 * PATCH /agent/settings
 * Update agent settings for the user
 */
app.patch("/settings", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json();
  const updateData: {
    focusAgentEnabled?: boolean;
    focusAgentSensitivity?: number;
    focusAgentCooldownMs?: number;
  } = {};

  if (typeof body.focusAgentEnabled === "boolean") {
    updateData.focusAgentEnabled = body.focusAgentEnabled;
  }

  if (typeof body.focusAgentSensitivity === "number") {
    updateData.focusAgentSensitivity = Math.max(0, Math.min(1, body.focusAgentSensitivity));
  }

  if (typeof body.focusAgentCooldownMs === "number") {
    updateData.focusAgentCooldownMs = Math.max(60000, body.focusAgentCooldownMs);
  }

  const settings = await db.userSettings.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      ...updateData,
    },
    select: {
      focusAgentEnabled: true,
      focusAgentSensitivity: true,
      focusAgentCooldownMs: true,
    },
  });

  return c.json(settings);
});

export default app;
