import { serve } from "@hono/node-server";
import { env } from "./lib/index.js";
import app from "./app.js";
import { processAllUsersSummarization } from "./lib/summarization.js";
import { processAllUsersFocus } from "./lib/focus/index.js";
import { initTelemetry } from "./lib/llm/index.js";

// Initialize OpenTelemetry for LLM tracing (must be done early)
initTelemetry();

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});

// Background job for attention summarization
// Runs frequently to check users; each user has their own interval setting
const SUMMARIZATION_CHECK_INTERVAL = 10000; // 10 seconds (to catch user intervals)

async function runSummarizationJob() {
  try {
    const result = await processAllUsersSummarization();
    // Only log when there are actual summaries generated
    if (result.totalVisitsSummarized > 0 || result.totalImagesSummarized > 0) {
      console.log(
        `[Summarization] Processed ${result.usersProcessed} users, summarized ${result.totalVisitsSummarized} visits and ${result.totalImagesSummarized} images`
      );
    }
  } catch (error) {
    console.error("[Summarization] Job failed:", error);
  }
}

// Start the summarization job
setInterval(runSummarizationJob, SUMMARIZATION_CHECK_INTERVAL);
console.log(`[Summarization] Background job started (poll interval: ${SUMMARIZATION_CHECK_INTERVAL}ms, per-user intervals apply)`);

// Background job for focus calculation
// Runs frequently to check users; each user has their own interval setting
const FOCUS_CHECK_INTERVAL = 10000; // 10 seconds (to catch 30-second user intervals)

async function runFocusJob() {
  try {
    const result = await processAllUsersFocus();
    // Only log when there are actual changes (not just skips)
    if (result.focusesCreated > 0 || result.focusesUpdated > 0 || result.focusesEnded > 0) {
      console.log(
        `[Focus] Processed ${result.usersProcessed} users: ` +
        `created ${result.focusesCreated}, updated ${result.focusesUpdated}, ended ${result.focusesEnded}` +
        (result.skippedNoNewData > 0 ? `, no-data ${result.skippedNoNewData}` : "") +
        (result.errors > 0 ? `, errors ${result.errors}` : "")
      );
    }
  } catch (error) {
    console.error("[Focus] Job failed:", error);
  }
}

// Start the focus calculation job
setInterval(runFocusJob, FOCUS_CHECK_INTERVAL);
console.log(`[Focus] Background job started (poll interval: ${FOCUS_CHECK_INTERVAL}ms, per-user intervals apply)`);
