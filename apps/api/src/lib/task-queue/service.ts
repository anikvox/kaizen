/**
 * Task Queue Service
 *
 * Core service for managing the persistent per-user task queue.
 * Handles task creation, scheduling, and lifecycle management.
 */

import { Prisma } from "@prisma/client";
import { db } from "../db.js";
import {
  TASK_TYPES,
  TASK_STATUS,
  TASK_CONFIG,
  WORKER_CONFIG,
  type TaskType,
  type TaskStatus,
  type TaskPayload,
  type TaskResult,
  type TaskPriority,
  type CreateTaskInput,
  type TaskQueueItem,
  type TaskHistoryItem,
  type QueueStats,
  type UserQueueStatus,
} from "./types.js";
import { events } from "../events.js";

// ============================================================================
// Task Creation
// ============================================================================

/**
 * Push a new task to the queue for a user
 */
export async function pushTask(input: CreateTaskInput): Promise<TaskQueueItem> {
  const config = TASK_CONFIG[input.type];

  // Check if multiple pending tasks are allowed
  if (!config.allowMultiplePending) {
    const existingPending = await db.taskQueue.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] },
      },
    });

    if (existingPending) {
      // Return existing task instead of creating duplicate
      return existingPending as TaskQueueItem;
    }
  }

  const task = await db.taskQueue.create({
    data: {
      userId: input.userId,
      type: input.type,
      payload: (input.payload || {}) as object,
      priority: input.priority ?? config.defaultPriority,
      scheduledFor: input.scheduledFor || new Date(),
      maxAttempts: config.maxAttempts,
      status: TASK_STATUS.PENDING,
    },
  });

  // Emit event
  emitTaskChange(input.userId, task.id, input.type, TASK_STATUS.PENDING, "created");

  return task as TaskQueueItem;
}

/**
 * Schedule a recurring task for a user (ensures only one pending at a time)
 */
export async function scheduleRecurringTask(
  userId: string,
  type: TaskType,
  payload?: TaskPayload
): Promise<TaskQueueItem | null> {
  const config = TASK_CONFIG[type];

  // Check if there's already a pending or processing task
  const existing = await db.taskQueue.findFirst({
    where: {
      userId,
      type,
      status: { in: [TASK_STATUS.PENDING, TASK_STATUS.PROCESSING] },
    },
  });

  if (existing) {
    return null; // Already scheduled
  }

  return pushTask({
    userId,
    type,
    payload: { ...payload, isScheduled: true },
  });
}

// ============================================================================
// Task Retrieval
// ============================================================================

/**
 * Get the next task to process (across all users)
 * Returns tasks ordered by priority (desc) and scheduledFor (asc)
 */
export async function getNextTask(): Promise<TaskQueueItem | null> {
  const now = new Date();

  const task = await db.taskQueue.findFirst({
    where: {
      status: TASK_STATUS.PENDING,
      scheduledFor: { lte: now },
    },
    orderBy: [
      { priority: "desc" },
      { scheduledFor: "asc" },
    ],
  });

  return task as TaskQueueItem | null;
}

/**
 * Get pending tasks for a specific user
 */
export async function getUserPendingTasks(userId: string): Promise<TaskQueueItem[]> {
  const tasks = await db.taskQueue.findMany({
    where: {
      userId,
      status: TASK_STATUS.PENDING,
    },
    orderBy: [
      { priority: "desc" },
      { scheduledFor: "asc" },
    ],
  });

  return tasks as TaskQueueItem[];
}

/**
 * Get a specific task by ID
 */
export async function getTask(taskId: string): Promise<TaskQueueItem | null> {
  const task = await db.taskQueue.findUnique({
    where: { id: taskId },
  });

  return task as TaskQueueItem | null;
}

/**
 * Get user's queue status (pending, processing, recent history)
 */
export async function getUserQueueStatus(userId: string): Promise<UserQueueStatus> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Get pending and processing tasks
  const [pendingTasks, processingTasks, recentHistory, stats] = await Promise.all([
    db.taskQueue.findMany({
      where: { userId, status: TASK_STATUS.PENDING },
      orderBy: [{ priority: "desc" }, { scheduledFor: "asc" }],
      take: 20,
    }),
    db.taskQueue.findMany({
      where: { userId, status: TASK_STATUS.PROCESSING },
      orderBy: { startedAt: "desc" },
    }),
    db.taskHistory.findMany({
      where: { userId },
      orderBy: { completedAt: "desc" },
      take: 50,
    }),
    // Stats for today
    Promise.all([
      db.taskQueue.count({ where: { userId, status: TASK_STATUS.PENDING } }),
      db.taskQueue.count({ where: { userId, status: TASK_STATUS.PROCESSING } }),
      db.taskHistory.count({
        where: { userId, status: TASK_STATUS.COMPLETED, completedAt: { gte: todayStart } },
      }),
      db.taskHistory.count({
        where: { userId, status: TASK_STATUS.FAILED, completedAt: { gte: todayStart } },
      }),
    ]),
  ]);

  return {
    pendingTasks: pendingTasks as TaskQueueItem[],
    processingTasks: processingTasks as TaskQueueItem[],
    recentHistory: recentHistory as TaskHistoryItem[],
    stats: {
      pendingCount: stats[0],
      processingCount: stats[1],
      completedToday: stats[2],
      failedToday: stats[3],
    },
  };
}

