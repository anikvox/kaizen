import { Hono } from "hono";
import { db } from "../lib/index.js";

const app = new Hono();

app.get("/", async (c) => {
  try {
    await db.$queryRaw`SELECT 1`;
    return c.json({ status: "ok", db: "connected" });
  } catch {
    return c.json({ status: "ok", db: "disconnected" }, 200);
  }
});

export default app;
