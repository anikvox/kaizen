import type { Context, Next } from "hono";
import { verifyToken } from "@clerk/backend";

export type AuthVariables = {
  userId: string;
  clerkUserId: string;
};

export async function authMiddleware(
  c: Context<{ Variables: AuthVariables }>,
  next: Next
) {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");

  let token: string | undefined;

  if (authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7);
  } else if (queryToken) {
    token = queryToken;
  }

  if (!token) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
    await next();
  } catch (err) {
    console.error("Auth error:", err);
    return c.json({ error: "Invalid token" }, 401);
  }
}