/**
 * Get global queue stats
 */
export async function getQueueStats(): Promise<QueueStats> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Get counts by status
  const [pending, processing, completedLast24h, failedLast24h] = await Promise.all([
    db.taskQueue.count({ where: { status: TASK_STATUS.PENDING } }),
    db.taskQueue.count({ where: { status: TASK_STATUS.PROCESSING } }),
    db.taskHistory.count({
      where: { status: TASK_STATUS.COMPLETED, completedAt: { gte: last24h } },
    }),
    db.taskHistory.count({
      where: { status: TASK_STATUS.FAILED, completedAt: { gte: last24h } },
    }),
  ]);

  // Get counts by type
  const byType = {} as QueueStats["byType"];
  for (const type of Object.values(TASK_TYPES)) {
    const [typePending, typeProcessing, typeCompleted, typeFailed] = await Promise.all([
      db.taskQueue.count({ where: { type, status: TASK_STATUS.PENDING } }),
      db.taskQueue.count({ where: { type, status: TASK_STATUS.PROCESSING } }),
      db.taskHistory.count({
        where: { type, status: TASK_STATUS.COMPLETED, completedAt: { gte: last24h } },
      }),
      db.taskHistory.count({
        where: { type, status: TASK_STATUS.FAILED, completedAt: { gte: last24h } },
      }),
    ]);

    byType[type] = {
      pending: typePending,
      processing: typeProcessing,
      completed: typeCompleted,
      failed: typeFailed,
    };
  }

  return {
    pending,
    processing,
    completedLast24h,
    failedLast24h,
    byType,
  };
}

// ============================================================================
// Task Lifecycle
// ============================================================================

/**
 * Mark a task as started (processing)
 */
export async function startTask(taskId: string): Promise<TaskQueueItem | null> {
  const task = await db.taskQueue.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.PROCESSING,
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  emitTaskChange(task.userId, task.id, task.type as TaskType, TASK_STATUS.PROCESSING, "started");

  return task as TaskQueueItem;
}

/**
 * Mark a task as completed
 */
export async function completeTask(taskId: string, result: TaskResult): Promise<void> {
  const now = new Date();

  const task = await db.taskQueue.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.COMPLETED,
      completedAt: now,
      result: result as object,
    },
  });

  emitTaskChange(
    task.userId,
    task.id,
    task.type as TaskType,
    TASK_STATUS.COMPLETED,
    "completed",
    result
  );

  // Archive immediately (we'll also have a cleanup job)
  await archiveTask(taskId);
}

/**
 * Mark a task as failed
 */
export async function failTask(taskId: string, error: string): Promise<void> {
  const task = await db.taskQueue.findUnique({
    where: { id: taskId },
  });

  if (!task) return;

  const config = TASK_CONFIG[task.type as TaskType];

  // Check if we should retry
  if (task.attempts < config.maxAttempts) {
    // Reset to pending for retry
    await db.taskQueue.update({
      where: { id: taskId },
      data: {
        status: TASK_STATUS.PENDING,
        error,
        // Add exponential backoff delay
        scheduledFor: new Date(Date.now() + Math.pow(2, task.attempts) * 1000),
      },
    });
    return;
  }

  // Max attempts reached - mark as failed
  const now = new Date();

  await db.taskQueue.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.FAILED,
      completedAt: now,
      error,
    },
  });

  emitTaskChange(
    task.userId,
    task.id,
    task.type as TaskType,
    TASK_STATUS.FAILED,
    "failed",
    undefined,
    error
  );

  // Archive failed task
  await archiveTask(taskId);
}

/**
 * Cancel a pending task
 */
export async function cancelTask(taskId: string): Promise<boolean> {
  const task = await db.taskQueue.findUnique({
    where: { id: taskId },
  });

  if (!task || task.status !== TASK_STATUS.PENDING) {
    return false;
  }

  await db.taskQueue.update({
    where: { id: taskId },
    data: {
      status: TASK_STATUS.CANCELLED,
      completedAt: new Date(),
    },
  });

  emitTaskChange(task.userId, task.id, task.type as TaskType, TASK_STATUS.CANCELLED, "cancelled");

  // Archive cancelled task
  await archiveTask(taskId);

  return true;
}

