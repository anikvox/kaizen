import { UPDATE_INTERVAL } from "./constants"
import { CognitiveAttentionAudioUI } from "./ui"

type AudioConfig = {
  showOverlay: boolean // Show visual indicator with progress
  playbackThreshold: number // Milliseconds of playback required (default: 3000)
  onSustainedAudioAttention?: (attention: SustainedAudioAttention) => void
}

type SustainedAudioAttention = {
  src: string
  title: string
  duration: number
  playbackDuration: number
  currentTime: number
  confidence: number
  audioElement: HTMLAudioElement
}

type AudioTrackerState = {
  trackedAudios: Map<
    HTMLAudioElement,
    {
      playbackStartTime: number | null
      totalPlaybackTime: number
      lastEmitted: boolean
      wasPlaying: boolean
    }
  >
}

class CognitiveAttentionAudioTracker {
  public config: Omit<AudioConfig, "onSustainedAudioAttention"> & {
    showOverlay: boolean
    playbackThreshold: number
  }
  private onSustainedAudioAttention?: (
    attention: SustainedAudioAttention
  ) => void
  private state: AudioTrackerState
  private trackingInterval?: ReturnType<typeof setInterval>
  private audioUI: CognitiveAttentionAudioUI
  private mutationObserver?: MutationObserver

  constructor(config?: Partial<AudioConfig>) {
    this.onSustainedAudioAttention = config?.onSustainedAudioAttention

    this.config = {
      showOverlay: config?.showOverlay || false,
      playbackThreshold: config?.playbackThreshold || 3000
    }

    this.state = {
      trackedAudios: new Map()
    }

    this.audioUI = new CognitiveAttentionAudioUI({
      showOverlay: this.config.showOverlay
    })
  }

  init(): void {
    this.setupAudioTracking()
    this.setupMutationObserver()

    this.trackingInterval = setInterval(() => {
      this.checkAudioPlayback()
    }, UPDATE_INTERVAL)
  }

  destroy(): void {
    if (this.trackingInterval) clearInterval(this.trackingInterval)
    if (this.mutationObserver) this.mutationObserver.disconnect()

    // Remove all event listeners
    this.state.trackedAudios.forEach((_, audioElement) => {
      this.removeAudioListeners(audioElement)
    })

    this.state.trackedAudios.clear()
    this.audioUI.destroy()
  }

  updateConfig(newConfig: Partial<AudioConfig>): void {
    if (newConfig.showOverlay !== undefined) {
      this.config.showOverlay = newConfig.showOverlay
    }
    if (newConfig.playbackThreshold !== undefined) {
      this.config.playbackThreshold = newConfig.playbackThreshold
    }
    if (newConfig.onSustainedAudioAttention !== undefined) {
      this.onSustainedAudioAttention = newConfig.onSustainedAudioAttention
    }

    this.audioUI.updateConfig({
      showOverlay: this.config.showOverlay
    })
  }

