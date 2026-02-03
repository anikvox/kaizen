// Client
export { ApiClient, ApiError, createAuthProvider, createStaticAuthProvider } from "./client"

// Services
export {
  ChatService,
  AIService,
  ActivityService,
  DeviceTokenService,
  SettingsService
} from "./services"

// Types
export type {
  // Auth
  AuthProvider,
  ApiClientConfig,
  RequestOptions,
  // Chat
  ChatMessage,
  ChatSession,
  ChatStreamChunk,
  ChatResponse,
  // AI
  AITextResponse,
  // Activity
  TextActivityPayload,
  ImageActivityPayload,
  AudioActivityPayload,
  WebsiteVisitPayload,
  // Settings
  UserSettings,
  SettingsSyncResponse
} from "./types"

// Device Token types
export type {
  DeviceTokenStatus,
  LinkDeviceTokenRequest,
  LinkDeviceTokenResponse
} from "./services"