// ============================================================================
// Task Archival
// ============================================================================

/**
 * Move a completed/failed/cancelled task to history
 */
export async function archiveTask(taskId: string): Promise<void> {
  const task = await db.taskQueue.findUnique({
    where: { id: taskId },
  });

  if (!task) return;
  const archivableStatuses = [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.CANCELLED] as string[];
  if (!archivableStatuses.includes(task.status)) {
    return;
  }

  // Calculate duration
  const durationMs = task.startedAt && task.completedAt
    ? task.completedAt.getTime() - task.startedAt.getTime()
    : null;

  // Create history entry
  await db.taskHistory.create({
    data: {
      userId: task.userId,
      type: task.type,
      priority: task.priority,
      payload: task.payload as object,
      status: task.status,
      attempts: task.attempts,
      scheduledFor: task.scheduledFor,
      startedAt: task.startedAt,
      completedAt: task.completedAt!,
      result: task.result === null ? Prisma.JsonNull : (task.result as Prisma.InputJsonValue),
      error: task.error,
      durationMs,
      originalTaskId: task.id,
    },
  });

  // Delete from queue
  await db.taskQueue.delete({
    where: { id: taskId },
  });
}

/**
 * Archive all completed tasks older than the threshold
 */
export async function archiveOldTasks(): Promise<number> {
  const threshold = new Date(Date.now() - WORKER_CONFIG.archiveAfterMs);

  const oldTasks = await db.taskQueue.findMany({
    where: {
      status: { in: [TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.CANCELLED] },
      completedAt: { lt: threshold },
    },
    select: { id: true },
  });

  for (const task of oldTasks) {
    await archiveTask(task.id);
  }

  return oldTasks.length;
}

/**
 * Clean up old task history entries
 */
export async function cleanupOldHistory(): Promise<number> {
  const threshold = new Date(Date.now() - WORKER_CONFIG.historyRetentionMs);

  const result = await db.taskHistory.deleteMany({
    where: {
      archivedAt: { lt: threshold },
    },
  });

  return result.count;
}

/**
 * Recover stale tasks (tasks stuck in processing state)
 */
export async function recoverStaleTasks(): Promise<number> {
  const threshold = new Date(Date.now() - WORKER_CONFIG.staleTaskThresholdMs);

  const staleTasks = await db.taskQueue.findMany({
    where: {
      status: TASK_STATUS.PROCESSING,
      startedAt: { lt: threshold },
    },
  });

  for (const task of staleTasks) {
    await failTask(task.id, "Task timed out (stale)");
  }

  return staleTasks.length;
}

// ============================================================================
// Events
// ============================================================================

function emitTaskChange(
  userId: string,
  taskId: string,
  type: TaskType,
  status: TaskStatus,
  changeType: "created" | "started" | "completed" | "failed" | "cancelled",
  result?: TaskResult,
  error?: string
): void {
  events.emit("taskQueueChanged", {
    userId,
    taskId,
    type,
    status,
    changeType,
    result,
    error,
  });
}

// ============================================================================
// Convenience Functions for Common Task Types
// ============================================================================

/**
 * Push a focus calculation task
 */
export async function pushFocusCalculation(
  userId: string,
  force: boolean = false
): Promise<TaskQueueItem> {
  return pushTask({
    userId,
    type: TASK_TYPES.FOCUS_CALCULATION,
    payload: { force },
  });
}

/**
 * Push a quiz generation task
 */
export async function pushQuizGeneration(
  userId: string,
  options?: { answerOptionsCount?: number; activityDays?: number }
): Promise<TaskQueueItem> {
  return pushTask({
    userId,
    type: TASK_TYPES.QUIZ_GENERATION,
    payload: options,
    priority: 10, // High priority for user-initiated tasks
  });
}

/**
 * Push a summarization task
 */
export async function pushSummarization(
  userId: string,
  visitIds?: string[]
): Promise<TaskQueueItem> {
  return pushTask({
    userId,
    type: TASK_TYPES.SUMMARIZATION,
    payload: { visitIds },
  });
}

/**
 * Push an image summarization task
 */
export async function pushImageSummarization(
  userId: string,
  imageAttentionIds?: string[]
): Promise<TaskQueueItem> {
  return pushTask({
    userId,
    type: TASK_TYPES.IMAGE_SUMMARIZATION,
    payload: { imageAttentionIds },
  });
}
