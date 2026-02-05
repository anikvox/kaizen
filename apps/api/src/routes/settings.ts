import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, events } from "../lib/index.js";
import { authMiddleware, deviceAuthMiddleware, type AuthVariables, type DeviceAuthVariables } from "../middleware/index.js";

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

// Get current user settings (supports both Clerk and device token auth)
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  let settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Create default settings if they don't exist
  if (!settings) {
    settings = await db.userSettings.create({
      data: {
        userId,
        cognitiveAttentionDebugMode: false,
        cognitiveAttentionShowOverlay: false,
      },
    });
  }

  return c.json({
    cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
    cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
  });
});

// Update user settings (supports both Clerk and device token auth)
app.post("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json<{
    cognitiveAttentionDebugMode?: boolean;
    cognitiveAttentionShowOverlay?: boolean;
  }>();

  const settings = await db.userSettings.upsert({
    where: { userId },
    update: {
      ...(body.cognitiveAttentionDebugMode !== undefined && {
        cognitiveAttentionDebugMode: body.cognitiveAttentionDebugMode,
      }),
      ...(body.cognitiveAttentionShowOverlay !== undefined && {
        cognitiveAttentionShowOverlay: body.cognitiveAttentionShowOverlay,
      }),
    },
    create: {
      userId,
      cognitiveAttentionDebugMode: body.cognitiveAttentionDebugMode ?? false,
      cognitiveAttentionShowOverlay: body.cognitiveAttentionShowOverlay ?? false,
    },
  });

  // Emit settings changed event for SSE subscribers
  events.emitSettingsChanged({
    userId,
    settings: {
      cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
      cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
    },
  });

  return c.json({
    cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
    cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
  });
});

export default app;

// Separate app for settings SSE (supports both device token and Clerk auth via query param)
export const settingsSSE = new Hono();

settingsSSE.get("/", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  let userId: string;
  let isDeviceToken = false;

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: { include: { settings: true } } },
  });

  if (deviceToken) {
    userId = deviceToken.user.id;
    isDeviceToken = true;
  } else {
    // Try Clerk auth
    try {
      const { verifyToken } = await import("@clerk/backend");
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const user = await db.user.findUnique({
        where: { clerkId: payload.sub },
        include: { settings: true },
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

    // Get or create settings
    let settings = await db.userSettings.findUnique({
      where: { userId },
    });

    if (!settings) {
      settings = await db.userSettings.create({
        data: {
          userId,
          cognitiveAttentionDebugMode: false,
          cognitiveAttentionShowOverlay: false,
        },
      });
    }

    // Send initial connection with current settings
    await stream.writeSSE({
      data: JSON.stringify({
        connected: true,
        settings: {
          cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
          cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
        },
      }),
      event: "connected",
      id: String(id++),
    });

    // Listen for settings change events
    const cleanup = events.onSettingsChanged(async (data) => {
      // Only send if this user's settings changed
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data.settings),
          event: "settings-changed",
          id: String(id++),
        });
      }
    });

    // Also listen for device token revocation (only relevant for device token auth)
    const cleanupRevoked = isDeviceToken
      ? events.onDeviceTokenRevoked(async (data) => {
          if (data.token === token) {
            await stream.writeSSE({
              data: JSON.stringify({ revoked: true }),
              event: "device-token-revoked",
              id: String(id++),
            });
          }
        })
      : () => {};

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
      cleanup();
      if (typeof cleanupRevoked === "function") {
        cleanupRevoked();
      }
    }
  });
});
