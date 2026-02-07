/**
 * Task Queue Types and Constants
 *
 * Defines the type system for the persistent per-user task queue.
 */

import type { TaskQueue, TaskHistory } from "@prisma/client";

// ============================================================================
// Task Types
// ============================================================================

/**
 * Available task types in the system
 */
export const TASK_TYPES = {
  FOCUS_CALCULATION: "focus_calculation",
  QUIZ_GENERATION: "quiz_generation",
  SUMMARIZATION: "summarization",
  IMAGE_SUMMARIZATION: "image_summarization",
} as const;

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES];

// ============================================================================
// Task Status
// ============================================================================

export const TASK_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type TaskStatus = typeof TASK_STATUS[keyof typeof TASK_STATUS];

// ============================================================================
// Task Priority
// ============================================================================

export const TASK_PRIORITY = {
  LOW: -10,
  NORMAL: 0,
  HIGH: 10,
  URGENT: 20,
} as const;

export type TaskPriority = typeof TASK_PRIORITY[keyof typeof TASK_PRIORITY];

// ============================================================================
// Task Payloads (type-safe input for each task type)
// ============================================================================

export interface FocusCalculationPayload {
  // Whether this is a scheduled recurring task
  isScheduled?: boolean;
  // Force calculation even if interval hasn't elapsed
  force?: boolean;
}

export interface QuizGenerationPayload {
  // Number of answer options (2-4)
  answerOptionsCount?: number;
  // Days of activity to use (1-7)
  activityDays?: number;
}

export interface SummarizationPayload {
  // Whether this is a scheduled recurring task
  isScheduled?: boolean;
  // Limit to specific visit IDs (for one-off summarization)
  visitIds?: string[];
}

export interface ImageSummarizationPayload {
  // Whether this is a scheduled recurring task
  isScheduled?: boolean;
  // Limit to specific image attention IDs
  imageAttentionIds?: string[];
}

export type TaskPayload =
  | FocusCalculationPayload
  | QuizGenerationPayload
  | SummarizationPayload
  | ImageSummarizationPayload;

// ============================================================================
// Task Results (type-safe output for each task type)
// ============================================================================

export interface FocusCalculationResult {
  focusCreated: boolean;
  focusUpdated: boolean;
  focusEnded: boolean;
  focusesCreated?: number;
  focusesUpdated?: number;
  focusesEnded?: number;
  inactivityDetected: boolean;
  skippedNoNewData: boolean;
}

export interface QuizGenerationResult {
  quizId?: string;
  questionCount: number;
  generatedAt: string;
}

export interface SummarizationResult {
  visitsSummarized: number;
  skippedNoContent: number;
}

export interface ImageSummarizationResult {
  imagesSummarized: number;
  skippedOrFailed: number;
}

export type TaskResult =
  | FocusCalculationResult
  | QuizGenerationResult
  | SummarizationResult
  | ImageSummarizationResult;

// ============================================================================
// Task Configuration
// ============================================================================

export interface TaskTypeConfig {
  // Default priority for this task type
  defaultPriority: TaskPriority;
  // Maximum retry attempts
  maxAttempts: number;
  // Timeout in milliseconds (after which task is considered failed)
  timeoutMs: number;
  // Whether multiple pending tasks of this type are allowed per user
  allowMultiplePending: boolean;
  // Default scheduling interval for recurring tasks (null = not recurring)
  recurringIntervalMs: number | null;
}

export const TASK_CONFIG: Record<TaskType, TaskTypeConfig> = {
  [TASK_TYPES.FOCUS_CALCULATION]: {
    defaultPriority: TASK_PRIORITY.NORMAL,
    maxAttempts: 3,
    timeoutMs: 60000, // 1 minute
    allowMultiplePending: false, // Only one focus calc pending at a time
    recurringIntervalMs: 30000, // 30 seconds default
  },
  [TASK_TYPES.QUIZ_GENERATION]: {
    defaultPriority: TASK_PRIORITY.HIGH,
    maxAttempts: 2,
    timeoutMs: 120000, // 2 minutes (LLM calls can be slow)
    allowMultiplePending: false, // Only one quiz generation at a time
    recurringIntervalMs: null, // Not recurring - on-demand only
  },
  [TASK_TYPES.SUMMARIZATION]: {
    defaultPriority: TASK_PRIORITY.NORMAL,
    maxAttempts: 3,
    timeoutMs: 60000, // 1 minute
    allowMultiplePending: false,
    recurringIntervalMs: 60000, // 1 minute default
  },
  [TASK_TYPES.IMAGE_SUMMARIZATION]: {
    defaultPriority: TASK_PRIORITY.LOW,
    maxAttempts: 2,
    timeoutMs: 90000, // 1.5 minutes (image fetching + LLM)
    allowMultiplePending: false,
    recurringIntervalMs: 60000, // 1 minute default
  },
};

// ============================================================================
// Worker Configuration
// ============================================================================

export const WORKER_CONFIG = {
  // How often to poll for new tasks (ms)
  pollIntervalMs: 1000,
  // Maximum concurrent tasks across all users
  maxConcurrentTasks: 5,
  // Maximum concurrent tasks per user
  maxConcurrentTasksPerUser: 2,
  // How long to keep completed tasks before archiving (ms)
  archiveAfterMs: 60000, // 1 minute
  // How long to keep task history (ms) - older entries are deleted
  historyRetentionMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  // Stale task threshold - tasks processing longer than this are considered failed
  staleTaskThresholdMs: 300000, // 5 minutes
};

// ============================================================================
// API Types
// ============================================================================

export interface CreateTaskInput {
  userId: string;
  type: TaskType;
  payload?: TaskPayload;
  priority?: TaskPriority;
  scheduledFor?: Date;
}

export interface TaskQueueItem extends Omit<TaskQueue, 'payload' | 'result'> {
  payload: TaskPayload;
  result: TaskResult | null;
}

export interface TaskHistoryItem extends Omit<TaskHistory, 'payload' | 'result'> {
  payload: TaskPayload;
  result: TaskResult | null;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completedLast24h: number;
  failedLast24h: number;
  byType: Record<TaskType, {
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }>;
}

export interface UserQueueStatus {
  pendingTasks: TaskQueueItem[];
  processingTasks: TaskQueueItem[];
  recentHistory: TaskHistoryItem[];
  stats: {
    pendingCount: number;
    processingCount: number;
    completedToday: number;
    failedToday: number;
  };
}

// ============================================================================
// Event Types
// ============================================================================

export interface TaskQueueChangedEvent {
  userId: string;
  taskId: string;
  type: TaskType;
  status: TaskStatus;
  changeType: "created" | "started" | "completed" | "failed" | "cancelled";
  result?: TaskResult;
  error?: string;
}
