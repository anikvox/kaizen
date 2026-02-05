import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
} from "../cognitive-attention/default-settings"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"
const storage = new Storage()

let settingsEventSource: EventSource | null = null

export async function startSettingsSync() {
  const token = await storage.get<string>("deviceToken")
  if (!token) {
    return
  }

  // Close existing connection if any
  stopSettingsSync()

  const api = createApiClient(apiUrl)

  settingsEventSource = api.settings.subscribeSettings(
    // On connected - sync initial settings from server
    async (data) => {
      if (data.settings) {
        await syncSettingsToStorage(data.settings)
      }
    },
    // On settings changed - update local storage
    async (data) => {
      await syncSettingsToStorage(data)
    },
    // On error
    (error) => {
      console.error("[Settings Sync] SSE error:", error)
      // Don't clear on error - will retry on next storage watch trigger
    },
    token
  )
}

export function stopSettingsSync() {
  if (settingsEventSource) {
    settingsEventSource.close()
    settingsEventSource = null
  }
}

async function syncSettingsToStorage(settings: {
  cognitiveAttentionDebugMode: boolean
  cognitiveAttentionShowOverlay: boolean
}) {
  // Get current values to avoid unnecessary writes
  const currentDebugMode = await storage.get(COGNITIVE_ATTENTION_DEBUG_MODE.key)
  const currentShowOverlay = await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)

  // Only write if values actually changed
  if (String(currentDebugMode) !== String(settings.cognitiveAttentionDebugMode)) {
    await storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, settings.cognitiveAttentionDebugMode)
  }

  if (String(currentShowOverlay) !== String(settings.cognitiveAttentionShowOverlay)) {
    await storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, settings.cognitiveAttentionShowOverlay)
  }
}

// Function to push local settings changes to server
export async function pushSettingsToServer(settings: {
  cognitiveAttentionDebugMode?: boolean
  cognitiveAttentionShowOverlay?: boolean
}) {
  const token = await storage.get<string>("deviceToken")
  if (!token) {
    return
  }

  const api = createApiClient(apiUrl)
  try {
    await api.settings.update(settings, token)
  } catch (error) {
    console.error("[Settings Sync] Failed to push settings to server:", error)
  }
}
