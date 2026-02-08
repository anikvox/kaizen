/**
 * Task Queue Worker
 *
 * Background worker that processes tasks from the persistent queue.
 * Handles task execution, retries, and lifecycle management.
 */

import { db } from "../db.js";
import {
  getNextTask,
  startTask,
  completeTask,
  failTask,
  archiveOldTasks,
  cleanupOldHistory,
  recoverStaleTasks,
  scheduleRecurringTask,
} from "./service.js";
import {
  TASK_TYPES,
  TASK_STATUS,
  TASK_CONFIG,
  WORKER_CONFIG,
  type TaskType,
  type TaskResult,
  type TaskQueueItem,
} from "./types.js";

// Task handlers registry
type TaskHandler = (task: TaskQueueItem) => Promise<TaskResult>;
const taskHandlers = new Map<TaskType, TaskHandler>();

// Track currently processing tasks
const processingTasks = new Set<string>();
const processingByUser = new Map<string, number>();

// Worker state
let isRunning = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;
let maintenanceInterval: ReturnType<typeof setInterval> | null = null;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

// ============================================================================
// Handler Registration
// ============================================================================

/**
 * Register a handler for a task type
 */
export function registerTaskHandler(type: TaskType, handler: TaskHandler): void {
  taskHandlers.set(type, handler);
  console.log(`[TaskQueue] Registered handler for task type: ${type}`);
}

/**
 * Check if a handler is registered for a task type
 */
export function hasTaskHandler(type: TaskType): boolean {
  return taskHandlers.has(type);
}

// ============================================================================
// Worker Control
// ============================================================================

/**
 * Start the task queue worker
 */
export function startWorker(): void {
  if (isRunning) {
    console.log("[TaskQueue] Worker already running");
    return;
  }

  isRunning = true;
  console.log("[TaskQueue] Starting worker...");

  // Start polling for tasks
  pollInterval = setInterval(processNextTask, WORKER_CONFIG.pollIntervalMs);

  // Start maintenance (archiving, cleanup, recovery)
  maintenanceInterval = setInterval(runMaintenance, 60000); // Every minute

  // Start scheduler for recurring tasks
  schedulerInterval = setInterval(scheduleRecurringTasks, 10000); // Every 10 seconds

  console.log(`[TaskQueue] Worker started (poll: ${WORKER_CONFIG.pollIntervalMs}ms)`);
}

/**
 * Stop the task queue worker
 */
export function stopWorker(): void {
  if (!isRunning) {
    console.log("[TaskQueue] Worker not running");
    return;
  }

  isRunning = false;

  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }

  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
  }

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }

  console.log("[TaskQueue] Worker stopped");
}

/**
 * Check if the worker is running
 */
export function isWorkerRunning(): boolean {
  return isRunning;
}

// ============================================================================
// Task Processing
// ============================================================================

/**
 * Process the next available task
 */
async function processNextTask(): Promise<void> {
  // Check concurrent task limit
  if (processingTasks.size >= WORKER_CONFIG.maxConcurrentTasks) {
    return;
  }

  try {
    const task = await getNextTask();
    if (!task) return;

    // Check per-user concurrent limit
    const userCurrent = processingByUser.get(task.userId) || 0;
    if (userCurrent >= WORKER_CONFIG.maxConcurrentTasksPerUser) {
      return;
    }

    // Check if we have a handler for this task type
    const handler = taskHandlers.get(task.type as TaskType);
    if (!handler) {
      console.error(`[TaskQueue] No handler registered for task type: ${task.type}`);
      await failTask(task.id, `No handler for task type: ${task.type}`);
      return;
    }

    // Mark as processing
    processingTasks.add(task.id);
    processingByUser.set(task.userId, userCurrent + 1);

    // Start the task
    await startTask(task.id);

    // Execute in background (don't await to allow concurrent processing)
    executeTask(task, handler).finally(() => {
      processingTasks.delete(task.id);
      const current = processingByUser.get(task.userId) || 1;
      if (current <= 1) {
        processingByUser.delete(task.userId);
      } else {
        processingByUser.set(task.userId, current - 1);
      }
    });
  } catch (error) {
    console.error("[TaskQueue] Error in processNextTask:", error);
  }
}

