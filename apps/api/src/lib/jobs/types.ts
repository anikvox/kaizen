/**
 * Job Types
 *
 * Type definitions for background jobs.
 */

// Job names
export const JOB_NAMES = {
  FOCUS_CALCULATION: "focus-calculation",
  QUIZ_GENERATION: "quiz-generation",
  VISIT_SUMMARIZATION: "visit-summarization",
  PULSE_GENERATION: "pulse-generation",
} as const;

export type JobName = typeof JOB_NAMES[keyof typeof JOB_NAMES];

// Job payloads
export interface FocusCalculationPayload {
  userId: string;
  force?: boolean;
}

export interface QuizGenerationPayload {
  userId: string;
  answerOptionsCount?: number;
  activityDays?: number;
}

export interface VisitSummarizationPayload {
  userId: string;
  visitIds?: string[];
}

export interface PulseGenerationPayload {
  userId: string;
}

export type JobPayload =
  | FocusCalculationPayload
  | QuizGenerationPayload
  | VisitSummarizationPayload
  | PulseGenerationPayload;

// Job results
export interface FocusCalculationResult {
  focusCreated: boolean;
  focusUpdated: boolean;
  focusEnded: boolean;
  focusesCreated?: number;
  focusesUpdated?: number;
  focusesEnded?: number;
}

export interface QuizGenerationResult {
  quizId: string;
  questionCount: number;
  generatedAt: string;
}

export interface VisitSummarizationResult {
  visitsSummarized: number;
}

export interface PulseGenerationResult {
  pulsesGenerated: number;
}

export type JobResult =
  | FocusCalculationResult
  | QuizGenerationResult
  | VisitSummarizationResult
  | PulseGenerationResult;

// Job status for API
export interface JobStatus {
  id: string;
  name: JobName;
  state: "created" | "retry" | "active" | "completed" | "failed" | "cancelled";
  data: JobPayload;
  output?: JobResult;
  createdOn: Date;
  startedOn?: Date;
  completedOn?: Date;
  retryCount: number;
}

// User queue status for API
export interface UserJobsStatus {
  pending: JobStatus[];
  active: JobStatus[];
  recent: JobStatus[];
  stats: {
    pendingCount: number;
    activeCount: number;
    completedToday: number;
    failedToday: number;
  };
}
