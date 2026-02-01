// Chat service for handling AI conversations with kaizen backend

import { Storage } from "@plasmohq/storage"

export type ChatResponse = {
  text: string
  done: boolean
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  createdAt: string
}

export type ChatSession = {
  id: string
  title: string
  updatedAt: string
  messages?: ChatMessage[]
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
      // Fallback for Plasmo storage
      const deviceToken = await storage.get(DEVICE_TOKEN_KEY)
      return deviceToken
    } catch (error) {
      console.error("Failed to get device token:", error)
      return null
    }
  }

  // Get current session info (for compatibility with sidepanel usage tracking)
  async getSession() {
    try {
      const sessions = await this.getSessions()
      if (sessions.length > 0) {
        // Mock usage info for now as backend doesn't provide it yet
        return {
          ...sessions[0],
          inputUsage: 0,
          inputQuota: 100
        }
      }
      return null
    } catch (error) {
      return null
    }
  }

  // Get all chat sessions for user
  async getSessions(): Promise<ChatSession[]> {
    try {
      const token = await this.getAuthToken()
      if (!token) return []

      const response = await fetch(`${this.apiUrl}/chat/sessions`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) throw new Error("Failed to fetch sessions")
      return response.json()
    } catch (error) {
      console.error("Get sessions error:", error)
      return []
    }
  }

  // Create a new session
  async createSession(title?: string): Promise<ChatSession | null> {
    try {
      const token = await this.getAuthToken()
      if (!token) return null

      const response = await fetch(`${this.apiUrl}/chat/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: title || "New Extension Chat" })
      })

      if (!response.ok) throw new Error("Failed to create session")
      return response.json()
    } catch (error) {
      console.error("Create session error:", error)
      return null
    }
  }

  // Get messages for a session
  async getMessages(sessionId?: string): Promise<ChatMessage[]> {
    try {
      const id = sessionId || this.chatId
      if (id === "default") return []

      const token = await this.getAuthToken()
      if (!token) return []

      const response = await fetch(`${this.apiUrl}/chat/sessions/${id}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) throw new Error("Failed to fetch messages")
      return response.json()
    } catch (error) {
      console.error("Get messages error:", error)
      return []
    }
  }

  // Stream AI response
  async *streamResponse(prompt: string, context?: string): AsyncGenerator<ChatResponse, void, unknown> {
    const token = await this.getAuthToken()
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
      const response = await fetch(`${this.apiUrl}/chat/sessions/${this.chatId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          content: prompt,
          context: context
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        yield {
          text: `Error: ${errorData.error || "Failed to get response"}`,
          done: true
        }
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        yield {
          text: "Error: No response body",
          done: true
        }
        return
      }

      const decoder = new TextDecoder()
      let fullText = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split("\n")

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.substring(6).trim()
            if (!dataStr) continue

            let data
            try {
              data = JSON.parse(dataStr)
            } catch (e) {
              continue
            }

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
