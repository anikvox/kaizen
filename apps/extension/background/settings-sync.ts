import { Storage } from "@plasmohq/storage"
import { createApiClient, type UnifiedSSEData, type AgentNudge } from "@kaizen/api-client"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  ATTENTION_TRACKING_IGNORE_LIST
} from "../cognitive-attention/default-settings"

// @ts-expect-error - PLASMO_PUBLIC_ env vars are injected at build time
const apiUrl = (typeof PLASMO_PUBLIC_KAIZEN_API_URL !== "undefined" ? PLASMO_PUBLIC_KAIZEN_API_URL : "https://api.kaizen.apps.sandipan.dev") as string
const storage = new Storage()

let settingsEventSource: EventSource | null = null

// Storage key for active nudge
export const AGENT_NUDGE_KEY = "agentNudge"

export async function startSettingsSync() {
  const token = await storage.get<string>("deviceToken")
  if (!token) {
    return
  }

  // Close existing connection if any
  stopSettingsSync()

  const api = createApiClient(apiUrl)

  settingsEventSource = api.sse.subscribeUnified(
    async (data: UnifiedSSEData) => {
      switch (data.type) {
        case "connected":
          // Sync initial settings from server
          if (data.settings) {
            await syncSettingsToStorage(data.settings)
          }
          break

        case "settings-changed":
          // Update local storage when settings change
          await syncSettingsToStorage(data.settings)
          break

        case "agent-nudge":
          // Store nudge for content script to display
          await storage.set(AGENT_NUDGE_KEY, {
            ...data.nudge,
            receivedAt: Date.now()
          })
          break
      }
    },
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
  attentionTrackingIgnoreList?: string | null
  themeMode?: "light" | "dark"
}) {
  // Get current values to avoid unnecessary writes
  const currentDebugMode = await storage.get(COGNITIVE_ATTENTION_DEBUG_MODE.key)
  const currentShowOverlay = await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)
  const currentIgnoreList = await storage.get(ATTENTION_TRACKING_IGNORE_LIST.key)
  const currentTheme = await storage.get<string>("themeMode")

  // Only write if values actually changed
  if (String(currentDebugMode) !== String(settings.cognitiveAttentionDebugMode)) {
    await storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, settings.cognitiveAttentionDebugMode)
  }

  if (String(currentShowOverlay) !== String(settings.cognitiveAttentionShowOverlay)) {
    await storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, settings.cognitiveAttentionShowOverlay)
  }

  if (settings.attentionTrackingIgnoreList !== undefined &&
      String(currentIgnoreList ?? "") !== String(settings.attentionTrackingIgnoreList ?? "")) {
    await storage.set(ATTENTION_TRACKING_IGNORE_LIST.key, settings.attentionTrackingIgnoreList)
  }

  // Sync theme mode
  if (settings.themeMode !== undefined && currentTheme !== settings.themeMode) {
    await storage.set("themeMode", settings.themeMode)
  }
}

// Function to push local settings changes to server
export async function pushSettingsToServer(settings: {
  cognitiveAttentionDebugMode?: boolean
  cognitiveAttentionShowOverlay?: boolean
  attentionTrackingIgnoreList?: string | null
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
