import type { ApiClient } from "../client"
import type { UserSettings, SettingsSyncResponse } from "../types"

/**
 * Settings service for managing user settings sync.
 * Used by both extension and frontend to get/save settings.
 */
export class SettingsService {
  private abortController: AbortController | null = null

  constructor(private client: ApiClient) {}

  /**
   * Get current user settings
   */
  async getSettings(): Promise<UserSettings> {
    return this.client.get<UserSettings>("/settings")
  }

  /**
   * Save user settings
   */
  async saveSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    return this.client.post<UserSettings>("/settings", settings)
  }

  /**
   * Long poll for settings changes.
   * Returns when settings are updated or timeout is reached.
   *
   * @param currentVersion - Current settings version on client
   * @param timeout - Max time to wait in ms (default 30s)
   */
  async syncSettings(currentVersion: number, timeout: number = 30000): Promise<SettingsSyncResponse> {
    // Cancel any existing sync request
    this.cancelSync()

    this.abortController = new AbortController()

    try {
      const response = await fetch(
        `${await this.getBaseUrl()}/settings/sync?version=${currentVersion}&timeout=${timeout}`,
        {
          method: "GET",
          headers: await this.buildHeaders(),
          signal: this.abortController.signal,
        }
      )

      if (!response.ok) {
        throw new Error(`Settings sync failed: ${response.status}`)
      }

      return response.json()
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        // Request was cancelled, return not updated
        return { updated: false }
      }
      throw error
    }
  }

  /**
   * Cancel any pending sync request
   */
  cancelSync(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
    }
  }

  /**
   * Start continuous settings sync loop.
   * Calls onChange callback whenever settings are updated.
   */
  startSyncLoop(
    getCurrentVersion: () => number,
    onChange: (settings: UserSettings) => void,
    onError?: (error: Error) => void
  ): () => void {
    let running = true

    const syncLoop = async () => {
      while (running) {
        try {
          const result = await this.syncSettings(getCurrentVersion())

          if (!running) break

          if (result.updated && result.settings) {
            onChange(result.settings)
          }
        } catch (error) {
          if (!running) break

          if (onError) {
            onError(error as Error)
          } else {
            console.error("Settings sync error:", error)
          }

          // Wait before retrying on error
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
    }

    syncLoop()

    // Return cleanup function
    return () => {
      running = false
      this.cancelSync()
    }
  }

  // Private helpers to access ApiClient internals
  private async getBaseUrl(): Promise<string> {
    // Access the base URL from the client
    // We need to use the same base URL the client uses
    return (this.client as any).baseUrl || ""
  }

  private async buildHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {}
    const token = await this.client.getToken()
    if (token) {
      headers["Authorization"] = `Bearer ${token}`
    }
    return headers
  }
}
