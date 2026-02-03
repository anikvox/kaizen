/**
 * Dashboard Chat Service
 *
 * Uses the shared @kaizen/api with Clerk JWT authentication.
 */

import {
  ApiClient,
  ChatService,
  createStaticAuthProvider,
  type ChatMessage as ApiChatMessage,
  type ChatSession,
  type ChatStreamChunk
} from "@kaizen/api"

// Extended ChatMessage with frontend-specific fields
export type ChatMessage = ApiChatMessage & {
  imagePreview?: string
  audioName?: string
}

// Re-export types for backward compatibility
export type { ChatSession }

export type StreamResponse = ChatStreamChunk

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "http://localhost:60092/api"

/**
 * Dashboard Chat Service that wraps the shared @kaizen/api ChatService.
 * Uses Clerk JWT token for authentication.
 */
export class DashboardChatService {
  private service: ChatService

  constructor(token: string) {
    const client = new ApiClient({
      baseUrl: API_BASE_URL,
      authProvider: createStaticAuthProvider(token)
    })
    this.service = new ChatService(client)
  }

  async getSessions(): Promise<ChatSession[]> {
    return this.service.getSessions()
  }

  async createSession(title?: string): Promise<ChatSession> {
    return this.service.createSession(title || "New Chat")
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.service.getMessages(sessionId)
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.service.deleteSession(sessionId)
  }

  async *sendMessageStreaming(
    sessionId: string,
    content: string,
    context?: string,
    image?: File,
    audio?: File
  ): AsyncGenerator<StreamResponse, void, unknown> {
    yield* this.service.sendMessageStreaming(sessionId, content, {
      context,
      image,
      audio
    })
  }
}
