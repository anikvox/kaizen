import { serve } from "@hono/node-server";
import { env } from "./lib/index.js";
import app from "./app.js";
import { initTelemetry } from "./lib/llm/index.js";
import { startBoss, stopBoss, registerHandlers, scheduleAllUserJobs } from "./lib/jobs/index.js";

// Initialize telemetry for LLM tracing (async, runs in background)
initTelemetry().catch((err) => console.warn("[Telemetry] Init failed:", err));

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});

// Initialize and start the job queue
async function initJobs() {
  try {
    const boss = await startBoss();
    await registerHandlers(boss);
    console.log("[Jobs] pg-boss initialized with self-scheduling jobs");

    // Schedule jobs for all existing users on startup
    await scheduleAllUserJobs();
  } catch (error) {
    console.error("[Jobs] Failed to initialize:", error);
  }
}

initJobs();

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Shutting down...");
  await stopBoss();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Shutting down...");
  await stopBoss();
  process.exit(0);
});
