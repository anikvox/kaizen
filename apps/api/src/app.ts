import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./lib/index.js";
import {
  healthRoutes,
  usersRoutes,
  deviceTokenRoutes,
  websiteVisitsRoutes,
  attentionRoutes,
  exportRoutes,
  settingsRoutes,
  chatsRoutes,
  focusRoutes,
  quizRoutes,
  pomodoroRoutes,
  unifiedSSERoutes,
  journeyRoutes,
  agentRoutes,
} from "./routes/index.js";

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
  }),
);

app.get("/", (c) => {
  return c.json({ message: "Kaizen API" });
});

app.route("/health", healthRoutes);
app.route("/users", usersRoutes);
// Unified SSE endpoint - single connection for all real-time events
app.route("/sse/unified", unifiedSSERoutes);
app.route("/device-tokens", deviceTokenRoutes);
app.route("/website-visits", websiteVisitsRoutes);
app.route("/attention", attentionRoutes);
app.route("/export", exportRoutes);
app.route("/settings", settingsRoutes);
app.route("/chats", chatsRoutes);
app.route("/focus", focusRoutes);
app.route("/quiz", quizRoutes);
app.route("/pomodoro", pomodoroRoutes);
app.route("/journey", journeyRoutes);
app.route("/agent", agentRoutes);

export default app;
