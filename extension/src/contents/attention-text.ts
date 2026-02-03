import type { PlasmoCSConfig } from "plasmo"
import type { UserSettings } from "@kaizen/api"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  COGNITIVE_ATTENTION_SUSTAINED_TIME,
  COGNITIVE_ATTENTION_WORDS_PER_MINUTE,
  SETTINGS_UPDATED_MESSAGE,
  GET_SETTINGS_MESSAGE
} from "../default-settings"

import CognitiveAttentionTextTracker from "../cognitive-attention/monitor-text"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: ["*://*.youtube.com/*"],
  all_frames: false
}

const COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME = "cognitive-attention-text"

let textTracker: CognitiveAttentionTextTracker | null = null

const URL = location.href

const readingProgressTracker = new Map<number, number>()

// Default settings
let currentSettings = {
  cognitiveAttentionThreshold: COGNITIVE_ATTENTION_SUSTAINED_TIME.defaultValue,
  idleThreshold: COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME.defaultValue,
  wordsPerMinute: COGNITIVE_ATTENTION_WORDS_PER_MINUTE.defaultValue,
  debugMode: COGNITIVE_ATTENTION_DEBUG_MODE.defaultValue,
  showOverlay: COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
}

/**
 * Update tracker configuration with new settings
 */
const updateTrackerSettings = (settings: Partial<UserSettings>) => {
  if (!textTracker) return

  const newConfig: Parameters<typeof textTracker.updateConfig>[0] = {}

  if (settings.sustainedTime !== undefined) {
    newConfig.cognitiveAttentionThreshold = settings.sustainedTime
    currentSettings.cognitiveAttentionThreshold = settings.sustainedTime
  }
  if (settings.idleThreshold !== undefined) {
    newConfig.idleThreshold = settings.idleThreshold
    currentSettings.idleThreshold = settings.idleThreshold
  }
  if (settings.wordsPerMinute !== undefined) {
    newConfig.wordsPerMinute = settings.wordsPerMinute
    currentSettings.wordsPerMinute = settings.wordsPerMinute
  }
  if (settings.debugMode !== undefined) {
    newConfig.debugMode = settings.debugMode
    currentSettings.debugMode = settings.debugMode
  }
  if (settings.showOverlay !== undefined) {
    newConfig.showOverlay = settings.showOverlay
    currentSettings.showOverlay = settings.showOverlay
  }

  textTracker.updateConfig(newConfig)
  console.log("[attention-text] Settings updated:", newConfig)
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
    console.log("[attention-text] Error requesting settings:", error)
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

const initTextTracker = () => {
  if (textTracker) {
    textTracker.destroy?.()
  }

  textTracker = new CognitiveAttentionTextTracker({
    debugMode: currentSettings.debugMode,
    showOverlay: currentSettings.showOverlay,
    cognitiveAttentionThreshold: currentSettings.cognitiveAttentionThreshold,
    idleThreshold: currentSettings.idleThreshold,
    wordsPerMinute: currentSettings.wordsPerMinute,
    onSustainedAttentionChange: async (data) => {
      const { text, wordsRead } = data
      if (!text || wordsRead <= 0) return

      const textHash = hashString(text)
      const prev = readingProgressTracker.get(textHash) || 0
      const deltaWords = wordsRead - prev
      if (deltaWords <= 0) return

      const deltaText = extractWords(text, wordsRead)
        .slice(extractWords(text, prev).length)
        .trim()

      if (!deltaText) return

      console.log("attention-text", { deltaText, deltaWords })

      readingProgressTracker.set(textHash, wordsRead)

      // Send message to background script
      chrome.runtime.sendMessage({
        type: COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME,
        payload: {
          url: URL,
          text: deltaText,
          wordsRead: deltaWords,
          timestamp: Date.now()
        }
      })
    }
  })

  textTracker.init()

  // Request initial settings after tracker is initialized
  requestInitialSettings()
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTextTracker)
} else {
  initTextTracker()
}

const extractWords = (text: string, wordCount: number): string => {
  const words = text.split(/\s+/)
  return words.slice(0, wordCount).join(" ")
}

const hashString = (s: string) =>
  [...s].reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0) >>> 0

export { textTracker }
