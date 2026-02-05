import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./lib/index.js";
import { healthRoutes, usersRoutes, sseRoutes, deviceTokenSSERoutes, deviceTokenRoutes, websiteVisitsRoutes, attentionRoutes, exportRoutes, settingsRoutes, settingsSSERoutes } from "./routes/index.js";

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: (origin) => {
      if (!origin) return env.corsOrigins[0];
      if (env.corsOrigins.includes(origin)) return origin;
      if (origin.startsWith("chrome-extension://")) return origin;
      return null;
    },
    credentials: true,
  })
);

app.get("/", (c) => {
  return c.json({ message: "Kaizen API" });
});

app.route("/health", healthRoutes);
app.route("/users", usersRoutes);
// Mount device-token SSE before general SSE to avoid auth middleware conflict
app.route("/sse/device-token", deviceTokenSSERoutes);
app.route("/sse/settings", settingsSSERoutes);
app.route("/sse", sseRoutes);
app.route("/device-tokens", deviceTokenRoutes);
app.route("/website-visits", websiteVisitsRoutes);
app.route("/attention", attentionRoutes);
app.route("/export", exportRoutes);
app.route("/settings", settingsRoutes);

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});
