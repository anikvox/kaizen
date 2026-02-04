import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./lib/index.js";
import { healthRoutes, usersRoutes, sseRoutes } from "./routes/index.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: env.corsOrigins,
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.json({ message: "Kaizen API" });
});

app.route("/health", healthRoutes);
app.route("/users", usersRoutes);
app.route("/sse", sseRoutes);

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});
