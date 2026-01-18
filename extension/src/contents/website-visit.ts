import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

const WEBSITE_VISIT_MESSAGE_NAME = "website-visit"

type WebsiteVisitEventType = "opened" | "active-time-update" | "closed"

class WebsiteTracker {
  private active = false
  private activeTime = 0
  private lastActiveAt = 0
  private tickInterval?: number
  private url = location.href

  start() {
    this.emit("opened", {
      url: this.url,
      title: document.title,
      metadata: getWebsiteMetadata(),
      referrer: document.referrer
    })
    this.updateActivityState()

    const update = this.updateActivityState.bind(this)
    document.addEventListener("visibilitychange", update)
    window.addEventListener("focus", update)
    window.addEventListener("blur", update)
    window.addEventListener("beforeunload", this.handleClose)
  }

  private updateActivityState() {
    const shouldBeActive =
      document.visibilityState === "visible" && document.hasFocus()
    if (shouldBeActive && !this.active) {
      this.active = true
      this.lastActiveAt = Date.now()
      this.startTick()
    } else if (!shouldBeActive && this.active) {
      this.pauseTick()
    }
  }

  private startTick() {
    if (this.tickInterval) return
    this.tickInterval = window.setInterval(() => {
      const now = Date.now()
      this.activeTime += now - this.lastActiveAt
      this.lastActiveAt = now
      this.emit("active-time-update", { time: this.activeTime })
    }, 5000)
  }

  private pauseTick() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = undefined
    }
    this.activeTime += Date.now() - this.lastActiveAt
    this.active = false
  }

  private handleClose = () => {
    if (this.active) this.pauseTick()
    this.emit("closed", { url: this.url, time: this.activeTime })
  }

  private emit(event: WebsiteVisitEventType, data: Record<string, unknown> = {}) {
    const body = {
      event,
      url: this.url,
      timestamp: Date.now(),
      ...data
    }

    try {
      chrome.runtime.sendMessage({
        type: WEBSITE_VISIT_MESSAGE_NAME,
        payload: body
      })
    } catch {
      // Ignore errors
    }
  }
}

const getWebsiteMetadata = (): Record<string, string> => {
  const metaTags = document.querySelectorAll("meta")
  const metadata: Record<string, string> = {}

  for (const tag of metaTags) {
    const key =
      tag.getAttribute("name") ||
      tag.getAttribute("property") ||
      tag.getAttribute("itemprop")

    const value = tag.getAttribute("content")
    if (key && value) {
      metadata[key.trim()] = value.trim()
    }
  }

  const title = document.querySelector("title")?.innerText
  if (title) metadata["title"] = title

  const canonical = document
    .querySelector("link[rel='canonical']")
    ?.getAttribute("href")
  if (canonical) metadata["canonical"] = canonical

  return metadata
}

new WebsiteTracker().start()

export {}
