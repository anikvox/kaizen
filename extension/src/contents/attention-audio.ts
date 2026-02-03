import type { PlasmoCSConfig } from "plasmo"
import type { UserSettings } from "@kaizen/api"

import {
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  SETTINGS_UPDATED_MESSAGE,
  GET_SETTINGS_MESSAGE
} from "../default-settings"

import CognitiveAttentionAudioTracker from "../cognitive-attention/monitor-audio"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: ["*://*.youtube.com/*"],
  all_frames: false
}

const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"

let audioTracker: CognitiveAttentionAudioTracker | null = null

const URL = location.href

const cachedAudioSources = new Set<string>()

// Default settings
let currentSettings = {
  showOverlay: COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
}

/**
 * Update tracker configuration with new settings
 */
const updateTrackerSettings = (settings: Partial<UserSettings>) => {
  if (!audioTracker) return

  if (settings.showOverlay !== undefined) {
    currentSettings.showOverlay = settings.showOverlay
    audioTracker.updateConfig({ showOverlay: settings.showOverlay })
    console.log("[attention-audio] Settings updated:", { showOverlay: settings.showOverlay })
  }
}

/**
 * Request initial settings from background script
 */
const requestInitialSettings = async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: GET_SETTINGS_MESSAGE })
    if (response?.success && response.settings) {
      updateTrackerSettings(response.settings)
    }
  } catch (error) {
    console.log("[attention-audio] Error requesting settings:", error)
  }
}

/**
 * Listen for settings update messages from background script
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === SETTINGS_UPDATED_MESSAGE && message.payload) {
    updateTrackerSettings(message.payload)
    sendResponse({ success: true })
  }
  return false
})

const initAudioTracker = () => {
  if (audioTracker) {
    audioTracker.destroy?.()
  }

  audioTracker = new CognitiveAttentionAudioTracker({
    showOverlay: currentSettings.showOverlay,
    playbackThreshold: 3000, // 3 seconds of playback
    onSustainedAudioAttention: async (data) => {
      // Skip if we've already processed this audio
      if (cachedAudioSources.has(data.src)) {
        return
      }

      cachedAudioSources.add(data.src)

      console.log("attention-audio", { src: data.src, title: data.title })

      // Send message to background script
      chrome.runtime.sendMessage({
        type: COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME,
        payload: {
          url: URL,
          src: data.src,
          title: data.title,
          duration: data.duration,
          playbackDuration: data.playbackDuration,
          currentTime: data.currentTime,
          confidence: data.confidence,
          timestamp: Date.now()
        }
      })
    }
  })

  audioTracker.init()

  // Request initial settings after tracker is initialized
  requestInitialSettings()
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAudioTracker)
} else {
  initAudioTracker()
}

export { audioTracker }
