import { Hono } from "hono";
import { db } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";
import { scheduleInitialJobs } from "../lib/jobs/index.js";

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
      console.log(`[Users] Scheduled initial jobs for new user ${user.id} (${body.email})`);
    } catch (error) {
      console.error("[Users] Failed to schedule initial jobs:", error);
      // Don't fail user creation if job scheduling fails
    }
  }

  return c.json(user);
});

export default app;
