/**
 * Job Service
 *
 * API for sending jobs and querying job status using pg-boss built-in methods.
 * pg-boss manages its own schema - no raw queries needed.
 */

import type { Job } from "pg-boss";
import { getBoss, isBossRunning } from "./boss.js";
import { db } from "../db.js";
import {
  JOB_NAMES,
  type JobName,
  type JobPayload,
  type JobResult,
  type JobStatus,
  type UserJobsStatus,
  type FocusCalculationPayload,
  type QuizGenerationPayload,
  type VisitSummarizationPayload,
  type PulseGenerationPayload,
  type FocusAgentPayload,
} from "./types.js";

// Pulse generation interval: 15 minutes
const PULSE_GENERATION_INTERVAL_MS = 15 * 60 * 1000;

// Focus agent interval: 1 minute
const FOCUS_GUARDIAN_INTERVAL_MS = 60 * 1000;

/**
 * Send a focus calculation job
 */
export async function sendFocusCalculation(
  userId: string,
  force?: boolean,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.FOCUS_CALCULATION,
    { userId, force } as FocusCalculationPayload,
    {
      singletonKey: force ? undefined : `focus-${userId}`,
      singletonSeconds: force ? undefined : 10,
    },
  );
}

/**
 * Send a quiz generation job
 */
export async function sendQuizGeneration(
  userId: string,
  options?: { answerOptionsCount?: number; activityDays?: number },
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.QUIZ_GENERATION,
    { userId, ...options } as QuizGenerationPayload,
    {
      singletonKey: `quiz-${userId}`,
      singletonSeconds: 30,
    },
  );
}

/**
 * Send a visit summarization job
 */
export async function sendVisitSummarization(
  userId: string,
  visitIds?: string[],
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.VISIT_SUMMARIZATION,
    { userId, visitIds } as VisitSummarizationPayload,
    {
      singletonKey: visitIds ? undefined : `visit-summarize-${userId}`,
      singletonSeconds: visitIds ? undefined : 30,
    },
  );
}

/**
 * Send a pulse generation job
 */
export async function sendPulseGeneration(
  userId: string,
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.PULSE_GENERATION,
    { userId } as PulseGenerationPayload,
    {
      singletonKey: `pulse-${userId}`,
      singletonSeconds: 60, // Prevent duplicates within 1 minute
    },
  );
}

/**
 * Send a focus guardian job (autonomous focus guardian)
 */
export async function sendFocusGuardian(userId: string): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.FOCUS_GUARDIAN,
    { userId } as FocusAgentPayload,
    {
      singletonKey: `focus-guardian-${userId}`,
      singletonSeconds: 30, // Prevent duplicates within 30 seconds
    }
  );
}

/**
 * Cancel a job by ID
 */
