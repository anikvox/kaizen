/**
 * AI model wrappers for kaizen backend.
 *
 * Provides backward-compatible API for the extension while using
 * the shared @kaizen/api under the hood.
 */

import {
  ApiClient,
  AIService,
  createAuthProvider
} from "@kaizen/api"

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
const DEVICE_TOKEN_KEY = "deviceToken"

/**
 * Auth provider that retrieves device token from Chrome storage.
 */
const extensionAuthProvider = createAuthProvider(async () => {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch {
    return null
  }
})

// Create shared client and service
const apiClient = new ApiClient({
  baseUrl: `${API_BASE_URL}/api`,
  authProvider: extensionAuthProvider
})

const aiService = new AIService(apiClient)

/**
 * Get device token from storage
 */
const getDeviceToken = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
  return result[DEVICE_TOKEN_KEY] || null
}

/**
 * Get AI writer instance
 */
export const getWriter = async (): Promise<AIWriter> => {
  const token = await getDeviceToken()

  return {
    write: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      console.log("[AI Writer] Calling API with token:", token?.substring(0, 10) + "...")
      return aiService.write(input)
    },
    writeStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      yield* aiService.writeStreaming(input)
    }
  }
}

/**
 * Get AI rewriter instance
 */
export const getRewriter = async (): Promise<AIRewriter> => {
  const token = await getDeviceToken()

  return {
    rewrite: async (input: string, context?: string) => {
      if (!token) throw new Error("Not authenticated")
      console.log("[AI Rewriter] Calling API with token:", token?.substring(0, 10) + "...")
      return aiService.rewrite(input, context)
    },
    rewriteStreaming: async function* (input: string, context?: string) {
      if (!token) throw new Error("Not authenticated")
      yield* aiService.rewriteStreaming(input, context)
    }
  }
}

/**
 * Get AI summarizer instance
 */
export const getSummarizer = async (): Promise<AISummarizer> => {
  const token = await getDeviceToken()

  return {
    summarize: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      return aiService.summarize(input)
    },
    summarizeStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      yield* aiService.summarizeStreaming(input)
    }
  }
}

/**
 * Get language model instance
 */
export const getLanguageModel = async () => {
  const token = await getDeviceToken()

  return {
    prompt: async (input: string) => {
      if (!token) throw new Error("Not authenticated")
      return aiService.prompt(input)
    },
    promptStreaming: async function* (input: string) {
      if (!token) throw new Error("Not authenticated")
      // Use write streaming as a proxy for prompt streaming
      const text = await aiService.prompt(input)
      const words = text.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 30))
        yield word + " "
      }
    }
  }
}

/**
 * Check if AI is available (device is authenticated)
 */
export const checkAIAvailability = async (): Promise<AIModelCapabilities> => {
  const token = await getDeviceToken()
  return {
    available: !!token,
    status: token ? "readily" : "no"
  }
}
