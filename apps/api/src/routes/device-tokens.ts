import { Hono } from "hono";
import { db, events } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";
import { randomBytes } from "crypto";

const app = new Hono<{ Variables: AuthVariables }>();

// Generate a secure random token
function generateToken(): string {
  return randomBytes(32).toString("hex");
}

// Create a new device token (requires Clerk auth)
app.post("/", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const body = await c.req.json<{ name: string }>();

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const token = generateToken();

  const deviceToken = await db.deviceToken.create({
    data: {
      token,
      name: body.name || "Chrome Extension",
      userId: user.id,
    },
  });

  // Emit event for SSE subscribers
  events.emitDeviceListChanged({
    userId: user.id,
    action: "created",
    deviceId: deviceToken.id,
  });

  return c.json({
    id: deviceToken.id,
    token: deviceToken.token,
    name: deviceToken.name,
    createdAt: deviceToken.createdAt,
  });
});

// List all device tokens for current user (requires Clerk auth)
app.get("/", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const tokens = await db.deviceToken.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return c.json(tokens);
});

// Delete a device token (requires Clerk auth)
app.delete("/:id", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const tokenId = c.req.param("id");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const deviceToken = await db.deviceToken.findFirst({
    where: { id: tokenId, userId: user.id },
  });

  if (!deviceToken) {
    return c.json({ error: "Device token not found" }, 404);
  }

  await db.deviceToken.delete({
    where: { id: tokenId },
  });

  // Emit events for SSE subscribers
  events.emitDeviceTokenRevoked({
    token: deviceToken.token,
    userId: user.id,
  });
  events.emitDeviceListChanged({
    userId: user.id,
    action: "deleted",
    deviceId: tokenId,
  });

  return c.json({ success: true });
});

// Revoke a device token by its token value (used by extension to unlink itself)
app.post("/revoke", async (c) => {
  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    return c.json({ error: "Token required" }, 400);
  }

  const deviceToken = await db.deviceToken.findUnique({
    where: { token: body.token },
  });

  if (!deviceToken) {
    return c.json({ error: "Invalid token" }, 401);
  }

  await db.deviceToken.delete({
    where: { id: deviceToken.id },
  });

  // Emit events for SSE subscribers
  events.emitDeviceTokenRevoked({
    token: deviceToken.token,
    userId: deviceToken.userId,
  });
  events.emitDeviceListChanged({
    userId: deviceToken.userId,
    action: "deleted",
    deviceId: deviceToken.id,
  });

  return c.json({ success: true });
});

// Verify a device token and get user info (used by extension)
app.post("/verify", async (c) => {
  const body = await c.req.json<{ token: string }>();

  if (!body.token) {
    return c.json({ error: "Token required" }, 400);
  }

  const deviceToken = await db.deviceToken.findUnique({
    where: { token: body.token },
    include: { user: true },
  });

  if (!deviceToken) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // Update last used timestamp
  await db.deviceToken.update({
    where: { id: deviceToken.id },
    data: { lastUsedAt: new Date() },
  });

  return c.json({
    user: {
      id: deviceToken.user.id,
      email: deviceToken.user.email,
      name: deviceToken.user.name,
    },
  });
});

export default app;