  private setupAudioTracking(): void {
    const audioElements = document.querySelectorAll("audio")
    audioElements.forEach((audio) => this.trackAudioElement(audio))
  }

  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLAudioElement) {
            this.trackAudioElement(node)
          } else if (node instanceof HTMLElement) {
            const audioElements = node.querySelectorAll("audio")
            audioElements.forEach((audio) => this.trackAudioElement(audio))
          }
        })

        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLAudioElement) {
            this.untrackAudioElement(node)
          } else if (node instanceof HTMLElement) {
            const audioElements = node.querySelectorAll("audio")
            audioElements.forEach((audio) => this.untrackAudioElement(audio))
          }
        })
      })
    })

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  private trackAudioElement(audioElement: HTMLAudioElement): void {
    if (this.state.trackedAudios.has(audioElement)) return

    this.state.trackedAudios.set(audioElement, {
      playbackStartTime: null,
      totalPlaybackTime: 0,
      lastEmitted: false,
      wasPlaying: false
    })

    // Add event listeners
    audioElement.addEventListener("play", () => this.onAudioPlay(audioElement))
    audioElement.addEventListener("pause", () =>
      this.onAudioPause(audioElement)
    )
    audioElement.addEventListener("ended", () =>
      this.onAudioEnded(audioElement)
    )
    audioElement.addEventListener("seeked", () =>
      this.onAudioSeeked(audioElement)
    )
  }

  private untrackAudioElement(audioElement: HTMLAudioElement): void {
    this.removeAudioListeners(audioElement)
    this.state.trackedAudios.delete(audioElement)
    this.audioUI.hideIndicator(audioElement)
  }

  private removeAudioListeners(audioElement: HTMLAudioElement): void {
    audioElement.removeEventListener("play", () =>
      this.onAudioPlay(audioElement)
    )
    audioElement.removeEventListener("pause", () =>
      this.onAudioPause(audioElement)
    )
    audioElement.removeEventListener("ended", () =>
      this.onAudioEnded(audioElement)
    )
    audioElement.removeEventListener("seeked", () =>
      this.onAudioSeeked(audioElement)
    )
  }

  private onAudioPlay(audioElement: HTMLAudioElement): void {
    const trackData = this.state.trackedAudios.get(audioElement)
    if (!trackData) return

    trackData.playbackStartTime = Date.now()
    trackData.wasPlaying = true
  }

  private onAudioPause(audioElement: HTMLAudioElement): void {
    const trackData = this.state.trackedAudios.get(audioElement)
    if (!trackData || !trackData.playbackStartTime) return

    const playbackTime = Date.now() - trackData.playbackStartTime
    trackData.totalPlaybackTime += playbackTime
    trackData.playbackStartTime = null
    trackData.wasPlaying = false
  }

  private onAudioEnded(audioElement: HTMLAudioElement): void {
    this.onAudioPause(audioElement)
  }

  private onAudioSeeked(audioElement: HTMLAudioElement): void {
    const trackData = this.state.trackedAudios.get(audioElement)
    if (!trackData) return

    if (!audioElement.paused && trackData.playbackStartTime) {
      trackData.playbackStartTime = Date.now()
    }
  }

  private checkAudioPlayback(): void {
    this.state.trackedAudios.forEach((trackData, audioElement) => {
      let currentTotalPlayback = trackData.totalPlaybackTime

      if (!audioElement.paused && trackData.playbackStartTime) {
        const currentPlaybackTime = Date.now() - trackData.playbackStartTime
        currentTotalPlayback += currentPlaybackTime
      }

      if (this.config.showOverlay && !audioElement.paused) {
        const progress = Math.min(
          100,
          (currentTotalPlayback / this.config.playbackThreshold) * 100
        )
        this.audioUI.showIndicator(audioElement, progress)
      } else if (audioElement.paused) {
        this.audioUI.hideIndicator(audioElement)
      }

      if (
        currentTotalPlayback >= this.config.playbackThreshold &&
        !trackData.lastEmitted &&
        this.onSustainedAudioAttention
      ) {
        trackData.lastEmitted = true

        const confidence = this.calculateConfidence(
          audioElement,
          currentTotalPlayback
        )

        const attention: SustainedAudioAttention = {
          src: audioElement.src || audioElement.currentSrc,
          title: getAudioTitle(audioElement),
          duration: audioElement.duration,
          playbackDuration: currentTotalPlayback,
          currentTime: audioElement.currentTime,
          confidence,
          audioElement
        }

        this.onSustainedAudioAttention(attention)
      }
    })
  }

  private calculateConfidence(
    audioElement: HTMLAudioElement,
    playbackDuration: number
  ): number {
    let confidence = 0

    // 1. Playback duration factor (0-50 points)
    const durationFactor = Math.min(
      50,
      (playbackDuration / this.config.playbackThreshold) * 50
    )
    confidence += durationFactor

    // 2. Completion percentage (0-30 points)
    if (audioElement.duration && !isNaN(audioElement.duration)) {
      const completionPercentage =
        (audioElement.currentTime / audioElement.duration) * 100
      const completionFactor = Math.min(30, (completionPercentage / 100) * 30)
      confidence += completionFactor
    }

    // 3. Continuous playback bonus (0-20 points)
    // If playback duration is close to threshold, it means continuous listening
    const continuityRatio =
      playbackDuration / (this.config.playbackThreshold * 1.5)
    const continuityFactor = Math.min(20, continuityRatio * 20)
    confidence += continuityFactor

    return Math.round(Math.min(100, confidence))
  }
}

export default CognitiveAttentionAudioTracker
export type { SustainedAudioAttention, AudioConfig }

const getAudioTitle = (audioElement: HTMLAudioElement): string => {
  if (audioElement.title && audioElement.title.trim() !== "") {
    return audioElement.title.trim()
  }

  const ariaLabel = audioElement.getAttribute("aria-label")
  if (ariaLabel && ariaLabel.trim() !== "") {
    return ariaLabel.trim()
  }

  const id = audioElement.id
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`)
    if (label && label.textContent) {
      return label.textContent.trim()
    }
  }

  const figure = audioElement.closest("figure")
  if (figure) {
    const figcaption = figure.querySelector("figcaption")
    if (figcaption && figcaption.textContent) {
      return figcaption.textContent.trim()
    }
  }

  const src = audioElement.src || audioElement.currentSrc
  if (src) {
    try {
      const url = new URL(src)
      const filename = url.pathname.split("/").pop() || ""
      return filename.replace(/\.[^/.]+$/, "") // Remove extension
    } catch {
      return ""
    }
  }

  return ""
}
