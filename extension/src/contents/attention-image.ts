import type { PlasmoCSConfig } from "plasmo"
import type { UserSettings } from "@kaizen/api"

import {
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  SETTINGS_UPDATED_MESSAGE,
  GET_SETTINGS_MESSAGE
} from "../default-settings"

import CognitiveAttentionImageTracker from "../cognitive-attention/monitor-image"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: ["*://*.youtube.com/*"],
  all_frames: false
}

const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"

let imageTracker: CognitiveAttentionImageTracker | null = null

const URL = location.href

const cachedImageCaptions = new Set<string>()

// Default settings
let currentSettings = {
  showOverlay: COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
}

/**
 * Update tracker configuration with new settings
 */
const updateTrackerSettings = (settings: Partial<UserSettings>) => {
  if (!imageTracker) return

  if (settings.showOverlay !== undefined) {
    currentSettings.showOverlay = settings.showOverlay
    imageTracker.updateConfig({ showOverlay: settings.showOverlay })
    console.log("[attention-image] Settings updated:", { showOverlay: settings.showOverlay })
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
    console.log("[attention-image] Error requesting settings:", error)
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

const initImageTracker = () => {
  if (imageTracker) {
    imageTracker.destroy?.()
  }

  imageTracker = new CognitiveAttentionImageTracker({
    showOverlay: currentSettings.showOverlay,
    onSustainedImageAttention: async (data) => {
      // Skip if we've already processed this image
      if (cachedImageCaptions.has(data.src)) {
        return
      }

      cachedImageCaptions.add(data.src)

      console.log("attention-image", { src: data.src, alt: data.alt })

      // Send message to background script
      chrome.runtime.sendMessage({
        type: COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME,
        payload: {
          url: URL,
          src: data.src,
          alt: data.alt,
          title: data.title,
          width: data.width,
          height: data.height,
          hoverDuration: data.hoverDuration,
          confidence: data.confidence,
          timestamp: Date.now()
        }
      })
    }
  })

  imageTracker.init()

  // Request initial settings after tracker is initialized
  requestInitialSettings()
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initImageTracker)
} else {
  initImageTracker()
}

export { imageTracker }
