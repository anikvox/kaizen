import { serve } from "@hono/node-server";
import { env } from "./lib/index.js";
import app from "./app.js";
import { initTelemetry } from "./lib/llm/index.js";
import { startWorker, registerAllHandlers } from "./lib/task-queue/index.js";

// Initialize telemetry for LLM tracing (async, runs in background)
initTelemetry().catch((err) => console.warn("[Telemetry] Init failed:", err));

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});

// Initialize and start the task queue worker
// This replaces the old setInterval-based background jobs
registerAllHandlers();
startWorker();
console.log("[TaskQueue] Worker initialized and started");
