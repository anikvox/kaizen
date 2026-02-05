import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";
import { db, events } from "../lib/index.js";

const app = new Hono<{ Variables: AuthVariables }>();

app.use("/*", authMiddleware);

app.get("/", async (c) => {
  return streamSSE(c, async (stream) => {
    let id = 0;
    while (true) {
      await stream.writeSSE({
        data: JSON.stringify({ time: new Date().toISOString() }),
        event: "tick",
        id: String(id++),
      });
      await stream.sleep(1000);
    }
  });
});

// SSE endpoint for device list changes (requires Clerk auth)
app.get("/devices", async (c) => {
  const clerkUserId = c.get("clerkUserId");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Send initial connection confirmation
    await stream.writeSSE({
      data: JSON.stringify({ connected: true }),
      event: "connected",
      id: String(id++),
    });

    // Listen for device list change events
    const cleanup = events.onDeviceListChanged(async (data) => {
      if (data.userId === user.id) {
        await stream.writeSSE({
          data: JSON.stringify({ action: data.action, deviceId: data.deviceId }),
          event: "device-list-changed",
          id: String(id++),
        });
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
      cleanup();
    }
  });
});

export default app;

// Separate app for device token SSE (uses device token auth instead of Clerk)
export const deviceTokenSSE = new Hono();

deviceTokenSSE.get("/", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  // Verify the device token
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!deviceToken) {
    return c.json({ error: "Invalid token" }, 401);
  }

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Send initial connection confirmation with user info
    await stream.writeSSE({
      data: JSON.stringify({
        connected: true,
        user: {
          id: deviceToken.user.id,
          email: deviceToken.user.email,
          name: deviceToken.user.name,
        },
      }),
      event: "connected",
      id: String(id++),
    });

    // Update last used timestamp
    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() },
    });

    // Listen for device token revocation events
    const cleanup = events.onDeviceTokenRevoked(async (data) => {
      // Only send if this token was revoked
      if (data.token === token) {
        await stream.writeSSE({
          data: JSON.stringify({ token: data.token }),
          event: "device-token-revoked",
          id: String(id++),
        });
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
        await stream.sleep(30000); // Ping every 30 seconds
      }
    } finally {
      cleanup();
    }
  });
});
