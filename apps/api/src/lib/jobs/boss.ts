/**
 * pg-boss Job Queue Setup
 *
 * Centralized job queue using pg-boss for reliable background job processing.
 */

import PgBoss from "pg-boss";
import { env } from "../env.js";
import { JOB_NAMES } from "./types.js";

let boss: PgBoss | null = null;
let started = false;

/**
 * Get or create the pg-boss instance
 */
export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;

  boss = new PgBoss({
    connectionString: env.databaseUrl,
    // Archive completed jobs after 1 hour
    archiveCompletedAfterSeconds: 3600,
    // Keep archived jobs for 7 days
    deleteAfterDays: 7,
    // Retry failed jobs with exponential backoff
    retryBackoff: true,
    retryLimit: 3,
    // Monitor interval
    monitorStateIntervalSeconds: 30,
  });

  boss.on("error", (error) => {
    console.error("[pg-boss] Error:", error);
  });

  return boss;
}

/**
 * Start pg-boss worker and create queues
 * Assumes schema migrations have been run via `pnpm jobs:migrate`
 */
export async function startBoss(): Promise<PgBoss> {
  const instance = await getBoss();

  await instance.start();
  console.log("[pg-boss] Started");

  // Create queues (idempotent - safe to call if already exists)
  await Promise.all([
    instance.createQueue(JOB_NAMES.FOCUS_CALCULATION),
    instance.createQueue(JOB_NAMES.QUIZ_GENERATION),
    instance.createQueue(JOB_NAMES.SUMMARIZATION),
  ]);
  console.log("[pg-boss] Queues ready");

  started = true;
  return instance;
}

/**
 * Stop the pg-boss worker gracefully
 */
export async function stopBoss(): Promise<void> {
  if (boss) {
    await boss.stop({ graceful: true });
    boss = null;
    started = false;
    console.log("[pg-boss] Stopped");
  }
}

/**
 * Check if boss is running
 */
export function isBossRunning(): boolean {
  return started;
}

export { PgBoss };