export async function cancelJob(jobId: string): Promise<boolean> {
  const boss = await getBoss();
  try {
    await boss.cancel(jobId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Schedule initial recurring jobs for a user
 * Called when a new user is created or settings are first accessed
 */
export async function scheduleInitialJobs(
  userId: string,
  settings: {
    focusCalculationIntervalMs?: number | null;
    attentionSummarizationIntervalMs?: number | null;
    focusAgentIntervalMs?: number | null;
  },
): Promise<void> {
  const boss = await getBoss();

  // Always schedule focus calculation
  const focusInterval = settings.focusCalculationIntervalMs || 30000;
  await boss.send(
    JOB_NAMES.FOCUS_CALCULATION,
    { userId },
    {
      singletonKey: `focus-${userId}`,
      startAfter: Math.floor(focusInterval / 1000), // Convert ms to seconds
      singletonSeconds: Math.floor(focusInterval / 1000),
    },
  );

  // Always schedule visit summarization
  const summarizationInterval =
    settings.attentionSummarizationIntervalMs || 60000;
  await boss.send(
    JOB_NAMES.VISIT_SUMMARIZATION,
    { userId },
    {
      singletonKey: `visit-summarize-${userId}`,
      startAfter: Math.floor(summarizationInterval / 1000), // Convert ms to seconds
      singletonSeconds: Math.floor(summarizationInterval / 1000),
    },
  );

  // Schedule pulse generation (every 15 minutes)
  const pulseInterval = PULSE_GENERATION_INTERVAL_MS;
  await boss.send(
    JOB_NAMES.PULSE_GENERATION,
    { userId },
    {
      singletonKey: `pulse-${userId}`,
      startAfter: Math.floor(pulseInterval / 1000),
      singletonSeconds: Math.floor(pulseInterval / 1000),
    },
  );

  // Schedule focus guardian (configurable, default 1 minute)
  const focusGuardianInterval = settings.focusAgentIntervalMs || FOCUS_GUARDIAN_INTERVAL_MS;
  await boss.send(
    JOB_NAMES.FOCUS_GUARDIAN,
    { userId },
    {
      singletonKey: `focus-guardian-${userId}`,
      startAfter: Math.floor(focusGuardianInterval / 1000),
      singletonSeconds: Math.floor(focusGuardianInterval / 1000),
    },
  );
}

/**
 * Reschedule jobs immediately when settings change
 * Triggers immediate jobs that will self-schedule with new intervals
 */
export async function rescheduleUserJobs(
  userId: string,
  settings: {
    focusCalculationIntervalMs?: number | null;
    attentionSummarizationIntervalMs?: number | null;
    focusAgentIntervalMs?: number | null;
  },
): Promise<void> {
  const boss = await getBoss();

  // Always reschedule focus calculation
  const focusInterval = settings.focusCalculationIntervalMs || 30000;
  // Send immediate job - will self-schedule next run with new interval
  await boss.send(
    JOB_NAMES.FOCUS_CALCULATION,
    { userId, force: false },
    {
      singletonKey: `focus-${userId}`,
      startAfter: 1, // Run in 1 second (0 may cause issues)
      singletonSeconds: Math.floor(focusInterval / 1000),
    },
  );

  // Always reschedule visit summarization
  const summarizationInterval =
    settings.attentionSummarizationIntervalMs || 60000;
  // Send immediate job - will self-schedule next run with new interval
  await boss.send(
    JOB_NAMES.VISIT_SUMMARIZATION,
    { userId },
    {
      singletonKey: `visit-summarize-${userId}`,
      startAfter: 1, // Run in 1 second (0 may cause issues)
      singletonSeconds: Math.floor(summarizationInterval / 1000),
    },
  );

  // Reschedule focus guardian
  const focusGuardianInterval = settings.focusAgentIntervalMs || FOCUS_GUARDIAN_INTERVAL_MS;
  await boss.send(
    JOB_NAMES.FOCUS_GUARDIAN,
    { userId },
    {
      singletonKey: `focus-guardian-${userId}`,
      startAfter: 1, // Run in 1 second
      singletonSeconds: Math.floor(focusGuardianInterval / 1000),
    },
  );
}

/**
 * Get a job by ID using pg-boss built-in method
 */
export async function getJob(jobId: string): Promise<Job | null> {
  if (!isBossRunning()) {
    return null;
  }
  const boss = await getBoss();
  return boss.getJobById(jobId);
}

function mapJobState(state: string): JobStatus["state"] {
  switch (state) {
    case "created":
      return "created";
    case "retry":
      return "retry";
    case "active":
      return "active";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    default:
      return "created";
  }
}

function toJobStatus(job: Job): JobStatus {
  return {
    id: job.id,
    name: job.name as JobName,
    state: mapJobState(job.state),
    data: job.data as JobPayload,
    output: job.output as JobResult | undefined,
    createdOn: job.createdon,
    startedOn: job.startedon ?? undefined,
    completedOn: job.completedon ?? undefined,
    retryCount: job.retrycount,
  };
}

/**
 * Get user's job queue status
 *
 * Note: pg-boss doesn't have built-in methods to list jobs by user.
 * Job visibility is provided via SSE events (jobCreated, jobCompleted, jobFailed).
 * This returns minimal stats using pg-boss's getQueueStats().
 */
export async function getUserJobsStatus(
  userId: string,
): Promise<UserJobsStatus> {
  if (!isBossRunning()) {
    return {
      pending: [],
      active: [],
      recent: [],
      stats: {
        pendingCount: 0,
        activeCount: 0,
        completedToday: 0,
        failedToday: 0,
      },
    };
  }

  const boss = await getBoss();

  // Get queue stats for each job type (v11+ API)
  const [focusStats, quizStats, summarizeStats] = await Promise.all([
    boss.getQueueStats(JOB_NAMES.FOCUS_CALCULATION),
    boss.getQueueStats(JOB_NAMES.QUIZ_GENERATION),
    boss.getQueueStats(JOB_NAMES.VISIT_SUMMARIZATION),
  ]);

  const pendingCount =
    (focusStats?.queuedCount ?? 0) +
    (quizStats?.queuedCount ?? 0) +
    (summarizeStats?.queuedCount ?? 0);
  const activeCount =
    (focusStats?.activeCount ?? 0) +
    (quizStats?.activeCount ?? 0) +
    (summarizeStats?.activeCount ?? 0);

  // pg-boss doesn't expose per-user job lists via its API
  // Clients should track job IDs from SSE events or job creation responses
  return {
    pending: [],
    active: [],
    recent: [],
    stats: {
      pendingCount,
      activeCount,
      completedToday: 0,
      failedToday: 0,
    },
  };
}

/**
 * Get global queue statistics using pg-boss built-in methods
 */
export async function getQueueStats(): Promise<{
  created: number;
  retry: number;
  active: number;
  completed: number;
  failed: number;
  all: number;
}> {
  if (!isBossRunning()) {
    return {
      created: 0,
      retry: 0,
      active: 0,
      completed: 0,
      failed: 0,
      all: 0,
    };
  }

  const boss = await getBoss();

  // Get queue stats for each job type (v11+ API)
  const [focusStats, quizStats, summarizeStats] = await Promise.all([
    boss.getQueueStats(JOB_NAMES.FOCUS_CALCULATION),
    boss.getQueueStats(JOB_NAMES.QUIZ_GENERATION),
    boss.getQueueStats(JOB_NAMES.VISIT_SUMMARIZATION),
  ]);

  const created =
    (focusStats?.queuedCount ?? 0) +
    (quizStats?.queuedCount ?? 0) +
    (summarizeStats?.queuedCount ?? 0);
  const active =
    (focusStats?.activeCount ?? 0) +
    (quizStats?.activeCount ?? 0) +
    (summarizeStats?.activeCount ?? 0);
  const total =
    (focusStats?.totalCount ?? 0) +
    (quizStats?.totalCount ?? 0) +
    (summarizeStats?.totalCount ?? 0);

  return {
    created,
    retry: 0,
    active,
    completed: 0,
    failed: 0,
    all: total,
  };
}

/**
 * Schedule jobs for all users on server startup
 * Ensures recurring jobs are running for all users after server restart
 */
export async function scheduleAllUserJobs(): Promise<void> {
  console.log("[Jobs] Scheduling jobs for all users...");

  // Get all users
  const users = await db.userSettings.findMany({
    select: {
      userId: true,
      focusCalculationIntervalMs: true,
      attentionSummarizationIntervalMs: true,
      focusAgentIntervalMs: true,
    },
  });

  console.log(`[Jobs] Found ${users.length} users to schedule`);

  const boss = await getBoss();
  let scheduled = 0;

  for (const user of users) {
    try {
      const focusInterval = user.focusCalculationIntervalMs || 30000;
      const summarizationInterval =
        user.attentionSummarizationIntervalMs || 60000;
      const pulseInterval = PULSE_GENERATION_INTERVAL_MS;

      // Schedule focus calculation
      await boss.send(
        JOB_NAMES.FOCUS_CALCULATION,
        { userId: user.userId },
        {
          singletonKey: `focus-${user.userId}`,
          startAfter: Math.floor(focusInterval / 1000), // Convert ms to seconds
          singletonSeconds: Math.floor(focusInterval / 1000),
        },
      );

      // Schedule visit summarization
      await boss.send(
        JOB_NAMES.VISIT_SUMMARIZATION,
        { userId: user.userId },
        {
          singletonKey: `visit-summarize-${user.userId}`,
          startAfter: Math.floor(summarizationInterval / 1000), // Convert ms to seconds
          singletonSeconds: Math.floor(summarizationInterval / 1000),
        },
      );

      // Schedule pulse generation
      await boss.send(
        JOB_NAMES.PULSE_GENERATION,
        { userId: user.userId },
        {
          singletonKey: `pulse-${user.userId}`,
          startAfter: Math.floor(pulseInterval / 1000),
          singletonSeconds: Math.floor(pulseInterval / 1000),
        },
      );

      // Schedule focus guardian
      const focusGuardianInterval = user.focusAgentIntervalMs || FOCUS_GUARDIAN_INTERVAL_MS;
      await boss.send(JOB_NAMES.FOCUS_GUARDIAN, { userId: user.userId }, {
        singletonKey: `focus-guardian-${user.userId}`,
        startAfter: Math.floor(focusGuardianInterval / 1000),
        singletonSeconds: Math.floor(focusGuardianInterval / 1000),
      });

      scheduled++;
    } catch (error) {
      console.error(
        `[Jobs] Failed to schedule jobs for user ${user.userId}:`,
        error,
      );
    }
  }

  console.log(`[Jobs] Scheduled jobs for ${scheduled}/${users.length} users`);
}

// Re-export for convenience
export { toJobStatus };
