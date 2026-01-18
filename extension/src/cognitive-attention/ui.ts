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
      background: rgba(5, 5, 5, 0.95);
      color: #ffffff;
      padding: 20px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 11px;
      z-index: 999999;
      max-width: 380px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      max-height: 80vh;
      overflow-y: auto;
      backdrop-filter: blur(10px);
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
      <div style="border-bottom: 1px solid rgba(255, 255, 255, 0.1); margin-bottom: 12px; padding-bottom: 8px; display: flex; align-items: center; gap: 8px;">
        <div style="width: 8px; height: 8px; background: white; rotate: 45deg;"></div>
        <strong style="letter-spacing: 0.1em; text-transform: uppercase; font-size: 10px;">Cognitive Telemetry</strong>
      </div>
      <div style="margin-bottom: 12px; color: #a1a1aa; font-family: monospace; font-size: 10px; text-transform: uppercase;">
        STATUS: ${data.message}
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
      const statusIcon = metThreshold ? "●" : "○"
      const statusColor = metThreshold ? "#22c55e" : "#71717a"

      const readingInfo = `
        <div style="color: #ffffff; font-size: 10px; margin-bottom: 4px; font-family: monospace;">
          READ_PROGRESS: ${sustained.wordsRead}/${sustained.totalWords} WDS (${sustained.readingProgress.toFixed(0)}%)
        </div>
        <div style="color: #71717a; font-size: 9px; font-family: monospace;">
          VELOCITY: ${sustained.wordsPerMinute} WPM
        </div>
      `

      const thresholdMet = metThreshold
        ? '<div style="color: #22c55e; font-size: 9px; margin-top: 8px; font-family: monospace; text-transform: uppercase; letter-spacing: 0.05em;">✓ Threshold reached. Context locked.</div>'
        : ""

      html += `
        <div style="margin: 12px 0; padding: 12px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1);">
          <div style="color: ${statusColor}; font-weight: bold; margin-bottom: 8px; font-size: 10px; font-family: monospace; display: flex; align-items: center; gap: 6px;">
            <span style="display: inline-block; width: 6px; height: 6px; background: ${statusColor}; border-radius: 50%;"></span>
            SUSTAINED_ATTN: ${(sustained.duration / 1000).toFixed(1)}S / ${(sustained.cognitiveAttentionThreshold / 1000).toFixed(0)}S
          </div>
          <div style="font-family: monospace; color: ${statusColor}; margin-bottom: 8px; font-size: 10px; letter-spacing: 2px;">
            [${progressBar}${emptyBar}] ${progress.toFixed(0)}%
          </div>
          <div style="color: #71717a; font-size: 9px; margin-bottom: 8px; font-family: monospace;">
            CONFIDENCE_SCORE: ${sustained.confidence}%
          </div>
          ${readingInfo}
          ${thresholdMet}
        </div>
      `

      html +=
        '<div style="margin-top: 12px; font-size: 9px; text-transform: uppercase; color: #71717a; letter-spacing: 0.1em; margin-bottom: 8px;">Top_Candidates:</div>'

      data.topElements.forEach((elem, idx) => {
        const preview =
          elem.text.substring(0, 50) + (elem.text.length > 50 ? "..." : "")
        const color = idx === 0 ? "#ffffff" : "#71717a"
        const cogBadge = elem.cognitivelyAttended ? " [🧠]" : ""

        html += `
          <div style="margin: 4px 0; padding: 8px; background: rgba(255, 255, 255, 0.02); border-left: 1px solid ${idx === 0 ? 'white' : 'transparent'};">
            <div style="color: ${color}; font-family: monospace; font-size: 9px;">
              #${idx + 1} // SCR: ${elem.score.toFixed(0)}${cogBadge}
            </div>
            <div style="font-size: 9px; color: #52525b; margin: 2px 0; font-family: monospace;">
              SIG: ${elem.reasons.join(" + ")}
            </div>
            <div style="font-size: 10px; color: #a1a1aa; margin-top: 4px; line-height: 1.4;">
              "${preview}"
            </div>
          </div>
        `
      })
    }

    html += `
      <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.05); font-size: 9px; color: #52525b; font-family: monospace; display: flex; justify-content: space-between;">
        <span>VEL: ${data.state.scrollVelocity.toFixed(0)} PX/S</span>
        <span>ACT: ${data.state.isPageActive ? "TRUE" : "FALSE"}</span>
        <span>NODE: ${data.state.textElementsCount}</span>
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
      border: 1px solid white;
      background: rgba(255, 255, 255, 0.05);
      pointer-events: none;
      z-index: 999998;
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.1);
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
            rgba(255, 255, 255, 0.1) 0%, 
            rgba(255, 255, 255, 0.05) 80%,
            rgba(255, 255, 255, 0) 100%);
          pointer-events: none;
          z-index: 999999;
          border-bottom: 1px dashed white;
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
            background: white;
            color: black;
            padding: 2px 6px;
            font-size: 9px;
            font-family: monospace;
            font-weight: bold;
            pointer-events: none;
            z-index: 1000000;
            box-shadow: 0 4px 10px rgba(0,0,0,0.3);
            text-transform: uppercase;
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
    rect.setAttribute("stroke", "#ffffff")
    rect.setAttribute("stroke-width", "1")
    rect.setAttribute("stroke-dasharray", perimeter.toString())
    rect.setAttribute("stroke-dashoffset", perimeter.toString())
    rect.setAttribute("class", this.progressClassName)
    rect.style.filter = "drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))"

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
      background: rgba(255, 255, 255, 0.05);
      pointer-events: none;
      z-index: 999996;
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
      bottom: -2px;
      left: 0;
      right: 0;
      height: 2px;
      background: white;
      pointer-events: none;
      z-index: 9999;
      transition: width 0.1s ease-out;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.5);
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

    // Monochromatic progress
    if (progress >= 100) {
      indicator.style.background = "white"
      indicator.style.boxShadow = "0 0 15px rgba(255, 255, 255, 0.8)"
    } else {
      indicator.style.background = "rgba(255, 255, 255, 0.7)"
      indicator.style.boxShadow = "0 0 5px rgba(255, 255, 255, 0.3)"
    }
  }
}

export {
  CognitiveAttentionTextUI,
  CognitiveAttentionImageUI,
  CognitiveAttentionAudioUI
}
