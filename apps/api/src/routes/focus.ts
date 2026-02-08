import { Hono } from "hono";
import { db } from "../lib/index.js";
import { getActiveFocuses, getUserFocusHistory, endUserFocus } from "../lib/focus/index.js";

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: { get: (key: string) => string | undefined }): Promise<string | null> {
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

// Get user's focus history
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const limit = parseInt(c.req.query("limit") || "50", 10);
  const includeActive = c.req.query("includeActive") !== "false";

  const focuses = await getUserFocusHistory(userId, { limit, includeActive });

  return c.json({
    focuses: focuses.map((focus) => ({
      id: focus.id,
      item: focus.item,
      keywords: focus.keywords,
      isActive: focus.isActive,
      startedAt: focus.startedAt.toISOString(),
      endedAt: focus.endedAt?.toISOString() || null,
      lastActivityAt: focus.lastActivityAt.toISOString(),
      createdAt: focus.createdAt.toISOString(),
      updatedAt: focus.updatedAt.toISOString(),
    })),
  });
});

// Get all current active focuses
app.get("/active", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const activeFocuses = await getActiveFocuses(userId);

  return c.json({
    focuses: activeFocuses.map((focus) => ({
      id: focus.id,
      item: focus.item,
      keywords: focus.keywords,
      isActive: focus.isActive,
      startedAt: focus.startedAt.toISOString(),
      endedAt: focus.endedAt?.toISOString() || null,
      lastActivityAt: focus.lastActivityAt.toISOString(),
      createdAt: focus.createdAt.toISOString(),
      updatedAt: focus.updatedAt.toISOString(),
    })),
  });
});

// Get specific focus by ID
app.get("/:id", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const focusId = c.req.param("id");

  const focus = await db.focus.findFirst({
    where: {
      id: focusId,
      userId, // Ensure user can only access their own focus
    },
  });

  if (!focus) {
    return c.json({ error: "Focus not found" }, 404);
  }

  return c.json({
    focus: {
      id: focus.id,
      item: focus.item,
      keywords: focus.keywords,
      isActive: focus.isActive,
      startedAt: focus.startedAt.toISOString(),
      endedAt: focus.endedAt?.toISOString() || null,
      lastActivityAt: focus.lastActivityAt.toISOString(),
      createdAt: focus.createdAt.toISOString(),
      updatedAt: focus.updatedAt.toISOString(),
    },
  });
});

// Manually end the current active focus
app.post("/end", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const endedFocus = await endUserFocus(userId);

  if (!endedFocus) {
    return c.json({ error: "No active focus to end" }, 404);
  }

  return c.json({
    focus: {
      id: endedFocus.id,
      item: endedFocus.item,
      keywords: endedFocus.keywords,
      isActive: endedFocus.isActive,
      startedAt: endedFocus.startedAt.toISOString(),
      endedAt: endedFocus.endedAt?.toISOString() || null,
      lastActivityAt: endedFocus.lastActivityAt.toISOString(),
      createdAt: endedFocus.createdAt.toISOString(),
      updatedAt: endedFocus.updatedAt.toISOString(),
    },
  });
});

export default app;
