import { computeFocusForLastHours } from "./inference";
import { createTrace } from "./opik";
import { prisma } from "./prisma";

const FOCUS_INTERVAL_MS = 5 * 60 * 1000; // Compute focus every 5 minutes
const FOCUS_WINDOW_HOURS = 1; // Analyze the last 1 hour of attention data

let schedulerInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Gets all users who have had activity in the specified time window
 */
async function getUsersWithRecentActivity(windowHours: number): Promise<string[]> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Get unique user IDs from all activity types within the window
  const [textUsers, imageUsers, youtubeUsers, audioUsers] = await Promise.all([
    prisma.textAttention.findMany({
      where: { timestamp: { gte: windowStart } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.imageAttention.findMany({
      where: { timestamp: { gte: windowStart } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.youtubeAttention.findMany({
      where: { watchedAt: { gte: windowStart } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.audioAttention.findMany({
      where: { timestamp: { gte: windowStart } },
      select: { userId: true },
      distinct: ["userId"],
    }),
  ]);

  // Combine and deduplicate user IDs
  const allUserIds = new Set([
    ...textUsers.map((u) => u.userId),
    ...imageUsers.map((u) => u.userId),
    ...youtubeUsers.map((u) => u.userId),
    ...audioUsers.map((u) => u.userId),
  ]);

  return Array.from(allUserIds);
}

/**
 * Runs a single focus computation cycle for all active users
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
    
    // Get all users with recent activity
    const userIds = await getUsersWithRecentActivity(FOCUS_WINDOW_HOURS);
    
    if (userIds.length === 0) {
      console.log("[Scheduler] No users with recent activity, skipping...");
      trace.update({
        output: { skipped: true, reason: "No users with recent activity" },
      });
      trace.end();
      return;
    }

    console.log(`[Scheduler] Computing focus for ${userIds.length} user(s)...`);
    
    // Compute focus for each user
    const results = await Promise.allSettled(
      userIds.map((userId) => computeFocusForLastHours(FOCUS_WINDOW_HOURS, userId))
    );

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    console.log(
      `[Scheduler] Focus computed for ${successCount} users, ${failureCount} failures (took ${duration}ms)`
    );

    // Update trace with successful result
    trace.update({
      output: {
        userCount: userIds.length,
        successCount,
        failureCount,
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
