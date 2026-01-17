import { computeFocusForLastHours } from "./inference";
import { createTrace } from "./opik";

const FOCUS_INTERVAL_MS = 5 * 60 * 1000; // Compute focus every 5 minutes
const FOCUS_WINDOW_HOURS = 1; // Analyze the last 1 hour of attention data

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Runs a single focus computation cycle
 */
async function runFocusCycle(): Promise<void> {
  if (isRunning) {
    console.log("[Scheduler] Previous focus computation still running, skipping...");
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  // Create a trace for the scheduled cycle
  const trace = createTrace({
    name: "scheduledFocusCycle",
    tags: ["kaizen", "scheduler", "background"],
    metadata: {
      intervalMs: FOCUS_INTERVAL_MS,
      windowHours: FOCUS_WINDOW_HOURS,
      scheduledAt: new Date().toISOString(),
    },
  });

  try {
    console.log("[Scheduler] Starting focus computation...");
    const result = await computeFocusForLastHours(FOCUS_WINDOW_HOURS);
    const duration = Date.now() - startTime;

    console.log(
      `[Scheduler] Focus computed: score=${result.score}, category=${result.category} (took ${duration}ms)`
    );

    // Update trace with successful result
    trace.update({
      output: {
        ...result,
        durationMs: duration,
      },
    });
    trace.end();
  } catch (error) {
    console.error("[Scheduler] Error computing focus:", error);

    // Update trace with error
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { error: true },
    });
    trace.end();
  } finally {
    isRunning = false;
  }
}

/**
 * Starts the background focus computation scheduler
 */
export function startFocusScheduler(): void {
  if (schedulerInterval) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log(
    `[Scheduler] Starting focus scheduler (interval: ${FOCUS_INTERVAL_MS / 1000}s, window: ${FOCUS_WINDOW_HOURS}h)`
  );

  // Run immediately on start
  runFocusCycle();

  // Then run at regular intervals
  schedulerInterval = setInterval(runFocusCycle, FOCUS_INTERVAL_MS);
}

/**
 * Stops the background focus computation scheduler
 */
export function stopFocusScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[Scheduler] Focus scheduler stopped");
  }
}

/**
 * Returns whether the scheduler is currently active
 */
export function isSchedulerRunning(): boolean {
  return schedulerInterval !== null;
}

/**
 * Gets the scheduler configuration
 */
export function getSchedulerConfig() {
  return {
    intervalMs: FOCUS_INTERVAL_MS,
    windowHours: FOCUS_WINDOW_HOURS,
    isRunning: isSchedulerRunning(),
  };
}
