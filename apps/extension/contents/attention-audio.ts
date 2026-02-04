import { type PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY } from "../cognitive-attention/default-settings"

import CognitiveAttentionAudioTracker from "../cognitive-attention/monitor-audio"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "*://*.youtube.com/*"
  ],
  all_frames: false
}

const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"

const storage = new Storage()
let audioTracker: CognitiveAttentionAudioTracker | null = null

const URL = location.href

const initAudioTracker = async () => {
  const showOverlay =
    String(await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)) ===
      "true" || COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue

  if (audioTracker) {
    audioTracker.destroy?.()
  }

  audioTracker = new CognitiveAttentionAudioTracker({
    showOverlay,
    playbackThreshold: 3000, // 3 seconds of playback
    onSustainedAudioAttention: async (data) => {
      try {
        await sendToBackground({
          name: COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME,
          body: {
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
      } catch {
        // Ignore errors when sending to background
      }
    }
  })

  audioTracker.init()
}

initAudioTracker().then(() => {
  storage.watch({
    [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: initAudioTracker
  })
})

export { audioTracker }
