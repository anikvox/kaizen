// AI model wrappers for Chrome AI and kaizen backend
// These will be replaced with kaizen backend API calls

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

// Get AI writer instance
export const getWriter = async (): Promise<AIWriter> => {
  // TODO: Connect to kaizen backend
  return {
    write: async (input: string) => {
      return `Rewritten: ${input}`
    },
    writeStreaming: async function* (input: string) {
      const response = `Rewritten: ${input}`
      const words = response.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        yield word + " "
      }
    }
  }
}

// Get AI rewriter instance
export const getRewriter = async (): Promise<AIRewriter> => {
  // TODO: Connect to kaizen backend
  return {
    rewrite: async (input: string, context?: string) => {
      return `Rewritten: ${input}`
    },
    rewriteStreaming: async function* (input: string, context?: string) {
      const response = `Rewritten: ${input}`
      const words = response.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        yield word + " "
      }
    }
  }
}

// Get AI summarizer instance
export const getSummarizer = async (): Promise<AISummarizer> => {
  // TODO: Connect to kaizen backend
  return {
    summarize: async (input: string) => {
      return `Summary: ${input.substring(0, 100)}...`
    },
    summarizeStreaming: async function* (input: string) {
      const response = `Summary: ${input.substring(0, 100)}...`
      const words = response.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        yield word + " "
      }
    }
  }
}

// Get language model instance
export const getLanguageModel = async () => {
  // TODO: Connect to kaizen backend
  return {
    prompt: async (input: string) => {
      return `Response to: ${input}`
    },
    promptStreaming: async function* (input: string) {
      const response = `Response to: ${input}`
      const words = response.split(" ")
      for (const word of words) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        yield word + " "
      }
    }
  }
}

// Check if Chrome AI is available
export const checkAIAvailability = async (): Promise<AIModelCapabilities> => {
  // For now, return not available - will use kaizen backend instead
  return {
    available: false,
    status: "no"
  }
}
