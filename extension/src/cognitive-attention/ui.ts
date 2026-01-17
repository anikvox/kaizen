type AttentionCandidate = {
  element: Element
  text: string
  score: number
  reasons: string[]
  bounds: DOMRect
  cognitivelyAttended?: boolean
  sustainedDuration?: number
}

type UIConfig = {
  debugMode: boolean
  showOverlay: boolean
}

type DebugData = {
  message: string
  topElements: AttentionCandidate[]
  currentSustainedAttention: {
    confidence: number
    wordsRead: number
    totalWords: number
    readingProgress: number
    duration: number
    cognitiveAttentionThreshold: number
    wordsPerMinute: number
  } | null
  state: {
    scrollVelocity: number
    isPageActive: boolean
    textElementsCount: number
  }
}

class CognitiveAttentionTextUI {
  private config: UIConfig
  private debugOverlayId = "cog-attention-debug"
  private highlightClassName = "cog-attention-highlight"

  constructor(config: UIConfig) {
    this.config = config
  }

  updateConfig(config: Partial<UIConfig>): void {
    const wasDebugMode = this.config.debugMode
    const wasShowOverlay = this.config.showOverlay

    this.config = { ...this.config, ...config }

    // Handle toggling off
    if (wasDebugMode && !this.config.debugMode) {
      this.removeDebugOverlay()
    }
    if (wasShowOverlay && !this.config.showOverlay) {
      this.removeHighlights()
    }

    // Handle toggling on
    if (!wasDebugMode && this.config.debugMode) {
      this.createDebugOverlay()
    }
  }

  update(debugData: DebugData, topCandidate?: AttentionCandidate): void {
    if (this.config.debugMode) {
      this.updateDebugOverlay(debugData)
    }

    if (this.config.showOverlay) {
      this.highlightTopElement(
        topCandidate,
        debugData.currentSustainedAttention
      )
    }
  }

  destroy(): void {
    this.removeDebugOverlay()
    this.removeHighlights()
  }

