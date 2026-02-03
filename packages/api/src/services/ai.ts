import type { ApiClient } from "../client"
import type { AITextResponse } from "../types"

/**
 * AI service for text generation, rewriting, and summarization.
 * Works with both extension and frontend.
 */
export class AIService {
  constructor(private client: ApiClient) {}

  /**
   * Generate text from a prompt
   */
  async write(prompt: string): Promise<string> {
    const response = await this.client.post<AITextResponse>("/ai/write", { prompt })
    return response.text
  }

  /**
   * Rewrite text with optional context
   */
  async rewrite(text: string, context?: string): Promise<string> {
    const response = await this.client.post<AITextResponse>("/ai/rewrite", {
      text,
      context
    })
    return response.text
  }

  /**
   * Summarize text
   */
  async summarize(text: string): Promise<string> {
    const response = await this.client.post<AITextResponse>("/ai/summarize", { text })
    return response.text
  }

  /**
   * Generic prompt endpoint
   */
  async prompt(input: string): Promise<string> {
    const response = await this.client.post<AITextResponse>("/ai/prompt", { prompt: input })
    return response.text
  }

  /**
   * Simulated streaming for write (splits response into words)
   * Note: Server doesn't support real streaming for these endpoints yet
   */
  async *writeStreaming(prompt: string): AsyncGenerator<string, void, unknown> {
    const text = await this.write(prompt)
    const words = text.split(" ")
    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      yield word + " "
    }
  }

  /**
   * Simulated streaming for rewrite
   */
  async *rewriteStreaming(text: string, context?: string): AsyncGenerator<string, void, unknown> {
    const result = await this.rewrite(text, context)
    const words = result.split(" ")
    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      yield word + " "
    }
  }

  /**
   * Simulated streaming for summarize
   */
  async *summarizeStreaming(text: string): AsyncGenerator<string, void, unknown> {
    const result = await this.summarize(text)
    const words = result.split(" ")
    for (const word of words) {
      await new Promise((resolve) => setTimeout(resolve, 30))
      yield word + " "
    }
  }
}
