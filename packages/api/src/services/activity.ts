import type { ApiClient } from "../client"
import type {
  TextActivityPayload,
  ImageActivityPayload,
  AudioActivityPayload,
  WebsiteVisitPayload
} from "../types"

/**
 * Activity tracking service for uploading user attention data.
 * Primarily used by the extension for tracking reading, viewing, and listening activities.
 */
export class ActivityService {
  constructor(private client: ApiClient) {}

  /**
   * Upload text reading activity
   */
  async trackText(payload: TextActivityPayload): Promise<void> {
    try {
      await this.client.post("/activities/text", payload)
    } catch (error) {
      console.error("Failed to upload text activity:", error)
    }
  }

  /**
   * Upload image viewing activity
   */
  async trackImage(payload: ImageActivityPayload): Promise<void> {
    try {
      await this.client.post("/activities/image", payload)
    } catch (error) {
      console.error("Failed to upload image activity:", error)
    }
  }

  /**
   * Upload audio listening activity
   */
  async trackAudio(payload: AudioActivityPayload): Promise<void> {
    try {
      await this.client.post("/activities/audio", payload)
    } catch (error) {
      console.error("Failed to upload audio activity:", error)
    }
  }

  /**
   * Upload website visit event
   */
  async trackWebsiteVisit(payload: WebsiteVisitPayload): Promise<void> {
    try {
      await this.client.post("/activities/website", payload)
    } catch (error) {
      console.error("Failed to upload website visit:", error)
    }
  }
}
