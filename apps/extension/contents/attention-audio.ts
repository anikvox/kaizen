import { type PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY, ATTENTION_TRACKING_IGNORE_LIST } from "../cognitive-attention/default-settings"
import { shouldIgnoreUrlSync } from "../cognitive-attention/url-ignore-list"

import CognitiveAttentionAudioTracker from "../cognitive-attention/monitor-audio"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "*://*.youtube.com/*",
    "http://localhost:60091/*"
  ],
  all_frames: false
}

// Skip tracking on the Kaizen web app itself
const kaizenWebUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"
const isKaizenWebApp = location.href.startsWith(kaizenWebUrl)

const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"

const storage = new Storage()
let audioTracker: CognitiveAttentionAudioTracker | null = null

const URL = location.href

const initAudioTracker = async () => {
  if (isKaizenWebApp) return

  // Check user's ignore list
  const ignoreList = await storage.get<string | null>(ATTENTION_TRACKING_IGNORE_LIST.key)
  if (shouldIgnoreUrlSync(URL, ignoreList)) {
    if (audioTracker) {
      audioTracker.destroy?.()
      audioTracker = null
    }
    return
  }

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

if (!isKaizenWebApp) {
  initAudioTracker().then(() => {
    storage.watch({
      [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: initAudioTracker,
      [ATTENTION_TRACKING_IGNORE_LIST.key]: initAudioTracker
    })
  })
}

export { audioTracker }
