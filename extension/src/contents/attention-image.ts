import type { PlasmoCSConfig } from "plasmo"

import { Storage } from "@plasmohq/storage"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
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

const storage = new Storage()

const initImageTracker = async () => {
  // Load settings from storage
  const showOverlay =
    String(await storage.get(COGNITIVE_ATTENTION_SHOW_OVERLAY.key)) === "true" ||
    COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
  const debugMode =
    String(await storage.get(COGNITIVE_ATTENTION_DEBUG_MODE.key)) === "true" ||
    COGNITIVE_ATTENTION_DEBUG_MODE.defaultValue

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

      if (debugMode) {
        console.log("[Kaizen] attention-image", { src: data.src, alt: data.alt })
      }

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

// Listen for storage changes to update tracker config
storage.watch({
  [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: (c) => {
    const showOverlay = String(c.newValue) === "true"
    if (imageTracker) {
      imageTracker.updateConfig({ showOverlay })
      console.log("[Kaizen] Image overlay updated:", showOverlay)
    }
  }
})

// Initialize when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initImageTracker)
} else {
  initImageTracker()
}

export { imageTracker }
