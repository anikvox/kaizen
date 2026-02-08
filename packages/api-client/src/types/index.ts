export interface ApiClientOptions {
  baseUrl: string;
  getToken?: () => Promise<string | null>;
}

export interface HealthResponse {
  status: string;
  db: "connected" | "disconnected";
}

export interface MessageResponse {
  message: string;
}

export interface User {
  id: string;
  clerkId: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SSETickData {
  time: string;
}

export interface SSEDeviceTokenRevokedData {
  token: string;
}

export interface SSEDeviceTokenConnectedData {
  connected: true;
  user: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface SSEDeviceListChangedData {
  action: "created" | "deleted";
  deviceId: string;
}

export interface ApiError {
  error: string;
}

export interface DeviceToken {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface DeviceTokenCreated {
  id: string;
  token: string;
  name: string;
  createdAt: string;
}

// Website Visit Types
export interface WebsiteVisit {
  id: string;
  url: string;
  title: string;
  metadata: Record<string, string>;
  openedAt: string;
  closedAt: string | null;
  activeTime: number;
  referrer: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteVisitOpenedRequest {
  url: string;
  title: string;
  metadata: Record<string, string>;
  referrer: string | null;
  timestamp: number;
}

export interface WebsiteVisitActiveTimeRequest {
  url: string;
  activeTime: number;
  timestamp: number;
}

export interface WebsiteVisitClosedRequest {
  url: string;
  activeTime: number;
  timestamp: number;
}

// Text Attention Types
export interface TextAttention {
  id: string;
  url: string;
  text: string;
  wordsRead: number;
  timestamp: string;
  createdAt: string;
}

export interface TextAttentionRequest {
  url: string;
  text: string;
  wordsRead: number;
  timestamp: number;
}

// Image Attention Types
export interface ImageAttention {
  id: string;
  url: string;
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  hoverDuration: number;
  confidence: number;
  timestamp: string;
  summary?: string | null; // AI-generated description of the image
  summarizedAt?: string | null;
  createdAt: string;
  kaizenId?: string; // Client-side unique identifier for matching summary to image element
}

export interface ImageAttentionRequest {
  url: string;
  src: string;
  alt: string;
  title: string;
  width: number;
  height: number;
  hoverDuration: number;
  confidence: number;
  timestamp: number;
  kaizenId?: string; // Client-side unique identifier for matching summary to image element
}

// Audio Attention Types
export interface AudioAttention {
  id: string;
  url: string;
  src: string;
  title: string;
  duration: number;
  playbackDuration: number;
  currentTime: number;
  confidence: number;
  timestamp: string;
  createdAt: string;
}

export interface AudioAttentionRequest {
  url: string;
  src: string;
  title: string;
  duration: number;
  playbackDuration: number;
  currentTime: number;
  confidence: number;
  timestamp: number;
}

// YouTube Attention Types
export interface YoutubeAttention {
  id: string;
  videoId: string;
  event: "opened" | "caption" | "active-watch-time-update";
  title: string | null;
  channelName: string | null;
  url: string | null;
  caption: string | null;
  activeWatchTime: number | null;
  timestamp: string;
  createdAt: string;
}

export interface YoutubeAttentionRequest {
  event: "opened" | "caption" | "active-watch-time-update";
  videoId: string | null;
  title?: string;
  channelName?: string;
  url?: string;
  caption?: string;
  activeWatchTime?: number;
  timestamp: number;
}

// Adapter Types - Clean, LLM-friendly data structures

export interface TimeRange {
  from: string;
  to: string;
}

// Website Activity Adapter Types
export interface WebsiteActivityPage {
  url: string;
  title: string;
  visitCount: number;
  totalActiveTime: number;
  totalActiveTimeFormatted: string;
  firstVisit: string;
  lastVisit: string;
}

export interface WebsiteActivitySummary {
  domain: string;
  totalVisits: number;
  totalActiveTime: number;
  totalActiveTimeFormatted: string;
  pages: WebsiteActivityPage[];
}

export interface WebsiteActivityResponse {
  timeRange: TimeRange;
  summary: {
    totalWebsites: number;
    totalVisits: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
  };
  websites: WebsiteActivitySummary[];
}

// Attention Adapter Types
export interface TextAttentionExcerpt {
  text: string;
  wordsRead: number;
  timestamp: string;
}

export interface ImageAttentionItem {
  src: string;
  alt: string;
  hoverDuration: number;
  hoverDurationFormatted: string;
  timestamp: string;
  summary?: string | null; // AI-generated description of the image
}

export interface AudioAttentionItem {
  src: string;
  title: string;
  playbackDuration: number;
  playbackDurationFormatted: string;
  timestamp: string;
}

export interface YoutubeVideoAttention {
  videoId: string | null;
  title: string | null;
  channelName: string | null;
  activeWatchTime: number | null;
  activeWatchTimeFormatted: string | null;
  captions: string[];
  timestamp: string;
}

export interface PageAttention {
  text: {
    totalWordsRead: number;
    excerpts: TextAttentionExcerpt[];
  };
  images: {
    count: number;
    items: ImageAttentionItem[];
  };
  audio: {
    count: number;
    items: AudioAttentionItem[];
  };
  youtube: {
    videos: YoutubeVideoAttention[];
  };
}

export interface AttentionPageSummary {
  url: string;
  domain: string;
  title: string | null;
  visitedAt: string;
  activeTime: number;
  activeTimeFormatted: string;
  summary?: string | null; // AI-generated summary of text attention
  imageSummary?: string | null; // AI-generated summary of image attention
  attention: PageAttention;
}

export interface AttentionResponse {
  timeRange: TimeRange;
  summary: {
    totalPages: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
    totalWordsRead: number;
    totalImagesViewed: number;
    totalAudioListened: number;
    totalYoutubeVideos: number;
  };
  pages: AttentionPageSummary[];
}

// LLM Types
export type LLMProviderType = "gemini" | "anthropic" | "openai";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
}

export type LLMModels = Record<LLMProviderType, ModelInfo[]>;

// Settings Types
export interface UserSettings {
  cognitiveAttentionDebugMode: boolean;
  cognitiveAttentionShowOverlay: boolean;
  attentionTrackingIgnoreList: string | null; // Newline-separated list of URL patterns/regexes to ignore
  // Summarization settings (optional for backward compatibility before migration)
  attentionSummarizationEnabled?: boolean; // Default true
  attentionSummarizationIntervalMs?: number; // Default 60000 (1 minute)
  // Focus calculation settings
  focusCalculationEnabled?: boolean; // Default true
  focusCalculationIntervalMs?: number; // Default 60000 (1 minute)
  focusInactivityThresholdMs?: number; // Default 900000 (15 minutes)
  focusMinDurationMs?: number; // Default 120000 (2 minutes)
  // LLM settings
  llmProvider?: LLMProviderType | null;
  llmModel?: string | null;
  hasGeminiApiKey?: boolean;
  hasAnthropicApiKey?: boolean;
  hasOpenaiApiKey?: boolean;
  // Quiz settings
  quizAnswerOptionsCount?: number; // 2, 3, or 4
  quizActivityDays?: number; // 1-7
  // Pomodoro settings
  pomodoroCooldownMs?: number; // Default 120000 (2 minutes)
  // Focus agent settings
  focusAgentEnabled?: boolean; // Default true
  focusAgentSensitivity?: number; // 0-1, Default 0.5
  focusAgentCooldownMs?: number; // Default 300000 (5 minutes)
  focusAgentIntervalMs?: number; // Default 60000 (1 minute)
}

export interface UserSettingsUpdateRequest {
  cognitiveAttentionDebugMode?: boolean;
  cognitiveAttentionShowOverlay?: boolean;
  attentionTrackingIgnoreList?: string | null;
  // Summarization settings
  attentionSummarizationEnabled?: boolean;
  attentionSummarizationIntervalMs?: number;
  // Focus calculation settings
  focusCalculationEnabled?: boolean;
  focusCalculationIntervalMs?: number;
  focusInactivityThresholdMs?: number;
  focusMinDurationMs?: number;
  // LLM settings
  llmProvider?: LLMProviderType | null;
  llmModel?: string | null;
  geminiApiKey?: string | null;
  anthropicApiKey?: string | null;
  openaiApiKey?: string | null;
  // Quiz settings
  quizAnswerOptionsCount?: number;
  quizActivityDays?: number;
  // Pomodoro settings
  pomodoroCooldownMs?: number;
  // Focus agent settings
  focusAgentEnabled?: boolean;
  focusAgentSensitivity?: number;
  focusAgentCooldownMs?: number;
  focusAgentIntervalMs?: number;
}

export interface SSESettingsConnectedData {
  connected: true;
  settings: UserSettings;
}

export interface SSESettingsChangedData {
  cognitiveAttentionDebugMode: boolean;
  cognitiveAttentionShowOverlay: boolean;
  attentionTrackingIgnoreList: string | null;
  // Summarization settings (optional for backward compatibility)
  attentionSummarizationEnabled?: boolean;
  attentionSummarizationIntervalMs?: number;
  // Focus calculation settings
  focusCalculationEnabled?: boolean;
  focusCalculationIntervalMs?: number;
  focusInactivityThresholdMs?: number;
  focusMinDurationMs?: number;
  // LLM settings (optional for backward compatibility)
  llmProvider?: LLMProviderType | null;
  llmModel?: string | null;
  hasGeminiApiKey?: boolean;
  hasAnthropicApiKey?: boolean;
  hasOpenaiApiKey?: boolean;
  // Focus agent settings
  focusAgentEnabled?: boolean;
  focusAgentSensitivity?: number;
  focusAgentCooldownMs?: number;
  focusAgentIntervalMs?: number;
}

// Chat Types
export type ChatMessageRole = "user" | "assistant" | "tool";
export type ChatMessageStatus =
  | "sending"
  | "sent"
  | "typing"
  | "streaming"
  | "finished"
  | "error";

/**
 * Attention time range options for chat context.
 * - "30m": Last 30 minutes
 * - "2h": Last 2 hours
 * - "1d": Last 24 hours
 * - "all": All available data
 */
export type ChatAttentionRange = "30m" | "2h" | "1d" | "all";

/**
 * File attachment for chat messages.
 * Files are stored as base64 in the database.
 */
export interface ChatAttachment {
  filename: string;
  mimeType: string;
  size: number; // Size in bytes (before base64 encoding)
  data: string; // Base64 encoded file data
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  errorMessage?: string | null;
  /** Tool call ID for tool messages */
  toolCallId?: string | null;
  /** Tool name for tool messages */
  toolName?: string | null;
  /** File attachments (for user messages) */
  attachments?: ChatAttachment[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  attentionRange: ChatAttentionRange;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionWithMessages extends ChatSession {
  messages: ChatMessage[];
}

export interface ChatSessionListItem {
  id: string;
  title: string | null;
  attentionRange: ChatAttentionRange;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageRequest {
  sessionId?: string;
  content: string;
  attentionRange?: ChatAttentionRange;
  /** File attachments (max 5 files, max 5MB each) */
  attachments?: ChatAttachment[];
}

export interface SendMessageResponse {
  sessionId: string;
  isNewSession: boolean;
  userMessage: ChatMessage;
  assistantMessage: ChatMessage;
}

// Chat SSE Types
export interface SSEChatConnectedData {
  connected: true;
  session?: ChatSession;
}

export interface SSEChatSessionCreatedData {
  userId: string;
  sessionId: string;
  session: ChatSession;
}

export interface SSEChatSessionUpdatedData {
  userId: string;
  sessionId: string;
  updates: {
    title?: string | null;
  };
}

export interface SSEChatSessionDeletedData {
  userId: string;
  sessionId: string;
}

export interface SSEChatMessageCreatedData {
  userId: string;
  sessionId: string;
  message: ChatMessage;
}

export interface SSEChatMessageUpdatedData {
  userId: string;
  sessionId: string;
  messageId: string;
  updates: {
    content?: string;
    status?: ChatMessageStatus;
    errorMessage?: string | null;
  };
}

// Tool call started event (UI-only, not persisted)
export interface SSEToolCallStartedData {
  userId: string;
  sessionId: string;
  toolCallId: string;
  toolName: string;
}

// Focus Types
export interface Focus {
  id: string;
  item: string; // 2-3 word focus description
  keywords: string[]; // Historical keywords
  isActive: boolean;
  startedAt: string;
  endedAt: string | null;
  lastActivityAt: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface FocusListResponse {
  focuses: Focus[];
}

export interface FocusResponse {
  focus: Focus | null;
}

export interface FocusSettings {
  focusCalculationEnabled: boolean;
  focusCalculationIntervalMs: number;
  focusInactivityThresholdMs: number;
  focusMinDurationMs: number;
}

// Focus SSE Types
export interface SSEFocusConnectedData {
  connected: true;
  focuses: Focus[];
}

export interface SSEFocusChangedData {
  focus: Focus | null;
  changeType: "created" | "updated" | "ended";
}

// Active Tab Types
export interface ActiveTabRequest {
  url: string | null;
  title: string | null;
  timestamp: number;
}

export interface ActiveTabResponse {
  success: boolean;
  url: string | null;
}

export interface ActiveTabData {
  url: string | null;
  title: string | null;
  timestamp: number | null;
}

export interface SSEActiveTabChangedData {
  url: string | null;
  title: string | null;
  timestamp: number;
}

// Quiz Types
export interface QuizQuestion {
  id: string;
  questionIndex: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizAnswerData {
  questionIndex: number;
  selectedIndex: number;
  isCorrect: boolean;
  answeredAt: string;
}

export interface GeneratedQuiz {
  id: string;
  questions: QuizQuestion[];
  generatedAt: string;
  activityDays: number;
  optionsCount: number;
}

export interface QuizWithAnswers extends GeneratedQuiz {
  answers: QuizAnswerData[];
  completedAt: string | null;
  score: number | null;
}

export type QuizJobStatus = "pending" | "processing" | "completed" | "failed";

export interface QuizJobResponse {
  jobId?: string;
  status: QuizJobStatus;
  quiz?: QuizWithAnswers;
  error?: string;
  code?: string;
}

export interface QuizCurrentResponse {
  quiz: QuizWithAnswers | null;
}

export interface QuizAnswerResponse {
  success: boolean;
  isCorrect: boolean;
  quiz: QuizWithAnswers;
}

export interface QuizResultItem {
  id: string;
  totalQuestions: number;
  correctAnswers: number;
  completedAt: string;
}

export interface QuizHistoryResponse {
  results: QuizResultItem[];
  stats: {
    totalQuizzes: number;
    totalQuestions: number;
    totalCorrect: number;
  };
}

// Pomodoro Types
export type PomodoroState = "idle" | "running" | "paused" | "cooldown";

export interface PomodoroStatus {
  state: PomodoroState;
  elapsedSeconds: number;
  isPaused: boolean;
  lastActivityAt: string;
}

export interface PomodoroStatusResponse {
  status: PomodoroStatus;
}

export interface SSEPomodoroConnectedData {
  connected: true;
  status: PomodoroStatus;
}

export interface SSEPomodoroStatusChangedData {
  status: PomodoroStatus;
}

export interface SSEPomodoroTickData {
  status: PomodoroStatus;
}

// Unified SSE Types
export type UnifiedSSEEventType =
  | "connected"
  | "settings-changed"
  | "focus-changed"
  | "pomodoro-tick"
  | "pomodoro-status-changed"
  | "chat-session-created"
  | "chat-session-updated"
  | "chat-session-deleted"
  | "chat-message-created"
  | "chat-message-updated"
  | "tool-call-started"
  | "device-token-revoked"
  | "device-list-changed"
  | "active-tab-changed"
  | "pulses-updated"
  | "insight-created"
  | "agent-nudge"
  | "health-report-progress"
  | "ping";

// Pulse types
export interface Pulse {
  id: string;
  message: string;
  createdAt: string;
}

// Attention Insight types
export interface AttentionInsight {
  id: string;
  message: string;
  sourceUrl: string | null;
  createdAt: string;
}

// Agent Nudge types
export type AgentNudgeType = "doomscroll" | "distraction" | "break" | "focus_drift" | "encouragement" | "all_clear";

export interface AgentNudge {
  id: string;
  type: AgentNudgeType;
  message: string;
  createdAt: string;
}

export interface AgentNudgeContext {
  recentDomains?: string[];
  domainSwitchCount?: number;
  averageDwellTime?: number;
  hasActiveFocus?: boolean;
  focusTopics?: string[];
  socialMediaTime?: number;
  readingTime?: number;
  sessionDuration?: number;
}

export interface AgentNudgeDetail {
  id: string;
  type: AgentNudgeType;
  message: string;
  confidence: number;
  reasoning: string | null;
  context: AgentNudgeContext;
  response: "acknowledged" | "false_positive" | "dismissed" | null;
  respondedAt: string | null;
  createdAt: string;
}

export interface AgentNudgeStats {
  totalNudges: number;
  acknowledgedCount: number;
  falsePositiveCount: number;
  dismissedCount: number;
  nudgesByType: Record<string, number>;
}

export interface AgentNudgeResponse {
  response: "acknowledged" | "false_positive" | "dismissed";
}

export interface UnifiedSSEConnectedData {
  type: "connected";
  user: {
    id: string;
    email: string;
    name: string | null;
  };
  settings: UserSettings;
  focuses: Focus[];
  pomodoro: PomodoroStatus;
  pulses: Pulse[];
  insights: AttentionInsight[];
  nudges: AgentNudgeDetail[];
  nudgeStats: AgentNudgeStats;
}

export interface UnifiedSSESettingsChangedData {
  type: "settings-changed";
  settings: SSESettingsChangedData;
}

export interface UnifiedSSEFocusChangedData {
  type: "focus-changed";
  focus: Focus | null;
  changeType: "created" | "updated" | "ended";
}

export interface UnifiedSSEPomodoroTickData {
  type: "pomodoro-tick";
  status: PomodoroStatus;
}

export interface UnifiedSSEPomodoroStatusChangedData {
  type: "pomodoro-status-changed";
  status: PomodoroStatus;
}

export interface UnifiedSSEChatSessionCreatedData {
  type: "chat-session-created";
  sessionId: string;
  session: ChatSession;
}

export interface UnifiedSSEChatSessionUpdatedData {
  type: "chat-session-updated";
  sessionId: string;
  updates: {
    title?: string | null;
  };
}

export interface UnifiedSSEChatSessionDeletedData {
  type: "chat-session-deleted";
  sessionId: string;
}

export interface UnifiedSSEChatMessageCreatedData {
  type: "chat-message-created";
  sessionId: string;
  message: ChatMessage;
}

export interface UnifiedSSEChatMessageUpdatedData {
  type: "chat-message-updated";
  sessionId: string;
  messageId: string;
  updates: {
    content?: string;
    status?: ChatMessageStatus;
    errorMessage?: string | null;
  };
}

export interface UnifiedSSEToolCallStartedData {
  type: "tool-call-started";
  sessionId: string;
  toolCallId: string;
  toolName: string;
}

export interface UnifiedSSEDeviceTokenRevokedData {
  type: "device-token-revoked";
  token: string;
}

export interface UnifiedSSEDeviceListChangedData {
  type: "device-list-changed";
  action: "created" | "deleted";
  deviceId: string;
}

export interface UnifiedSSEActiveTabChangedData {
  type: "active-tab-changed";
  url: string | null;
  title: string | null;
  timestamp: number;
}

export interface UnifiedSSEPulsesUpdatedData {
  type: "pulses-updated";
  pulses: Pulse[];
}

export interface UnifiedSSEInsightCreatedData {
  type: "insight-created";
  insight: AttentionInsight;
}

export interface UnifiedSSEAgentNudgeData {
  type: "agent-nudge";
  nudge: AgentNudge;
}

export interface UnifiedSSEPingData {
  type: "ping";
  time: string;
}

export type UnifiedSSEData =
  | UnifiedSSEConnectedData
  | UnifiedSSESettingsChangedData
  | UnifiedSSEFocusChangedData
  | UnifiedSSEPomodoroTickData
  | UnifiedSSEPomodoroStatusChangedData
  | UnifiedSSEChatSessionCreatedData
  | UnifiedSSEChatSessionUpdatedData
  | UnifiedSSEChatSessionDeletedData
  | UnifiedSSEChatMessageCreatedData
  | UnifiedSSEChatMessageUpdatedData
  | UnifiedSSEToolCallStartedData
  | UnifiedSSEDeviceTokenRevokedData
  | UnifiedSSEDeviceListChangedData
  | UnifiedSSEActiveTabChangedData
  | UnifiedSSEPulsesUpdatedData
  | UnifiedSSEInsightCreatedData
  | UnifiedSSEAgentNudgeData
  | UnifiedSSEHealthReportProgressData
  | UnifiedSSEPingData;

// Journey Types
export interface JourneySiteReferrer {
  domain: string;
  count: number;
}

export interface JourneySite {
  domain: string;
  totalVisits: number;
  totalActiveTimeMs: number;
  uniquePages: number;
  titles: string[];
  summaries: string[];
  topReferrers: JourneySiteReferrer[];
  lastVisitedAt: string;
  firstVisitedAt: string;
}

export interface JourneyReferrerFlow {
  from: string;
  to: string;
  count: number;
}

export interface JourneyResponse {
  period: {
    days: number;
    since: string;
    until: string;
  };
  summary: {
    totalSites: number;
    totalVisits: number;
    totalActiveTimeMs: number;
    avgVisitsPerSite: number;
  };
  sites: JourneySite[];
  referrerFlows: JourneyReferrerFlow[];
}

export interface JourneyPage {
  url: string;
  title: string;
  visits: number;
  totalActiveTime: number;
  summary: string | null;
  lastVisited: string;
}

export interface JourneyDailyActivity {
  date: string;
  visits: number;
  activeTimeMs: number;
}

export interface JourneyDomainDetailResponse {
  domain: string;
  period: {
    days: number;
    since: string;
  };
  summary: {
    totalVisits: number;
    uniquePages: number;
    totalActiveTimeMs: number;
  };
  pages: JourneyPage[];
  referrers: JourneySiteReferrer[];
  dailyActivity: JourneyDailyActivity[];
}

// Cognitive Health Types
export type CognitiveHealthTimeRange = 7 | 14 | 30 | 90;

export interface DailyActiveMinutes {
  date: string;
  activeMinutes: number;
}

export interface DailyActivityTimes {
  date: string;
  firstActivityTime: string | null;
  lastActivityTime: string | null;
  firstActivityHour: number | null;
  lastActivityHour: number | null;
}

export interface DailyLateNightMinutes {
  date: string;
  lateNightMinutes: number;
}

export interface FragmentationRate {
  totalVisits: number;
  fragmentedVisits: number;
  fragmentationPercentage: number;
}

export interface DailyFragmentation {
  date: string;
  fragmentationPercentage: number;
}

export interface DailyFocusMinutes {
  date: string;
  focusMinutes: number;
  sessionsCount: number;
}

export interface LongestFocusBlock {
  date: string;
  longestBlockMinutes: number;
  focusItem: string | null;
}

export interface NudgeFrequency {
  date: string;
  totalNudges: number;
  doomscrollNudges: number;
  distractionNudges: number;
  breakNudges: number;
  focusDriftNudges: number;
  encouragementNudges: number;
}

export interface MediaDiet {
  youtubeMinutes: number;
  readingMinutes: number;
  audioMinutes: number;
  youtubePercentage: number;
  readingPercentage: number;
  audioPercentage: number;
}

export interface DailyMediaDiet {
  date: string;
  youtubeMinutes: number;
  readingMinutes: number;
  audioMinutes: number;
}

export interface AttentionEntropy {
  entropy: number;
  topDomains: Array<{ domain: string; percentage: number }>;
  uniqueDomains: number;
}

export interface CognitiveHealthMetrics {
  timeRange: CognitiveHealthTimeRange;
  averageDailyActiveMinutes: number;
  activeMinutesTrend: number;
  dailyActiveMinutes: DailyActiveMinutes[];
  averageFirstActivityHour: number | null;
  averageLastActivityHour: number | null;
  dailyActivityTimes: DailyActivityTimes[];
  averageLateNightMinutes: number;
  lateNightTrend: number;
  dailyLateNightMinutes: DailyLateNightMinutes[];
  averageFocusMinutes: number;
  focusTrend: number;
  dailyFocusMinutes: DailyFocusMinutes[];
  longestFocusBlocks: LongestFocusBlock[];
  overallFragmentationRate: FragmentationRate;
  dailyFragmentation: DailyFragmentation[];
  averageNudgesPerDay: number;
  nudgeTrend: number;
  dailyNudges: NudgeFrequency[];
  mediaDiet: MediaDiet;
  dailyMediaDiet: DailyMediaDiet[];
  attentionEntropy: AttentionEntropy;
}

export interface CognitiveHealthSummary {
  timeRange: number;
  activity: {
    averageActiveMinutes: number;
    trend: number;
    trendLabel: "up" | "down" | "stable";
  };
  sleepProxy: {
    avgFirstActivityHour: number | null;
    avgLastActivityHour: number | null;
    lateNightMinutes: number;
    lateNightTrend: number;
  };
  focus: {
    averageFocusMinutes: number;
    trend: number;
    fragmentationRate: number;
  };
  nudges: {
    averagePerDay: number;
    trend: number;
    breakdown: {
      doomscroll: number;
      distraction: number;
      break: number;
      focusDrift: number;
    };
  };
  mediaDiet: {
    youtube: number;
    reading: number;
    audio: number;
    youtubePercentage: number;
    readingPercentage: number;
    audioPercentage: number;
  };
  attention: {
    entropy: number;
    uniqueDomains: number;
    topDomains: Array<{ domain: string; percentage: number }>;
  };
}

export interface CognitiveHealthNudge {
  id: string;
  type: string;
  message: string;
  confidence: number;
  reasoning: string | null;
  response: string | null;
  createdAt: string;
}

export interface ReportGenerationStep {
  step: string;
  message: string;
  toolName?: string;
  toolResult?: unknown;
  timestamp: string;
}

export interface CognitiveHealthReport {
  id: string;
  timeRange: CognitiveHealthTimeRange;
  content: string;
  generationSteps: ReportGenerationStep[];
  createdAt: string;
}

export interface CognitiveHealthMetricsResponse {
  success: boolean;
  metrics: CognitiveHealthMetrics;
}

export interface CognitiveHealthSummaryResponse {
  success: boolean;
  summary: CognitiveHealthSummary;
}

export interface CognitiveHealthNudgesResponse {
  success: boolean;
  nudges: CognitiveHealthNudge[];
}

export interface CognitiveHealthReportResponse {
  success: boolean;
  report: CognitiveHealthReport;
}

// Health Report Progress SSE Event
export interface UnifiedSSEHealthReportProgressData {
  type: "health-report-progress";
  reportId: string;
  progress: ReportGenerationStep;
}
