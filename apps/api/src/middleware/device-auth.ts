import type { Context, Next } from "hono";
import { db } from "../lib/index.js";

export type DeviceAuthVariables = {
  userId: string;
  deviceTokenId: string;
};

export async function deviceAuthMiddleware(
  c: Context<{ Variables: DeviceAuthVariables }>,
  next: Next
) {
  const authHeader = c.req.header("Authorization");

  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const deviceToken = await db.deviceToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!deviceToken) {
      return c.json({ error: "Invalid device token" }, 401);
    }

    // Update last used timestamp
    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() },
    });

    c.set("userId", deviceToken.user.id);
    c.set("deviceTokenId", deviceToken.id);
    await next();
  } catch (err) {
    console.error("Device auth error:", err);
    return c.json({ error: "Invalid token" }, 401);
  }
}
