import { type PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY, ATTENTION_TRACKING_IGNORE_LIST } from "../cognitive-attention/default-settings"
import { shouldIgnoreUrlSync } from "../cognitive-attention/url-ignore-list"

import CognitiveAttentionImageTracker from "../cognitive-attention/monitor-image"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "*://*.youtube.com/*"
  ],
  all_frames: false
}

// Skip tracking on the Kaizen web app itself
const kaizenWebUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"
const isKaizenWebApp = location.href.startsWith(kaizenWebUrl)

const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"

const storage = new Storage()
let imageTracker: CognitiveAttentionImageTracker | null = null

const URL = location.href

const initImageTracker = async () => {
  if (isKaizenWebApp) return

  // Check user's ignore list
  const ignoreList = await storage.get<string | null>(ATTENTION_TRACKING_IGNORE_LIST.key)
  if (shouldIgnoreUrlSync(URL, ignoreList)) {
    if (imageTracker) {
      imageTracker.destroy?.()
      imageTracker = null
    }
    return
  }

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

if (!isKaizenWebApp) {
  initImageTracker().then(() => {
    storage.watch({
      [COGNITIVE_ATTENTION_SHOW_OVERLAY.key]: initImageTracker,
      [ATTENTION_TRACKING_IGNORE_LIST.key]: initImageTracker
    })
  })
}

export { imageTracker }
