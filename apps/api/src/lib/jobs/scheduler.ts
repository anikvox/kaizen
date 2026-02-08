/**
 * Job Scheduler
 *
 * Uses croner for cron-based scheduling of recurring jobs.
 */

import { Cron } from "croner";
import type { PgBoss } from "pg-boss";
import { db } from "../db.js";
import { JOB_NAMES } from "./types.js";

const scheduledJobs: Cron[] = [];

/**
 * Schedule focus calculation jobs for all users with it enabled
 */
async function scheduleFocusCalculations(boss: PgBoss): Promise<void> {
  const users = await db.userSettings.findMany({
    where: { focusCalculationEnabled: true },
    select: {
      userId: true,
      focusCalculationIntervalMs: true,
      lastFocusCalculatedAt: true,
    },
  });

  const now = Date.now();

  for (const user of users) {
    const interval = user.focusCalculationIntervalMs || 30000;
    const lastCalc = user.lastFocusCalculatedAt?.getTime() || 0;

    if (now - lastCalc >= interval) {
      // Use singleton key to prevent duplicate jobs
      await boss.send(JOB_NAMES.FOCUS_CALCULATION, {
        userId: user.userId,
      }, {
        singletonKey: `focus-${user.userId}`,
        singletonSeconds: Math.floor(interval / 1000),
      });
    }
  }
}

/**
 * Schedule visit summarization jobs for all users with it enabled
 */
async function scheduleVisitSummarizations(boss: PgBoss): Promise<void> {
  const users = await db.userSettings.findMany({
    where: { attentionSummarizationEnabled: true },
    select: {
      userId: true,
      attentionSummarizationIntervalMs: true,
      lastSummarizationCalculatedAt: true,
    },
  });

  const now = Date.now();

  for (const user of users) {
    const interval = user.attentionSummarizationIntervalMs || 60000;
    const lastCalc = user.lastSummarizationCalculatedAt?.getTime() || 0;

    if (now - lastCalc >= interval) {
      await boss.send(JOB_NAMES.VISIT_SUMMARIZATION, {
        userId: user.userId,
      }, {
        singletonKey: `visit-summarize-${user.userId}`,
        singletonSeconds: Math.floor(interval / 1000),
      });
    }
  }
}

/**
 * Start all scheduled cron jobs
 */
export function startScheduler(boss: PgBoss): void {
  // Run focus calculations every 10 seconds
  const focusCron = new Cron("*/10 * * * * *", async () => {
    try {
      await scheduleFocusCalculations(boss);
    } catch (error) {
      console.error("[Scheduler] Error scheduling focus calculations:", error);
    }
  });
  scheduledJobs.push(focusCron);

  // Run visit summarizations every 30 seconds
  const summarizeCron = new Cron("*/30 * * * * *", async () => {
    try {
      await scheduleVisitSummarizations(boss);
    } catch (error) {
      console.error("[Scheduler] Error scheduling visit summarizations:", error);
    }
  });
  scheduledJobs.push(summarizeCron);

  console.log("[Scheduler] Started cron jobs");
}

/**
 * Stop all scheduled cron jobs
 */
export function stopScheduler(): void {
  for (const job of scheduledJobs) {
    job.stop();
  }
  scheduledJobs.length = 0;
  console.log("[Scheduler] Stopped cron jobs");
}
