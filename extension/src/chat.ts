// Chat service for handling AI conversations with kaizen backend

import { Storage } from "@plasmohq/storage"

export type ChatResponse = {
  text: string
  done: boolean
}

const storage = new Storage({ area: "local" })
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

export class ChatService {
  private apiUrl: string
  private chatId: string
  private contextWindowMs: number = 30 * 60 * 1000 // 30 minutes default

  constructor(chatId?: string, apiUrl?: string) {
    this.chatId = chatId || "default"
    this.apiUrl = apiUrl || `${SERVER_URL}`
  }

  setContextWindowMs(ms: number) {
    this.contextWindowMs = ms
  }

  // Get authorization token from storage
  private async getAuthToken(): Promise<string | null> {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
        return result[DEVICE_TOKEN_KEY] || null
      }
      // Fallback for Plasmo storage if chrome API is not available (unlikely in extension context)
      const deviceToken = await storage.get(DEVICE_TOKEN_KEY)
      return deviceToken
    } catch (error) {
      console.error("Failed to get device token:", error)
      return null
    }
  }

  // Get or create chat session
  async getSession() {
    try {
      const token = await this.getAuthToken()
      if (!token) {
        return null
      }

      // Try to get existing session
      const response = await fetch(`${this.apiUrl}/chat/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error("Failed to fetch sessions")
      }

      const sessions = await response.json()

      // Return the most recent session or create new one
      if (sessions.length > 0) {
        return sessions[0]
      }

      // Create new session
      const createResponse = await fetch(`${this.apiUrl}/chat/sessions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'New Chat' })
      })

      if (!createResponse.ok) {
        throw new Error("Failed to create session")
      }

      return await createResponse.json()
    } catch (error) {
      console.error("Failed to get session:", error)
      return null
    }
  }

  // Stream chat responses from the backend
  async *streamResponse(
    prompt: string,
    context?: string
  ): AsyncGenerator<ChatResponse, void, unknown> {
    try {
      const token = await this.getAuthToken()
      if (!token) {
        yield {
          text: "Error: Not authenticated. Please link your device first.",
          done: true
        }
        return
      }

      // Get or create session
      const session = await this.getSession()
      if (!session) {
        yield {
          text: "Error: Failed to create chat session.",
          done: true
        }
        return
      }

      // Send message to backend with SSE
      const response = await fetch(`${this.apiUrl}/chat/sessions/${session.id}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ content: prompt, context })
      })

      if (!response.ok) {
        throw new Error("Failed to send message")
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error("No response stream")
      }

      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.substring(6))

            if (data.error) {
              yield {
                text: `Error: ${data.error}`,
                done: true
              }
              return
            }

            if (data.chunk) {
              fullText += data.chunk
              yield {
                text: fullText,
                done: false
              }
            }

            if (data.done) {
              yield {
                text: fullText,
                done: true
              }
              return
            }
          }
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

  // Send a single message and get complete response
  async sendMessage(prompt: string, context?: string): Promise<string> {
    let fullResponse = ""

    for await (const chunk of this.streamResponse(prompt, context)) {
      fullResponse = chunk.text
      if (chunk.done) break
    }

    return fullResponse
  }
}

// Export singleton instance
export const chatService = new ChatService()
