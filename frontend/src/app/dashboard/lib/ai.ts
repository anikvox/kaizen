/**
 * Dashboard AI Service
 *
 * Uses the shared @kaizen/api with Clerk JWT authentication.
 */

import {
  ApiClient,
  AIService as BaseAIService,
  createStaticAuthProvider
} from "@kaizen/api"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "http://localhost:60092/api"

/**
 * AI Service for the dashboard.
 * Uses Clerk JWT token for authentication.
 */
export class AIService {
  private service: BaseAIService

  constructor(token: string) {
    const client = new ApiClient({
      baseUrl: API_BASE_URL,
      authProvider: createStaticAuthProvider(token)
    })
    this.service = new BaseAIService(client)
  }

  async write(prompt: string): Promise<string> {
    return this.service.write(prompt)
  }

  async rewrite(text: string, context?: string): Promise<string> {
    return this.service.rewrite(text, context)
  }

  async summarize(text: string): Promise<string> {
    return this.service.summarize(text)
  }
}
