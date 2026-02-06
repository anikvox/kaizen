import { serve } from "@hono/node-server";
import { env } from "./lib/index.js";
import app from "./app.js";
import { processAllUsersSummarization } from "./lib/summarization.js";

console.log(`Server running on http://localhost:${env.port}`);

serve({
  fetch: app.fetch,
  port: env.port,
});

// Background job for attention summarization
// Runs every minute to check for website visits that need summarization
const SUMMARIZATION_CHECK_INTERVAL = 60000; // 1 minute

async function runSummarizationJob() {
  try {
    const result = await processAllUsersSummarization();
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
console.log(`[Summarization] Background job started (interval: ${SUMMARIZATION_CHECK_INTERVAL}ms)`);
