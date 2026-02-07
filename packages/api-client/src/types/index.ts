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
}

// Chat Types
export type ChatMessageRole = "user" | "assistant" | "tool";
export type ChatMessageStatus = "sending" | "sent" | "typing" | "streaming" | "finished" | "error";

/**
 * Attention time range options for chat context.
 * - "30m": Last 30 minutes
 * - "2h": Last 2 hours
 * - "1d": Last 24 hours
 * - "all": All available data
 */
export type ChatAttentionRange = "30m" | "2h" | "1d" | "all";

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

// Quiz Types (stateless - progress tracked on client)
export interface QuizQuestion {
  id: string;
  questionIndex: number;
  question: string;
  options: string[];
  correctIndex: number;
}

export interface GeneratedQuiz {
  questions: QuizQuestion[];
  generatedAt: string;
  activityDays: number;
  optionsCount: number;
}

export type QuizJobStatus = "pending" | "processing" | "completed" | "failed";

export interface QuizJobResponse {
  jobId?: string;
  status: QuizJobStatus;
  quiz?: GeneratedQuiz;
  error?: string;
  code?: string;
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
