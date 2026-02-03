// =============================================================================
// AUTH TYPES
// =============================================================================

/**
 * Auth provider interface - implement this for different auth mechanisms.
 * Extension uses device tokens from chrome storage.
 * Frontend uses Clerk JWT tokens.
 */
export interface AuthProvider {
  getToken(): Promise<string | null>
}

// =============================================================================
// CLIENT TYPES
// =============================================================================

export interface ApiClientConfig {
  baseUrl: string
  authProvider: AuthProvider
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  body?: unknown
  headers?: Record<string, string>
  /** Skip JSON content-type header (e.g., for FormData) */
  skipContentType?: boolean
}

// =============================================================================
// CHAT TYPES
// =============================================================================

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
  metadata?: {
    hasImage?: boolean
    hasAudio?: boolean
    imageFileName?: string
    audioFileName?: string
    imagePreview?: string
  }
}

export interface ChatSession {
  id: string
  title: string
  updatedAt: string
  messages?: ChatMessage[]
}

export interface ChatStreamChunk {
  chunk?: string
  title?: string
  done?: boolean
  error?: string
}

export interface ChatResponse {
  text: string
  done: boolean
}

// =============================================================================
// AI TYPES
// =============================================================================

export interface AITextResponse {
  text: string
}

// =============================================================================
// ACTIVITY TYPES
// =============================================================================

export interface TextActivityPayload {
  url: string
  text: string
}

export interface ImageActivityPayload {
  url: string
  src: string
  alt: string
  title: string
  width: number
  caption: string
}

export interface AudioActivityPayload {
  url: string
  src: string
  title: string
  duration: number
  summary: string
}

export interface WebsiteVisitPayload {
  event: "opened" | "active-time-update" | "closed"
  url: string
  title?: string
  metadata?: Record<string, string>
  referrer?: string
  time?: number
  timestamp: number
}

// =============================================================================
// SETTINGS TYPES
// =============================================================================

export interface UserSettings {
  // Cognitive Attention Settings
  sustainedTime: number // Focus duration threshold (ms)
  idleThreshold: number // Inactivity time before idle detection (ms)
  wordsPerMinute: number // Reading speed calculation parameter
  debugMode: boolean // Console logging for debugging
  showOverlay: boolean // Visual indicator for attention tracking

  // Doomscrolling Detection
  itemsThreshold: number // Items before rapid scrolling alert
  timeWindow: number // Tracking period for doomscrolling (ms)

  // Focus Management
  focusInactivityThreshold: number // Time before focus pause detection (ms)

  // System/Maintenance
  gcInterval: number // Data cleanup frequency (ms)

  // Model Settings (Advanced)
  modelTemperature: number // AI model creativity parameter
  modelTopP: number // Nucleus sampling parameter

  // Version for sync
  version: number
}

export interface SettingsSyncResponse {
  updated: boolean
  settings?: UserSettings
}
