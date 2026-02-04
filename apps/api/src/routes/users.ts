import { Hono } from "hono";
import { db } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: AuthVariables }>();

app.use("/*", authMiddleware);

app.get("/me", async (c) => {
  const clerkUserId = c.get("clerkUserId");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  return c.json(user);
});

app.post("/sync", async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const body = await c.req.json<{ email: string; name?: string }>();

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

  return c.json(user);
});

export default app;
