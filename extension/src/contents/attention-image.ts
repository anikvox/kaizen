import type { PlasmoCSConfig } from "plasmo"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY } from "../default-settings"

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

const initImageTracker = () => {
  const showOverlay = COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue

  if (imageTracker) {
    imageTracker.destroy?.()
  }

  imageTracker = new CognitiveAttentionImageTracker({
    showOverlay,
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
}

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initImageTracker)
} else {
  initImageTracker()
}

export { imageTracker }
