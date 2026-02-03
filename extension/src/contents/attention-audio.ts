import type { PlasmoCSConfig } from "plasmo"

import { Storage } from "@plasmohq/storage"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
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

const storage = new Storage()

const initAudioTracker = async () => {
  // Load settings from storage
  const showOverlay =
    String(await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)) === "true" ||
    COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
  const debugMode =
    String(await storage.get(COGNITIVE_ATTENTION_DEBUG_MODE.key)) === "true" ||
    COGNITIVE_ATTENTION_DEBUG_MODE.defaultValue

  if (audioTracker) {
    audioTracker.destroy?.()
  }

  audioTracker = new CognitiveAttentionAudioTracker({
    showOverlay,
    playbackThreshold: 3000, // 3 seconds of playback
    onSustainedAudioAttention: async (data) => {
      // Skip if we've already processed this audio
      if (cachedAudioSources.has(data.src)) {
        return
      }

      cachedAudioSources.add(data.src)

      if (debugMode) {
        console.log("[Kaizen] attention-audio", { src: data.src, title: data.title })
      }

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
}

// Listen for storage changes to update tracker config
storage.watch({
  [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: (c) => {
    const showOverlay = String(c.newValue) === "true"
    if (audioTracker) {
      audioTracker.updateConfig({ showOverlay })
      console.log("[Kaizen] Audio overlay updated:", showOverlay)
    }
  }
})

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAudioTracker)
} else {
  initAudioTracker()
}

export { audioTracker }
