import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./lib/index.js";
import { healthRoutes, usersRoutes, sseRoutes, deviceTokenSSERoutes, deviceTokenRoutes, websiteVisitsRoutes, attentionRoutes, exportRoutes, settingsRoutes, settingsSSERoutes, chatsRoutes, chatSSERoutes, focusRoutes, focusSSERoutes, quizRoutes, tasksRoutes, tasksSSERoutes } from "./routes/index.js";

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
// Mount SSE routes before general routes to avoid auth middleware conflicts
app.route("/sse/device-token", deviceTokenSSERoutes);
app.route("/sse/settings", settingsSSERoutes);
app.route("/sse/chats", chatSSERoutes);
app.route("/sse/focus", focusSSERoutes);
app.route("/sse/tasks", tasksSSERoutes);
app.route("/sse", sseRoutes);
app.route("/device-tokens", deviceTokenRoutes);
app.route("/website-visits", websiteVisitsRoutes);
app.route("/attention", attentionRoutes);
app.route("/export", exportRoutes);
app.route("/settings", settingsRoutes);
app.route("/chats", chatsRoutes);
app.route("/focus", focusRoutes);
app.route("/quiz", quizRoutes);
app.route("/tasks", tasksRoutes);

export default app;
