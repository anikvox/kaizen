import type { Focus, UserSettings } from "@prisma/client";

/**
 * Focus calculation settings extracted from UserSettings
 */
export interface FocusSettings {
  focusCalculationEnabled: boolean;
  focusCalculationIntervalMs: number;
  focusInactivityThresholdMs: number;
  focusMinDurationMs: number;
}

/**
 * Default focus settings for new users or when settings are missing
 */
export const DEFAULT_FOCUS_SETTINGS: FocusSettings = {
  focusCalculationEnabled: true,
  focusCalculationIntervalMs: 60000, // 1 minute
  focusInactivityThresholdMs: 900000, // 15 minutes
  focusMinDurationMs: 120000, // 2 minutes
};

/**
 * Attention data formatted for LLM prompts
 */
export interface FormattedAttentionItem {
  url: string;
  title: string | null;
  domain: string;
  textContent: string[];
  imageDescriptions: string[];
  youtubeContent: string[];
  timestamp: Date;
}

/**
 * Result from focus area detection
 */
export interface FocusDetectionResult {
  focusItem: string | null;
  isValid: boolean;
}

/**
 * Result from focus drift detection
 */
export interface FocusDriftResult {
  hasDrifted: boolean;
}

/**
 * Result of processing focus for all users
 */
export interface ProcessAllUsersResult {
  usersProcessed: number;
  focusesCreated: number;
  focusesUpdated: number;
  focusesEnded: number;
  errors: number;
}

/**
 * Result of processing focus for a single user
 */
export interface ProcessUserFocusResult {
  focusCreated: boolean;
  focusUpdated: boolean;
  focusEnded: boolean;
  inactivityDetected: boolean;
  error?: string;
}

/**
 * Focus with expanded user settings
 */
export type FocusWithSettings = Focus & {
  user: {
    settings: UserSettings | null;
  };
};

/**
 * Non-answer patterns to filter from LLM responses
 */
export const NON_ANSWER_PATTERNS = [
  "null",
  "n/a",
  "unknown",
  "undefined",
  "none",
  "cannot determine",
  "unable to determine",
  "not enough",
  "insufficient",
];

/**
 * Maximum number of keywords before summarization is triggered
 */
export const MAX_KEYWORDS_BEFORE_SUMMARIZATION = 10;

/**
 * Maximum attention window in milliseconds (10 minutes)
 */
export const MAX_ATTENTION_WINDOW_MS = 10 * 60 * 1000;

/**
 * Minimum text content length to be considered meaningful
 */
export const MIN_TEXT_CONTENT_LENGTH = 50;
