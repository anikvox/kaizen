import { type PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY } from "../cognitive-attention/default-settings"

import CognitiveAttentionImageTracker from "../cognitive-attention/monitor-image"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "*://*.youtube.com/*",
    "https://*.kaizen.*/*",
    "http://localhost:60091/*"
  ],
  all_frames: false
}

const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"

const storage = new Storage()
let imageTracker: CognitiveAttentionImageTracker | null = null

const URL = location.href

const initImageTracker = async () => {
  const showOverlay =
    String(await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)) ===
      "true" || COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue

  if (imageTracker) {
    imageTracker.destroy?.()
  }

  imageTracker = new CognitiveAttentionImageTracker({
    showOverlay,
    onSustainedImageAttention: async (data) => {
      try {
        await sendToBackground({
          name: COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME,
          body: {
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
      } catch {
        // Ignore errors when sending to background
      }
    }
  })

  imageTracker.init()
}

initImageTracker().then(() => {
  storage.watch({
    [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: initImageTracker
  })
})

export { imageTracker }
