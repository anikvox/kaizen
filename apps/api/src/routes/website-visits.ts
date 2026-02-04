import { Hono } from "hono";
import { db } from "../lib/index.js";
import { deviceAuthMiddleware, type DeviceAuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: DeviceAuthVariables }>();

// Record website opened event
app.post("/opened", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    title: string;
    metadata: Record<string, string>;
    referrer: string | null;
    timestamp: number;
  }>();

  const openedAt = new Date(body.timestamp);

  const visit = await db.websiteVisit.create({
    data: {
      url: body.url,
      title: body.title,
      metadata: body.metadata,
      openedAt,
      referrer: body.referrer,
      userId,
    },
  });

  return c.json(visit);
});

// Update active time
app.post("/active-time", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    activeTime: number;
    timestamp: number;
  }>();

  // Find the most recent unclosed visit for this URL
  const visit = await db.websiteVisit.findFirst({
    where: {
      userId,
      url: body.url,
      closedAt: null,
    },
    orderBy: {
      openedAt: "desc",
    },
  });

  if (!visit) {
    return c.json({ error: "No active visit found" }, 404);
  }

  const updated = await db.websiteVisit.update({
    where: { id: visit.id },
    data: {
      activeTime: body.activeTime,
    },
  });

  return c.json(updated);
});

// Record website closed event
app.post("/closed", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json<{
    url: string;
    activeTime: number;
    timestamp: number;
  }>();

  const closedAt = new Date(body.timestamp);

  // Find the most recent unclosed visit for this URL
  const visit = await db.websiteVisit.findFirst({
    where: {
      userId,
      url: body.url,
      closedAt: null,
    },
    orderBy: {
      openedAt: "desc",
    },
  });

  if (!visit) {
    return c.json({ error: "No active visit found" }, 404);
  }

  const updated = await db.websiteVisit.update({
    where: { id: visit.id },
    data: {
      closedAt,
      activeTime: body.activeTime,
    },
  });

  return c.json(updated);
});

// List all website visits for the current user
app.get("/", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const limit = Number(c.req.query("limit")) || 100;
  const offset = Number(c.req.query("offset")) || 0;

  const visits = await db.websiteVisit.findMany({
    where: { userId },
    orderBy: { openedAt: "desc" },
    take: limit,
    skip: offset,
  });

  return c.json(visits);
});

// Get a specific website visit
app.get("/:id", deviceAuthMiddleware, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  const visit = await db.websiteVisit.findFirst({
    where: { id, userId },
  });

  if (!visit) {
    return c.json({ error: "Visit not found" }, 404);
  }

  return c.json(visit);
});

export default app;
