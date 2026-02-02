import { processFocusSession } from "./focus";
import { createTrace } from "./opik";
import { prisma } from "./prisma";

// Task intervals
const FOCUS_INTERVAL_MS = 5 * 1000; // Process focus sessions every 5s

let focusInterval: NodeJS.Timeout | null = null;
let isFocusRunning = false;

/**
 * Gets all users who have had activity in the specified time window
 */
async function getUsersWithRecentActivity(windowHours: number): Promise<string[]> {
  const windowStart = new Date(Date.now() - windowHours * 60 * 60 * 1000);

  // Get unique user IDs from all activity types within the window
  const [websiteUsers, textUsers, imageUsers, youtubeUsers, audioUsers] = await Promise.all([
    prisma.websiteVisit.findMany({
      where: { openedAt: { gte: windowStart } },
      select: { userId: true },
      distinct: ["userId"],
    }),
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
      where: { timestamp: { gte: windowStart } },
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
    ...websiteUsers.map((u) => u.userId),
    ...textUsers.map((u) => u.userId),
    ...imageUsers.map((u) => u.userId),
    ...youtubeUsers.map((u) => u.userId),
    ...audioUsers.map((u) => u.userId),
  ]);

  return Array.from(allUserIds);
}

// Track last calculation timestamps for each user
const lastFocusCalculation = new Map<string, number>();

/**
 * Runs a focus detection cycle for all active users
 */
async function runFocusCycle(): Promise<void> {
  if (isFocusRunning) {
    console.log("[Scheduler:Focus] Previous cycle still running, skipping...");
    return;
  }

  isFocusRunning = true;
  const startTime = Date.now();

  const trace = createTrace({
    name: "scheduledFocusCycle",
    tags: ["kaizen", "scheduler", "focus"],
    metadata: {
      intervalMs: FOCUS_INTERVAL_MS,
      scheduledAt: new Date().toISOString(),
    },
  });

  try {
    console.log("[Scheduler:Focus] Starting focus detection...");

    // Get all users with recent activity (last 1 hour)
    // Note: This is just to find active users - processFocusSession will fetch activity
    // from each user's last focus update timestamp, not from this window
    const userIds = await getUsersWithRecentActivity(1); // 1 hour

    if (userIds.length === 0) {
      console.log("[Scheduler:Focus] No users with recent activity, skipping...");
      trace.update({
        output: { skipped: true, reason: "No users with recent activity" },
      });
      trace.end();
      return;
    }

    console.log(
      `[Scheduler:Focus] Processing focus for ${userIds.length} user(s)...`
    );

    // Process focus for each user with last calculation timestamp
    const results = await Promise.allSettled(
      userIds.map((userId) => {
        const lastCalc = lastFocusCalculation.get(userId);
        return processFocusSession(userId, lastCalc).then((result) => {
          // Update last calculation timestamp for this user
          lastFocusCalculation.set(userId, Date.now());
          return result;
        });
      })
    );

    const duration = Date.now() - startTime;
    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    // Count actions
    const actions = results
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<any>).value.action);
    const created = actions.filter((a) => a === "created").length;
    const updated = actions.filter((a) => a === "updated").length;
    const closed = actions.filter((a) => a === "closed").length;
    const noActivity = actions.filter((a) => a === "no_activity").length;

    console.log(
      `[Scheduler:Focus] Completed: ${successCount} users (${created} created, ${updated} updated, ${closed} closed, ${noActivity} no activity), ${failureCount} failures (took ${duration}ms)`
    );

    trace.update({
      output: {
        userCount: userIds.length,
        successCount,
        failureCount,
        created,
        updated,
        closed,
        noActivity,
        durationMs: duration,
      },
    });
    trace.end();
  } catch (error) {
    console.error("[Scheduler:Focus] Error:", error);
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { error: true },
    });
    trace.end();
  } finally {
    isFocusRunning = false;
  }
}


/**
 * Starts the background scheduler
 */
export function startFocusScheduler(): void {
  if (focusInterval) {
    console.log("[Scheduler] Already running");
    return;
  }

  console.log(
    `[Scheduler] Starting scheduler:
  - Focus detection: every ${FOCUS_INTERVAL_MS / 1000}s`
  );

  // Run immediately on start
  runFocusCycle();

  // Then run at regular intervals
  focusInterval = setInterval(runFocusCycle, FOCUS_INTERVAL_MS);
}

/**
 * Stops the background scheduler
 */
export function stopFocusScheduler(): void {
  if (focusInterval) {
    clearInterval(focusInterval);
    focusInterval = null;
    console.log("[Scheduler] Focus scheduler stopped");
  }
}

/**
 * Returns whether the scheduler is currently active
 */
export function isSchedulerRunning(): boolean {
  return focusInterval !== null;
}

/**
 * Gets the scheduler configuration
 */
export function getSchedulerConfig() {
  return {
    focus: {
      intervalMs: FOCUS_INTERVAL_MS,
      isRunning: focusInterval !== null,
    },
  };
}
