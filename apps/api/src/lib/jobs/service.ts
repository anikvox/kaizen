/**
 * Job Service
 *
 * API for sending jobs and querying job status using pg-boss built-in methods.
 * pg-boss manages its own schema - no raw queries needed.
 */

import type { Job } from "pg-boss";
import { getBoss, isBossRunning } from "./boss.js";
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
} from "./types.js";

/**
 * Send a focus calculation job
 */
export async function sendFocusCalculation(
  userId: string,
  force?: boolean
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(JOB_NAMES.FOCUS_CALCULATION, { userId, force } as FocusCalculationPayload, {
    singletonKey: force ? undefined : `focus-${userId}`,
    singletonSeconds: force ? undefined : 10,
  });
}

/**
 * Send a quiz generation job
 */
export async function sendQuizGeneration(
  userId: string,
  options?: { answerOptionsCount?: number; activityDays?: number }
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.QUIZ_GENERATION,
    { userId, ...options } as QuizGenerationPayload,
    {
      singletonKey: `quiz-${userId}`,
      singletonSeconds: 30,
    }
  );
}

/**
 * Send a visit summarization job
 */
export async function sendVisitSummarization(
  userId: string,
  visitIds?: string[]
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.VISIT_SUMMARIZATION,
    { userId, visitIds } as VisitSummarizationPayload,
    {
      singletonKey: visitIds ? undefined : `visit-summarize-${userId}`,
      singletonSeconds: visitIds ? undefined : 30,
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
export async function getUserJobsStatus(userId: string): Promise<UserJobsStatus> {
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

// Re-export for convenience
export { toJobStatus };
