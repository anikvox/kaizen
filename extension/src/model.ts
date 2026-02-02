// AI model wrappers for Chrome AI and kaizen backend
// These connect to the kaizen backend API

export type AIModelCapabilities = {
  available: boolean
  status: "readily" | "after-download" | "no"
}

export type AIWriter = {
  write: (input: string) => Promise<string>
  writeStreaming: (input: string) => AsyncGenerator<string, void, unknown>
}

export type AIRewriter = {
  rewrite: (input: string, context?: string) => Promise<string>
  rewriteStreaming: (
    input: string,
    context?: string
  ) => AsyncGenerator<string, void, unknown>
}

export type AISummarizer = {
  summarize: (input: string, type?: string, format?: string, length?: string) => Promise<string>
  summarizeStreaming: (
    input: string,
    type?: string,
    format?: string,
    length?: string
  ) => AsyncGenerator<string, void, unknown>
}

const API_BASE_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

// Get device token from storage
const getDeviceToken = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get("deviceToken")
  return result.deviceToken || null
}

// Get AI writer instance
export const getWriter = async (): Promise<AIWriter> => {
  const token = await getDeviceToken()
  
  return {
    write: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      
      console.log("[AI Writer] Calling API with token:", token?.substring(0, 10) + "...")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: input })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("[AI Writer] API error:", response.status, errorText)
        throw new Error(`Failed to generate text: ${response.status}`)
      }
      
      const data = await response.json()
      return data.text
    },
    writeStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/write`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: input })
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate text")
      }
      
      const data = await response.json()
      const words = data.text.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield word + " "
      }
    }
  }
}

// Get AI rewriter instance
export const getRewriter = async (): Promise<AIRewriter> => {
  const token = await getDeviceToken()
  
  return {
    rewrite: async (input: string, context?: string) => {
      if (!token) throw new Error("Not authenticated")
      
      console.log("[AI Rewriter] Calling API with token:", token?.substring(0, 10) + "...")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/rewrite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: input, context })
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error("[AI Rewriter] API error:", response.status, errorText)
        throw new Error(`Failed to rewrite text: ${response.status}`)
      }
      
      const data = await response.json()
      return data.text
    },
    rewriteStreaming: async function* (input: string, context?: string) {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/rewrite`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: input, context })
      })
      
      if (!response.ok) {
        throw new Error("Failed to rewrite text")
      }
      
      const data = await response.json()
      const words = data.text.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield word + " "
      }
    }
  }
}

// Get AI summarizer instance
export const getSummarizer = async (): Promise<AISummarizer> => {
  const token = await getDeviceToken()
  
  return {
    summarize: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: input })
      })
      
      if (!response.ok) {
        throw new Error("Failed to summarize text")
      }
      
      const data = await response.json()
      return data.text
    },
    summarizeStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/summarize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ text: input })
      })
      
      if (!response.ok) {
        throw new Error("Failed to summarize text")
      }
      
      const data = await response.json()
      const words = data.text.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield word + " "
      }
    }
  }
}

// Get language model instance
export const getLanguageModel = async () => {
  const token = await getDeviceToken()
  
  return {
    prompt: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: input })
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate response")
      }
      
      const data = await response.json()
      return data.text
    },
    promptStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      
      const response = await fetch(`${API_BASE_URL}/api/ai/prompt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: input })
      })
      
      if (!response.ok) {
        throw new Error("Failed to generate response")
      }
      
      const data = await response.json()
      const words = data.text.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield word + " "
      }
    }
  }
}

// Check if Chrome AI is available
export const checkAIAvailability = async (): Promise<AIModelCapabilities> => {
  const token = await getDeviceToken()
  return {
    available: !!token,
    status: token ? "readily" : "no"
  }
}
