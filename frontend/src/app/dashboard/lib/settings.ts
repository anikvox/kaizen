/**
 * Dashboard Settings Service
 *
 * Uses the shared @kaizen/api with Clerk JWT authentication.
 */

import {
  ApiClient,
  SettingsService as BaseSettingsService,
  createStaticAuthProvider,
  type UserSettings
} from "@kaizen/api"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : "http://localhost:60092/api"

/**
 * Settings Service for the dashboard.
 * Uses Clerk JWT token for authentication.
 */
export class SettingsService {
  private service: BaseSettingsService

  constructor(token: string) {
    const client = new ApiClient({
      baseUrl: API_BASE_URL,
      authProvider: createStaticAuthProvider(token)
    })
    this.service = new BaseSettingsService(client)
  }

  async getSettings(): Promise<UserSettings> {
    return this.service.getSettings()
  }

  async saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    return this.service.saveSettings(settings)
  }
}

export type { UserSettings }
