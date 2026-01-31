// Chat service for handling AI conversations
// This will be connected to kaizen backend in the future

export type ChatResponse = {
  text: string
  done: boolean
}

export class ChatService {
  private apiUrl: string
  private chatId: string
  private contextWindowMs: number = 30 * 60 * 1000 // 30 minutes default

  constructor(chatId?: string, apiUrl?: string) {
    this.chatId = chatId || "default"
    // Use kaizen backend URL from environment or default to localhost
    this.apiUrl = apiUrl || process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"
  }

  setContextWindowMs(ms: number) {
    this.contextWindowMs = ms
  }

  // Get chat session data
  async getSession() {
    try {
      // TODO: Fetch session from kaizen backend
      return {
        chatId: this.chatId,
        timestamp: Date.now(),
        userActivity: []
      }
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
      // TODO: Connect to kaizen backend API
      // For now, return dummy streaming response
      const dummyResponse = "This is a placeholder response from the chat service. In production, this will connect to the kaizen backend API for AI-powered responses."

      const words = dummyResponse.split(" ")
      for (let i = 0; i < words.length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        yield {
          text: words.slice(0, i + 1).join(" "),
          done: i === words.length - 1
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
    try {
      // TODO: Connect to kaizen backend API
      // For now, return dummy response
      return "This is a placeholder response. The chat will be connected to kaizen backend."
    } catch (error) {
      console.error("Chat service error:", error)
      return "Sorry, I encountered an error. Please try again."
    }
  }
}

// Export singleton instance
export const chatService = new ChatService()
