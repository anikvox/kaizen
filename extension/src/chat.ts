/**
 * Chat service for handling AI conversations with kaizen backend.
 *
 * This is a backward-compatible wrapper around @kaizen/api ChatService
 * that maintains the stateful chat ID pattern used by the extension.
 */

import {
  ApiClient,
  ChatService as BaseChatService,
  createAuthProvider,
  type ChatMessage,
  type ChatSession,
  type ChatResponse
} from "@kaizen/api"

// Re-export API types with distinct names to avoid conflicts with local db types
export type { ChatSession, ChatResponse }
export type { ChatMessage as ApiChatMessage } from "@kaizen/api"

const DEVICE_TOKEN_KEY = "kaizen_device_token"
const SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

/**
 * Auth provider that retrieves device token from Chrome storage.
 */
const extensionAuthProvider = createAuthProvider(async () => {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
      return result[DEVICE_TOKEN_KEY] || null
    }
    return null
  } catch (error) {
    console.error("Failed to get device token:", error)
    return null
  }
})

/**
 * Extension ChatService that wraps the shared @kaizen/api ChatService
 * with stateful session management.
 */
export class ChatService {
  private chatId: string
  private baseService: BaseChatService
  private client: ApiClient

  constructor(chatId?: string, apiUrl?: string) {
    this.chatId = chatId || "default"
    this.client = new ApiClient({
      baseUrl: `${apiUrl || SERVER_URL}`,
      authProvider: extensionAuthProvider
    })
    this.baseService = new BaseChatService(this.client)
  }

  /**
   * Set context window (no-op for backward compatibility)
   * @deprecated Context window is now handled by the server
   */
  setContextWindowMs(_ms: number) {
    // No-op - context window is handled by the server
  }

  /**
   * Get current session info (for compatibility with sidepanel usage tracking)
   */
  async getSession() {
    try {
      const sessions = await this.getSessions()
      if (sessions.length > 0) {
        return {
          ...sessions[0],
          inputUsage: 0,
          inputQuota: 100
        }
      }
      return null
    } catch {
      return null
    }
  }

  /**
   * Get all chat sessions for user
   */
  async getSessions(): Promise<ChatSession[]> {
    return this.baseService.getSessions()
  }

  /**
   * Create a new session
   */
  async createSession(title?: string): Promise<ChatSession | null> {
    try {
      return await this.baseService.createSession(title || "New Extension Chat")
    } catch (error) {
      console.error("Create session error:", error)
      return null
    }
  }

  /**
   * Get messages for a session
   */
  async getMessages(sessionId?: string): Promise<ChatMessage[]> {
    const id = sessionId || this.chatId
    if (id === "default") return []
    return this.baseService.getMessages(id)
  }

  /**
   * Stream AI response using the stored chatId.
   * Yields ChatResponse objects with accumulated text.
   */
  async *streamResponse(
    prompt: string,
    context?: string,
    image?: File,
    audio?: File
  ): AsyncGenerator<ChatResponse, void, unknown> {
    // Check auth first
    const token = await this.client.getToken()
    if (!token) {
      yield {
        text: "Error: Not authenticated. Please link your device first.",
        done: true
      }
      return
    }

    if (!this.chatId || this.chatId === "default" || this.chatId === "") {
      yield {
        text: "Error: No chat session initialized.",
        done: true
      }
      return
    }

    try {
      let fullText = ""

      for await (const chunk of this.baseService.sendMessageStreaming(
        this.chatId,
        prompt,
        { context, image, audio }
      )) {
        if (chunk.error) {
          yield { text: `Error: ${chunk.error}`, done: true }
          return
        }

        if (chunk.chunk) {
          fullText += chunk.chunk
          yield { text: fullText, done: false }
        }

        if (chunk.done) {
          yield { text: fullText, done: true }
          return
        }
      }
    } catch (error) {
      console.error("Chat service error:", error)
      yield {
        text: "Sorry, I encountered an error. Please try again.",
        done: true
      }
    }
  }

  /**
   * Send a single message and get complete response
   */
  async sendMessage(prompt: string, context?: string): Promise<string> {
    let fullResponse = ""

    for await (const chunk of this.streamResponse(prompt, context)) {
      fullResponse = chunk.text
      if (chunk.done) break
    }

    return fullResponse
  }
}

// Export singleton instance for simple usage
export const chatService = new ChatService()
