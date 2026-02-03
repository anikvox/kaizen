import type { PlasmoCSConfig } from "plasmo"

import { Storage } from "@plasmohq/storage"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  COGNITIVE_ATTENTION_SUSTAINED_TIME,
  COGNITIVE_ATTENTION_WORDS_PER_MINUTE
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

const storage = new Storage()

const initTextTracker = async () => {
  // Load settings from storage
  const cognitiveAttentionThreshold =
    Number(await storage.get(COGNITIVE_ATTENTION_SUSTAINED_TIME.key)) ||
    COGNITIVE_ATTENTION_SUSTAINED_TIME.defaultValue
  const idleThreshold =
    Number(await storage.get(COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME.key)) ||
    COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME.defaultValue
  const wordsPerMinute =
    Number(await storage.get(COGNITIVE_ATTENTION_WORDS_PER_MINUTE.key)) ||
    COGNITIVE_ATTENTION_WORDS_PER_MINUTE.defaultValue
  const debugMode =
    String(await storage.get(COGNITIVE_ATTENTION_DEBUG_MODE.key)) === "true" ||
    COGNITIVE_ATTENTION_DEBUG_MODE.defaultValue
  const showOverlay =
    String(await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)) === "true" ||
    COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue

  if (textTracker) {
    textTracker.destroy?.()
  }

  textTracker = new CognitiveAttentionTextTracker({
    debugMode,
    showOverlay,
    cognitiveAttentionThreshold,
    idleThreshold,
    wordsPerMinute,
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

      if (debugMode) {
        console.log("[Kaizen] attention-text", { deltaText, deltaWords })
      }

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
}

// Listen for storage changes to update tracker config
storage.watch({
  [COGNITIVE_ATTENTION_DEBUG_MODE.key]: (c) => {
    const debugMode = String(c.newValue) === "true"
    if (textTracker) {
      textTracker.updateConfig({ debugMode })
      console.log("[Kaizen] Debug mode updated:", debugMode)
    }
  },
  [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: (c) => {
    const showOverlay = String(c.newValue) === "true"
    if (textTracker) {
      textTracker.updateConfig({ showOverlay })
      console.log("[Kaizen] Show overlay updated:", showOverlay)
    }
  },
  [COGNITIVE_ATTENTION_SUSTAINED_TIME.key]: (c) => {
    if (textTracker && c.newValue) {
      textTracker.updateConfig({ cognitiveAttentionThreshold: Number(c.newValue) })
    }
  },
  [COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME.key]: (c) => {
    if (textTracker && c.newValue) {
      textTracker.updateConfig({ idleThreshold: Number(c.newValue) })
    }
  },
  [COGNITIVE_ATTENTION_WORDS_PER_MINUTE.key]: (c) => {
    if (textTracker && c.newValue) {
      textTracker.updateConfig({ wordsPerMinute: Number(c.newValue) })
    }
  }
})

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
