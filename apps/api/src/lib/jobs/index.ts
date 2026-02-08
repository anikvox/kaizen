/**
 * Jobs Module
 *
 * Background job processing using pg-boss.
 */

// Types
export * from "./types.js";

// Boss instance
export { getBoss, startBoss, stopBoss, isBossRunning } from "./boss.js";

// Handlers
export { registerHandlers } from "./handlers.js";

// Scheduler
export { startScheduler, stopScheduler } from "./scheduler.js";

// Service
export {
  sendFocusCalculation,
  sendQuizGeneration,
  sendSummarization,
  cancelJob,
  getJob,
  getUserJobsStatus,
  getQueueStats,
} from "./service.js";
