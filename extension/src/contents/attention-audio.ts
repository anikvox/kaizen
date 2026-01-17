import type { PlasmoCSConfig } from "plasmo"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY } from "../default-settings"

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

const initAudioTracker = () => {
  const showOverlay = COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue

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
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAudioTracker)
} else {
  initAudioTracker()
}

export { audioTracker }