/**
 * Execute a task with its handler
 */
async function executeTask(task: TaskQueueItem, handler: TaskHandler): Promise<void> {
  const config = TASK_CONFIG[task.type as TaskType];

  try {
    // Set up timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Task timeout")), config.timeoutMs);
    });

    // Race between task execution and timeout
    const result = await Promise.race([
      handler(task),
      timeoutPromise,
    ]);

    await completeTask(task.id, result);

    console.log(`[TaskQueue] Task completed: ${task.type} (${task.id})`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[TaskQueue] Task failed: ${task.type} (${task.id}):`, errorMessage);
    await failTask(task.id, errorMessage);
  }
}

// ============================================================================
// Recurring Task Scheduler
// ============================================================================

/**
 * Schedule recurring tasks for all eligible users
 */
async function scheduleRecurringTasks(): Promise<void> {
  try {
    // Get all users with settings
    const usersWithSettings = await db.userSettings.findMany({
      select: {
        userId: true,
        focusCalculationEnabled: true,
        focusCalculationIntervalMs: true,
        lastFocusCalculatedAt: true,
        attentionSummarizationEnabled: true,
        attentionSummarizationIntervalMs: true,
        lastSummarizationCalculatedAt: true,
      },
    });

    const now = new Date();

    for (const settings of usersWithSettings) {
      // Schedule focus calculation if enabled and interval elapsed
      if (settings.focusCalculationEnabled) {
        const interval = settings.focusCalculationIntervalMs || 30000;
        const lastCalc = settings.lastFocusCalculatedAt;

        if (!lastCalc || now.getTime() - lastCalc.getTime() >= interval) {
          await scheduleRecurringTask(settings.userId, TASK_TYPES.FOCUS_CALCULATION);
        }
      }

      // Schedule summarization if enabled and interval elapsed
      if (settings.attentionSummarizationEnabled) {
        const interval = settings.attentionSummarizationIntervalMs || 60000;
        const lastCalc = settings.lastSummarizationCalculatedAt;

        if (!lastCalc || now.getTime() - lastCalc.getTime() >= interval) {
          await scheduleRecurringTask(settings.userId, TASK_TYPES.SUMMARIZATION);
        }
      }
    }
  } catch (error) {
    console.error("[TaskQueue] Error scheduling recurring tasks:", error);
  }
}

// ============================================================================
// Maintenance
// ============================================================================

/**
 * Run maintenance tasks (archiving, cleanup, recovery)
 */
async function runMaintenance(): Promise<void> {
  try {
    // Recover stale tasks
    const recoveredCount = await recoverStaleTasks();
    if (recoveredCount > 0) {
      console.log(`[TaskQueue] Recovered ${recoveredCount} stale tasks`);
    }

    // Archive old completed tasks
    const archivedCount = await archiveOldTasks();
    if (archivedCount > 0) {
      console.log(`[TaskQueue] Archived ${archivedCount} old tasks`);
    }

    // Clean up old history (runs less frequently - check internally)
    const cleanedCount = await cleanupOldHistory();
    if (cleanedCount > 0) {
      console.log(`[TaskQueue] Cleaned up ${cleanedCount} old history entries`);
    }
  } catch (error) {
    console.error("[TaskQueue] Error in maintenance:", error);
  }
}

// ============================================================================
// Status
// ============================================================================

/**
 * Get worker status
 */
export function getWorkerStatus(): {
  running: boolean;
  processingCount: number;
  processingByUser: Record<string, number>;
  registeredHandlers: string[];
} {
  return {
    running: isRunning,
    processingCount: processingTasks.size,
    processingByUser: Object.fromEntries(processingByUser),
    registeredHandlers: Array.from(taskHandlers.keys()),
  };
}
