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
  type SummarizationPayload,
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
 * Send a summarization job
 */
export async function sendSummarization(
  userId: string,
  visitIds?: string[]
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(
    JOB_NAMES.SUMMARIZATION,
    { userId, visitIds } as SummarizationPayload,
    {
      singletonKey: visitIds ? undefined : `summarize-${userId}`,
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
 * This returns minimal stats using pg-boss's getQueueSize().
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

  // Get queue sizes for each job type
  const [focusSize, quizSize, summarizeSize] = await Promise.all([
    boss.getQueueSize(JOB_NAMES.FOCUS_CALCULATION),
    boss.getQueueSize(JOB_NAMES.QUIZ_GENERATION),
    boss.getQueueSize(JOB_NAMES.SUMMARIZATION),
  ]);

  // pg-boss doesn't expose per-user job lists via its API
  // Clients should track job IDs from SSE events or job creation responses
  return {
    pending: [],
    active: [],
    recent: [],
    stats: {
      pendingCount: focusSize + quizSize + summarizeSize,
      activeCount: 0, // Would need raw query to get this
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

  // Get queue sizes for each job type
  const [focusSize, quizSize, summarizeSize] = await Promise.all([
    boss.getQueueSize(JOB_NAMES.FOCUS_CALCULATION),
    boss.getQueueSize(JOB_NAMES.QUIZ_GENERATION),
    boss.getQueueSize(JOB_NAMES.SUMMARIZATION),
  ]);

  const total = focusSize + quizSize + summarizeSize;

  return {
    created: total,
    retry: 0,
    active: 0,
    completed: 0,
    failed: 0,
    all: total,
  };
}

// Re-export for convenience
export { toJobStatus };
