import { type PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import { COGNITIVE_ATTENTION_SHOW_OVERLAY, ATTENTION_TRACKING_IGNORE_LIST } from "../cognitive-attention/default-settings"
import { shouldIgnoreUrlSync } from "../cognitive-attention/url-ignore-list"

import CognitiveAttentionImageTracker from "../cognitive-attention/monitor-image"
import type { ImageAttentionResponse } from "../background/messages/cognitive-attention-image"

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

// Cache for image summaries to avoid re-fetching
const cachedImageSummaries = new Map<string, string>()

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
      // Check if we already have a cached summary for this image
      if (cachedImageSummaries.has(data.src)) {
        const summary = cachedImageSummaries.get(data.src)!
        drawCaption(data.imageElement, summary)
        return
      }

      // Show loading indicator while fetching summary
      const loadingIndicator = showLoadingIndicator(data.imageElement)

      try {
        const response = await sendToBackground<
          typeof data & { url: string; timestamp: number },
          ImageAttentionResponse
        >({
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

        loadingIndicator.remove()

        if (response?.success && response.summary) {
          cachedImageSummaries.set(data.src, response.summary)
          drawCaption(data.imageElement, response.summary)
        }
      } catch {
        loadingIndicator.remove()
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

/**
 * Show a small pulsing loading indicator at the bottom-right of the image
 */
const showLoadingIndicator = (imageElement: HTMLImageElement): HTMLElement => {
  const loadingId = "kaizen-image-caption-loading"

  const existingLoading = document.getElementById(loadingId)
  if (existingLoading) {
    existingLoading.remove()
  }

  const loadingDiv = document.createElement("div")
  loadingDiv.id = loadingId

  loadingDiv.style.position = "fixed"
  loadingDiv.style.width = "8px"
  loadingDiv.style.height = "8px"
  loadingDiv.style.borderRadius = "50%"
  loadingDiv.style.backgroundColor = "rgba(0, 0, 0, 0.8)"
  loadingDiv.style.zIndex = "10000"
  loadingDiv.style.animation = "kaizen-pulse 1.5s ease-in-out infinite"
  loadingDiv.style.boxShadow =
    "0 0 0 2px rgba(255, 255, 255, 0.9), 0 0 8px rgba(0, 0, 0, 0.6)"

  if (!document.getElementById("kaizen-pulse-animation-styles")) {
    const style = document.createElement("style")
    style.id = "kaizen-pulse-animation-styles"
    style.textContent = `
      @keyframes kaizen-pulse {
        0%, 100% {
          opacity: 1;
          transform: scale(1);
        }
        50% {
          opacity: 0.6;
          transform: scale(1.4);
        }
      }
    `
    document.head.appendChild(style)
  }

  const updatePosition = () => {
    const rect = imageElement.getBoundingClientRect()
    loadingDiv.style.left = rect.right - 16 + "px"
    loadingDiv.style.top = rect.bottom - 16 + "px"
  }

  updatePosition()

  const resizeHandler = () => updatePosition()
  const scrollHandler = () => updatePosition()

  window.addEventListener("resize", resizeHandler)
  window.addEventListener("scroll", scrollHandler, true)
  const cleanup = () => {
    window.removeEventListener("resize", resizeHandler)
    window.removeEventListener("scroll", scrollHandler, true)
  }

  const originalRemove = loadingDiv.remove.bind(loadingDiv)
  loadingDiv.remove = () => {
    cleanup()
    originalRemove()
  }

  document.body.appendChild(loadingDiv)
  return loadingDiv
}

/**
 * Draw a caption div below the image with the AI-generated summary
 */
const drawCaption = (imageElement: HTMLImageElement, caption: string) => {
  const captionId = "kaizen-image-caption-overlay"

  const existingCaption = document.getElementById(captionId)
  if (existingCaption) {
    existingCaption.remove()
  }

  const captionDiv = document.createElement("div")
  captionDiv.id = captionId
  captionDiv.textContent = caption

  captionDiv.style.position = "fixed"
  captionDiv.style.backgroundColor = "black"
  captionDiv.style.color = "white"
  captionDiv.style.padding = "8px 12px"
  captionDiv.style.boxSizing = "border-box"
  captionDiv.style.textAlign = "center"
  captionDiv.style.fontSize = "14px"
  captionDiv.style.zIndex = "10000"
  captionDiv.style.fontFamily = "system-ui, -apple-system, sans-serif"
  captionDiv.style.lineHeight = "1.4"
  captionDiv.style.maxWidth = "100%"
  captionDiv.style.wordWrap = "break-word"

  const updatePosition = () => {
    const rect = imageElement.getBoundingClientRect()
    captionDiv.style.left = rect.left + "px"
    captionDiv.style.top = rect.bottom + "px"
    captionDiv.style.width = rect.width + "px"
  }

  updatePosition()
  window.addEventListener("resize", updatePosition)
  window.addEventListener("scroll", updatePosition, true)

  captionDiv.onclick = () => {
    window.removeEventListener("resize", updatePosition)
    window.removeEventListener("scroll", updatePosition, true)
    document.body.removeChild(captionDiv)
  }

  document.body.appendChild(captionDiv)
}
