import type { PlasmoCSConfig } from "plasmo"

import { sendToBackground } from "@plasmohq/messaging"

// only run on YouTube
export const config: PlasmoCSConfig = {
  matches: ["*://*.youtube.com/*"],
  all_frames: false
}

const YOUTUBE_ATTENTION_MESSAGE_NAME = "youtube-attention"

class YoutubeAttention {
  private captionCheckInterval: number | null = null
  private hasEmittedOpened = false
  private urlObserver: MutationObserver | null = null
  private lastUrl = ""
  private playbackCheckInterval: number | null = null
  private activeWatchTime = 0
  private lastCheckTime = 0
  private isTracking = false

  public init() {
    this.lastUrl = window.location.href
    this.checkAndExtract()
    this.watchUrlChanges()
  }

  private async emit(event: string, data: Record<string, unknown>) {
    try {
      await sendToBackground({
        name: YOUTUBE_ATTENTION_MESSAGE_NAME,
        body: {
          event,
          data,
          videoId: this.getVideoId(),
          timestamp: Date.now()
        }
      })
    } catch {
      // Ignore errors when sending to background
    }
  }

  private getVideoId(): string | null {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get("v")
  }

  private async getTitle(videoId: string | null): Promise<string | null> {
    const domTitle = document.querySelector(
      "h1.ytd-watch-metadata yt-formatted-string"
    )?.textContent
    if (domTitle) return domTitle

    if (!videoId) return null

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      const response = await fetch(oembedUrl)
      const data = await response.json()
      return data.title || null
    } catch (error) {
      console.error("Error fetching title:", error)
      return null
    }
  }

  private async getChannelName(videoId: string | null): Promise<string | null> {
    const domChannel = document.querySelector(
      "ytd-channel-name#channel-name yt-formatted-string"
    )?.textContent
    if (domChannel) return domChannel

    if (!videoId) return null

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      const response = await fetch(oembedUrl)
      const data = await response.json()
      return data.author_name || null
    } catch (error) {
      console.error("Error fetching channel name:", error)
      return null
    }
  }

  private getCurrentCaption(): string | null {
    const captionElements = document.querySelectorAll(".captions-text")

    if (captionElements.length === 0) {
      return null
    }

    const captionText = Array.from(captionElements)
      .map((el) => el.textContent?.trim())
      .filter((text) => text)
      .join(" ")

    return captionText || null
  }

  private async emitOpened() {
    if (this.hasEmittedOpened) return

    const videoId = this.getVideoId()

    const title = await this.getTitle(videoId)
    const channelName = await this.getChannelName(videoId)

    this.emit("opened", {
      title,
      channelName,
      url: window.location.href
    })

    this.hasEmittedOpened = true
  }

  private startCaptionMonitoring() {
    if (this.captionCheckInterval) {
      clearInterval(this.captionCheckInterval)
    }

    let lastCaption = ""

    this.captionCheckInterval = window.setInterval(() => {
      const caption = this.getCurrentCaption()

      if (caption && caption !== lastCaption) {
        lastCaption = caption
        this.emit("caption", { caption })
      }
    }, 500)
  }

  private startPlaybackMonitoring() {
    if (this.playbackCheckInterval) {
      clearInterval(this.playbackCheckInterval)
    }

    this.activeWatchTime = 0
    this.lastCheckTime = Date.now()
    this.isTracking = false

    this.playbackCheckInterval = window.setInterval(() => {
      const videoElement = document.querySelector("video") as HTMLVideoElement

      if (!videoElement) {
        return
      }

      const currentTime = Date.now()
      const isPaused = videoElement.paused

      if (!isPaused) {
        if (this.isTracking) {
          const elapsed = currentTime - this.lastCheckTime
          this.activeWatchTime += elapsed
        } else {
          this.isTracking = true
        }
        this.lastCheckTime = currentTime

        this.emit("active-watch-time-update", {
          activeWatchTime: this.activeWatchTime
        })
      } else {
        if (this.isTracking) {
          const elapsed = currentTime - this.lastCheckTime
          this.activeWatchTime += elapsed
          this.isTracking = false

          this.emit("active-watch-time-update", {
            activeWatchTime: this.activeWatchTime
          })
        }
      }
    }, 500)
  }

  private async checkAndExtract() {
    const videoId = this.getVideoId()

    if (!videoId) {
      return
    }

    const maxRetries = 20
    let retries = 0

    const waitForVideo = async () => {
      const videoElement = document.querySelector("video")

      if (!videoElement) {
        retries++
        if (retries < maxRetries) {
          setTimeout(waitForVideo, 500)
        }
        return
      }

      this.hasEmittedOpened = false
      await this.emitOpened()
      this.startCaptionMonitoring()
      this.startPlaybackMonitoring()
    }

    waitForVideo()
  }

  private watchUrlChanges() {
    this.urlObserver = new MutationObserver(() => {
      const currentUrl = window.location.href
      if (currentUrl !== this.lastUrl) {
        this.lastUrl = currentUrl

        if (this.captionCheckInterval) {
          clearInterval(this.captionCheckInterval)
          this.captionCheckInterval = null
        }

        if (this.playbackCheckInterval) {
          clearInterval(this.playbackCheckInterval)
          this.playbackCheckInterval = null
        }

        setTimeout(() => this.checkAndExtract(), 1000)
      }
    })

    this.urlObserver.observe(document.body, { childList: true, subtree: true })
  }
}

const tracker = new YoutubeAttention()
tracker.init()
