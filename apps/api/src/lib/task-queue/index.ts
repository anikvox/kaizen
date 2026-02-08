/**
 * Task Queue Module
 *
 * Persistent per-user task queue for background processing.
 */

// Types
export * from "./types.js";

// Service (queue operations)
export {
  pushTask,
  scheduleRecurringTask,
  getNextTask,
  getUserPendingTasks,
  getTask,
  getUserQueueStatus,
  getQueueStats,
  startTask,
  completeTask,
  failTask,
  cancelTask,
  archiveTask,
  archiveOldTasks,
  cleanupOldHistory,
  recoverStaleTasks,
  // Convenience functions
  pushFocusCalculation,
  pushQuizGeneration,
  pushSummarization,
} from "./service.js";

// Worker
export {
  registerTaskHandler,
  hasTaskHandler,
  startWorker,
  stopWorker,
  isWorkerRunning,
  getWorkerStatus,
} from "./worker.js";

// Handlers
export { registerAllHandlers } from "./handlers.js";
