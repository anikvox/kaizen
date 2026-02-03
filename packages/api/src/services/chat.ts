import { ApiClient } from "../client"
import type { ChatMessage, ChatSession, ChatStreamChunk, ChatResponse } from "../types"

/**
 * Chat service for AI conversations.
 * Works with both extension and frontend.
 */
export class ChatService {
  constructor(private client: ApiClient) {}

  /**
   * Get all chat sessions for the user
   */
  async getSessions(): Promise<ChatSession[]> {
    try {
      return await this.client.get<ChatSession[]>("/chat/sessions")
    } catch (error) {
      console.error("Failed to fetch chat sessions:", error)
      return []
    }
  }

  /**
   * Create a new chat session
   */
  async createSession(title?: string): Promise<ChatSession> {
    return this.client.post<ChatSession>("/chat/sessions", {
      title: title || "New Chat"
    })
  }

  /**
   * Get messages for a specific session
   */
  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    try {
      return await this.client.get<ChatMessage[]>(`/chat/sessions/${sessionId}/messages`)
    } catch (error) {
      console.error("Failed to fetch messages:", error)
      return []
    }
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.client.delete(`/chat/sessions/${sessionId}`)
  }

  /**
   * Send a message and stream the response.
   * Yields ChatStreamChunk objects with chunk/title/done/error fields.
   */
  async *sendMessageStreaming(
    sessionId: string,
    content: string,
    options?: {
      context?: string
      image?: File
      audio?: File
    }
  ): AsyncGenerator<ChatStreamChunk, void, unknown> {
    // Build request body - use FormData if files present
    let body: FormData | { content: string; context?: string }

    if (options?.image || options?.audio) {
      const formData = new FormData()
      formData.append("content", content)
      if (options.context) formData.append("context", options.context)
      if (options.image) formData.append("image", options.image)
      if (options.audio) formData.append("audio", options.audio)
      body = formData
    } else {
      body = { content, context: options?.context }
    }

    const response = await this.client.requestStream(
      `/chat/sessions/${sessionId}/messages`,
      {
        method: "POST",
        body,
        skipContentType: body instanceof FormData
      }
    )

    const reader = response.body?.getReader()
    if (!reader) {
      yield { error: "No response body" }
      return
    }

    const decoder = new TextDecoder()
    let buffer = ""

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split("\n")
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || ""

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue

        const dataStr = line.substring(6).trim()
        if (!dataStr) continue

        try {
          const data = JSON.parse(dataStr)

          if (data.error) {
            yield { error: data.error }
            return
          }

          if (data.type === "title_update") {
            yield { title: data.title }
          } else if (data.chunk) {
            yield { chunk: data.chunk }
          }

          if (data.done) {
            yield { done: true }
            return
          }
        } catch {
          // Skip invalid JSON lines
          continue
        }
      }
    }
  }

  /**
   * Send a message and get the complete response.
   * Convenience wrapper around sendMessageStreaming.
   */
  async sendMessage(
    sessionId: string,
    content: string,
    options?: {
      context?: string
      image?: File
      audio?: File
    }
  ): Promise<ChatResponse> {
    let fullText = ""

    for await (const chunk of this.sendMessageStreaming(sessionId, content, options)) {
      if (chunk.error) {
        return { text: `Error: ${chunk.error}`, done: true }
      }
      if (chunk.chunk) {
        fullText += chunk.chunk
      }
      if (chunk.done) {
        break
      }
    }

    return { text: fullText, done: true }
  }

  /**
   * Get a URL to download an uploaded file.
   * Returns a blob URL that can be used in an img/audio tag.
   */
  async getUploadUrl(filename: string): Promise<string> {
    const response = await this.client.requestStream(`/chat/uploads/${filename}`, {
      method: "GET"
    })
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  }
}
