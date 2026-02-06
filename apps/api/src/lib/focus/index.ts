// Types
export type {
  FocusSettings,
  FormattedAttentionItem,
  FocusDetectionResult,
  FocusDriftResult,
  ProcessAllUsersResult,
  ProcessUserFocusResult,
  FocusWithSettings,
} from "./types.js";

export {
  DEFAULT_FOCUS_SETTINGS,
  NON_ANSWER_PATTERNS,
  MAX_KEYWORDS_BEFORE_SUMMARIZATION,
  MAX_ATTENTION_WINDOW_MS,
  MIN_TEXT_CONTENT_LENGTH,
} from "./types.js";

// Utils
export {
  extractFocusSettings,
  hashAttentionData,
  formatAttentionData,
  sanitizeFocusItem,
  parseDriftResponse,
  deduplicateKeywords,
  hasMinimalContent,
  getEarliestTimestamp,
  getLatestTimestamp,
} from "./utils.js";

// Prompts
export {
  formatAttentionForPrompt,
  createFocusAreaPrompt,
  createFocusDriftPrompt,
  createKeywordSummaryPrompt,
  FOCUS_SYSTEM_PROMPT,
} from "./prompts.js";

// Service
export {
  getActiveFocus,
  processUserFocus,
  processAllUsersFocus,
  getUserFocusHistory,
  endUserFocus,
} from "./service.js";