  // Debug overlay methods
  private createDebugOverlay(): void {
    if (document.getElementById(this.debugOverlayId)) return

    const overlay = document.createElement("div")
    overlay.id = this.debugOverlayId
    overlay.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.9);
      color: #00ff00;
      padding: 15px;
      border-radius: 8px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      z-index: 999999;
      max-width: 400px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      max-height: 80vh;
      overflow-y: auto;
    `
    document.body.appendChild(overlay)
  }

  private updateDebugOverlay(data: DebugData): void {
    if (!this.config.debugMode) return

    const overlay = document.getElementById(this.debugOverlayId)
    if (!overlay) {
      this.createDebugOverlay()
      return
    }

    let html = `
      <div style="border-bottom: 2px solid #00ff00; margin-bottom: 10px; padding-bottom: 5px;">
        <strong>🧠 ATTENTION TRACKER</strong>
      </div>
      <div style="margin-bottom: 10px; color: #ffff00;">
        ${data.message}
      </div>
    `

    if (
      data.topElements &&
      data.topElements.length > 0 &&
      data.currentSustainedAttention
    ) {
      const sustained = data.currentSustainedAttention
      const progress = Math.min(
        100,
        (sustained.duration / sustained.cognitiveAttentionThreshold) * 100
      )
      const progressBar = "█".repeat(Math.floor(progress / 10))
      const emptyBar = "░".repeat(10 - Math.floor(progress / 10))
      const metThreshold =
        sustained.duration >= sustained.cognitiveAttentionThreshold
      const statusIcon = metThreshold ? "✓" : "⏱️"
      const statusColor = metThreshold ? "#00ff00" : "#ffaa00"

      const readingInfo = `
        <div style="color: #00ff88; font-size: 11px; margin-bottom: 3px;">
          Reading: ${sustained.wordsRead} / ${sustained.totalWords} words (${sustained.readingProgress.toFixed(0)}%)
        </div>
        <div style="color: #888; font-size: 10px;">
          @ ${sustained.wordsPerMinute} WPM
        </div>
      `

      const thresholdMet = metThreshold
        ? '<div style="color: #00ff00; font-size: 10px; margin-top: 5px;">✓ Cognitive attention threshold met!</div>'
        : ""

      html += `
        <div style="margin: 10px 0; padding: 10px; background: rgba(0,100,255,0.1); border: 2px solid ${statusColor}; border-radius: 5px;">
          <div style="color: ${statusColor}; font-weight: bold; margin-bottom: 5px;">
            ${statusIcon} SUSTAINED ATTENTION: ${(sustained.duration / 1000).toFixed(1)}s / ${(sustained.cognitiveAttentionThreshold / 1000).toFixed(0)}s
          </div>
          <div style="font-family: monospace; color: ${statusColor}; margin-bottom: 5px;">
            [${progressBar}${emptyBar}] ${progress.toFixed(0)}%
          </div>
          <div style="color: #00aaff; font-size: 11px; margin-bottom: 3px;">
            Confidence: ${sustained.confidence}%
          </div>
          ${readingInfo}
          ${thresholdMet}
        </div>
      `

      html +=
        '<div style="margin-top: 10px;"><strong>Top Candidates:</strong></div>'

      data.topElements.forEach((elem, idx) => {
        const preview =
          elem.text.substring(0, 60) + (elem.text.length > 60 ? "..." : "")
        const color = idx === 0 ? "#00ff00" : idx === 1 ? "#ffff00" : "#888"
        const cogBadge = elem.cognitivelyAttended ? " 🧠" : ""

        html += `
          <div style="margin: 8px 0; padding: 8px; background: rgba(255,255,255,0.05); border-left: 3px solid ${color};">
            <div style="color: ${color}; font-weight: bold;">
              #${idx + 1} - Score: ${elem.score.toFixed(0)}${cogBadge}
            </div>
            <div style="font-size: 10px; color: #aaa; margin: 3px 0;">
              ${elem.reasons.join(" + ")}
            </div>
            <div style="font-size: 11px; font-style: italic; margin-top: 5px;">
              "${preview}"
            </div>
          </div>
        `
      })
    }

    html += `
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #333; font-size: 10px; color: #666;">
        Scroll: ${data.state.scrollVelocity.toFixed(0)} px/s | 
        Active: ${data.state.isPageActive ? "✓" : "✗"} | 
        Elements: ${data.state.textElementsCount}
      </div>
    `

    overlay.innerHTML = html
  }

  private removeDebugOverlay(): void {
    const overlay = document.getElementById(this.debugOverlayId)
    if (overlay) overlay.remove()
  }

  // Green box overlay methods
  private highlightTopElement(
    candidate: AttentionCandidate | undefined,
    sustainedAttention: DebugData["currentSustainedAttention"]
  ): void {
    if (!this.config.showOverlay) return

    this.removeHighlights()

    if (!candidate) return

    const bounds = candidate.bounds
    const highlight = document.createElement("div")
    highlight.className = this.highlightClassName
    highlight.style.cssText = `
      position: absolute;
      left: ${bounds.left + window.scrollX}px;
      top: ${bounds.top + window.scrollY}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      border: 2px solid #00ff00;
      background: rgba(0, 255, 0, 0.1);
      pointer-events: none;
      z-index: 999998;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
    `
    document.body.appendChild(highlight)

    // Add reading progress indicator
    if (
      sustainedAttention &&
      sustainedAttention.duration >=
        sustainedAttention.cognitiveAttentionThreshold
    ) {
      if (sustainedAttention.readingProgress > 0) {
        const progressHeight =
          (bounds.height * sustainedAttention.readingProgress) / 100

        const progressOverlay = document.createElement("div")
        progressOverlay.className = this.highlightClassName
        progressOverlay.style.cssText = `
          position: absolute;
          left: ${bounds.left + window.scrollX}px;
          top: ${bounds.top + window.scrollY}px;
          width: ${bounds.width}px;
          height: ${progressHeight}px;
          background: linear-gradient(to bottom, 
            rgba(144, 238, 144, 0.3) 0%, 
            rgba(144, 238, 144, 0.2) 80%,
            rgba(144, 238, 144, 0) 100%);
          pointer-events: none;
          z-index: 999999;
          border-bottom: 2px dashed #90ee90;
        `
        document.body.appendChild(progressOverlay)

        // Add percentage label
        if (sustainedAttention.readingProgress < 100) {
          const label = document.createElement("div")
          label.className = this.highlightClassName
          label.style.cssText = `
            position: absolute;
            left: ${bounds.left + window.scrollX + bounds.width - 60}px;
            top: ${bounds.top + window.scrollY + progressHeight - 20}px;
            background: rgba(144, 238, 144, 0.9);
            color: #000;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 11px;
            font-family: monospace;
            font-weight: bold;
            pointer-events: none;
            z-index: 1000000;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          `
          label.textContent = `${sustainedAttention.readingProgress.toFixed(0)}% read`
          document.body.appendChild(label)
        }
      }
    }
  }

  private removeHighlights(): void {
    document
      .querySelectorAll(`.${this.highlightClassName}`)
      .forEach((el) => el.remove())
  }
}

type ImageUIConfig = {
  showOverlay: boolean
}

class CognitiveAttentionImageUI {
  private config: ImageUIConfig
  private highlightClassName = "image-hover-highlight"
  private svgClassName = "image-hover-svg"
  private progressClassName = "image-hover-progress"

  constructor(config: ImageUIConfig) {
    this.config = config
  }

  updateConfig(config: Partial<ImageUIConfig>): void {
    const wasShowOverlay = this.config.showOverlay
    this.config = { ...this.config, ...config }

    if (wasShowOverlay && !this.config.showOverlay) {
      this.hideHighlight()
    }
  }

  showHighlight(image: HTMLImageElement): void {
    if (!this.config.showOverlay) return

    this.hideHighlight()

    const bounds = image.getBoundingClientRect()

    // Create SVG for progress border
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
    svg.setAttribute("class", `${this.highlightClassName} ${this.svgClassName}`)
    svg.style.cssText = `
      position: fixed;
      left: ${bounds.left}px;
      top: ${bounds.top}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      pointer-events: none;
      z-index: 999997;
    `

    // Calculate perimeter for stroke animation
    const width = bounds.width
    const height = bounds.height
    const perimeter = 2 * (width + height)

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect")
    rect.setAttribute("x", "0.5")
    rect.setAttribute("y", "0.5")
    rect.setAttribute("width", (width - 1).toString())
    rect.setAttribute("height", (height - 1).toString())
    rect.setAttribute("fill", "none")
    rect.setAttribute("stroke", "#bfff00")
    rect.setAttribute("stroke-width", "2")
    rect.setAttribute("stroke-dasharray", perimeter.toString())
    rect.setAttribute("stroke-dashoffset", perimeter.toString())
    rect.setAttribute("class", this.progressClassName)
    rect.style.filter = "drop-shadow(0 0 4px rgba(191, 255, 0, 0.8))"

    svg.appendChild(rect)
    document.body.appendChild(svg)

    // Create background overlay
    const overlay = document.createElement("div")
    overlay.className = this.highlightClassName
    overlay.style.cssText = `
      position: fixed;
      left: ${bounds.left}px;
      top: ${bounds.top}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      background: rgba(191, 255, 0, 0.08);
      pointer-events: none;
      z-index: 999996;
      border-radius: 2px;
    `
    document.body.appendChild(overlay)
  }

  updateProgress(image: HTMLImageElement, progress: number): void {
    if (!this.config.showOverlay) return

    const progressRect = document.querySelector(
      `.${this.progressClassName}`
    ) as SVGRectElement
    const svg = document.querySelector(`.${this.svgClassName}`) as SVGElement
    const overlay = document.querySelectorAll(
      `.${this.highlightClassName}`
    )[1] as HTMLElement

    if (!progressRect || !svg) return

    // Update position to track image on scroll
    const bounds = image.getBoundingClientRect()
    svg.style.left = `${bounds.left}px`
    svg.style.top = `${bounds.top}px`
    if (overlay) {
      overlay.style.left = `${bounds.left}px`
      overlay.style.top = `${bounds.top}px`
    }

    // Animate progress clockwise around border
    const perimeter = parseFloat(
      progressRect.getAttribute("stroke-dasharray") || "0"
    )
    const offset = perimeter - (perimeter * progress) / 100
    progressRect.setAttribute("stroke-dashoffset", offset.toString())

    // Pulse animation when complete
    if (progress >= 100) {
      progressRect.style.animation = "pulse 0.5s ease-in-out infinite"

      if (!document.querySelector("style[data-image-pulse]")) {
        const style = document.createElement("style")
        style.setAttribute("data-image-pulse", "true")
        style.textContent = `
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
        `
        document.head.appendChild(style)
      }
    }
  }

  hideHighlight(): void {
    document
      .querySelectorAll(`.${this.highlightClassName}`)
      .forEach((el) => el.remove())
  }

  destroy(): void {
    this.hideHighlight()
  }
}

type AudioUIConfig = {
  showOverlay: boolean
}

class CognitiveAttentionAudioUI {
  private config: AudioUIConfig
  private indicators: Map<HTMLAudioElement, HTMLDivElement>

  constructor(config: AudioUIConfig) {
    this.config = config
    this.indicators = new Map()
  }

  showIndicator(audioElement: HTMLAudioElement, progress: number): void {
    if (!this.config.showOverlay) return

    let indicator = this.indicators.get(audioElement)

    if (!indicator) {
      indicator = this.createIndicator(audioElement)
      this.indicators.set(audioElement, indicator)
    }

    this.updateIndicatorProgress(indicator, progress)
  }

  hideIndicator(audioElement: HTMLAudioElement): void {
    const indicator = this.indicators.get(audioElement)
    if (indicator && indicator.parentNode) {
      indicator.parentNode.removeChild(indicator)
    }
    this.indicators.delete(audioElement)
  }

  updateConfig(newConfig: Partial<AudioUIConfig>): void {
    if (newConfig.showOverlay !== undefined) {
      this.config.showOverlay = newConfig.showOverlay

      if (!this.config.showOverlay) {
        // Hide all indicators if overlay is disabled
        this.indicators.forEach((indicator, audioElement) => {
          this.hideIndicator(audioElement)
        })
      }
    }
  }

  destroy(): void {
    this.indicators.forEach((indicator, audioElement) => {
      this.hideIndicator(audioElement)
    })
    this.indicators.clear()
  }

  private createIndicator(audioElement: HTMLAudioElement): HTMLDivElement {
    const indicator = document.createElement("div")
    indicator.style.cssText = `
      position: absolute;
      bottom: -4px;
      left: 0;
      right: 0;
      height: 4px;
      background: linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%);
      border-radius: 2px;
      pointer-events: none;
      z-index: 9999;
      transition: width 0.1s ease-out;
      box-shadow: 0 1px 3px rgba(251, 191, 36, 0.5);
    `

    // Position indicator relative to audio element
    const parent = audioElement.parentElement
    if (parent) {
      const originalPosition = window.getComputedStyle(parent).position
      if (originalPosition === "static") {
        parent.style.position = "relative"
      }
      parent.appendChild(indicator)
    } else {
      // Fallback: append to body with absolute positioning
      document.body.appendChild(indicator)
      this.positionIndicatorAbsolute(indicator, audioElement)
    }

    return indicator
  }

  private positionIndicatorAbsolute(
    indicator: HTMLDivElement,
    audioElement: HTMLAudioElement
  ): void {
    const rect = audioElement.getBoundingClientRect()
    indicator.style.position = "fixed"
    indicator.style.left = `${rect.left}px`
    indicator.style.top = `${rect.bottom - 4}px`
    indicator.style.width = `${rect.width}px`
  }

  private updateIndicatorProgress(
    indicator: HTMLDivElement,
    progress: number
  ): void {
    indicator.style.width = `${progress}%`

    // Change color as progress increases
    if (progress >= 100) {
      indicator.style.background =
        "linear-gradient(90deg, #10b981 0%, #059669 100%)"
      indicator.style.boxShadow = "0 1px 3px rgba(16, 185, 129, 0.5)"
    } else if (progress >= 75) {
      indicator.style.background =
        "linear-gradient(90deg, #f59e0b 0%, #d97706 100%)"
      indicator.style.boxShadow = "0 1px 3px rgba(245, 158, 11, 0.5)"
    } else {
      indicator.style.background =
        "linear-gradient(90deg, #fbbf24 0%, #f59e0b 100%)"
      indicator.style.boxShadow = "0 1px 3px rgba(251, 191, 36, 0.5)"
    }
  }
}

export {
  CognitiveAttentionTextUI,
  CognitiveAttentionImageUI,
  CognitiveAttentionAudioUI
}
