import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  COGNITIVE_ATTENTION_SUSTAINED_TIME,
  COGNITIVE_ATTENTION_WORDS_PER_MINUTE
} from "../default-settings"

import {
  IGNORE_SELECTORS,
  MIN_TEXT_LENGTH,
  MOUSE_HOVER_THRESHOLD,
  READING_PROGRESS_INTERVAL,
  SCROLL_VELOCITY_THRESHOLD,
  UPDATE_INTERVAL
} from "./constants"
import { CognitiveAttentionTextUI } from "./ui"

type Config = {
  cognitiveAttentionThreshold: number // Sustained attention time
  idleThreshold: number // Idle timeout
  wordsPerMinute: number // Reading speed
  debugMode: boolean // Show debug overlay with scores
  showOverlay: boolean // Show green boxes around attended elements
  onSustainedAttentionChange?: (attention: SustainedAttention) => void // Callback on sustained attention change
}

// Types
type SustainedAttention = {
  text: string
  confidence: number
  wordsRead: number
  totalWords: number
  readingProgress: number
  readingTimeElapsed: number
}

type TrackerState = {
  mousePosition: { x: number; y: number }
  lastMouseMove: number
  isPageActive: boolean
  scrollPosition: number
  lastScrollTime: number
  scrollVelocity: number
  mouseHoverElement: Element | null
  mouseHoverStartTime: number | null
  isScrolling: boolean
  lastActivity: number
  currentTopElement: Element | null
  topElementStartTime: number | null
}

type TextElement = {
  element: HTMLElement
  text: string
  tag: string
  bounds: DOMRect | null
  isMainContent: boolean
}

type AttentionCandidate = {
  element: Element
  text: string
  score: number
  reasons: string[]
  bounds: DOMRect
  cognitivelyAttended?: boolean
  sustainedDuration?: number
}

type SustainedAttentionHistory = {
  element: Element
  text: string
  firstSeenAt: number
  totalDuration: number
  lastEmittedProgress: number
  lastEmittedTime: number
}

class CognitiveAttentionTextTracker {
  public config: Omit<Config, "onSustainedAttentionChange"> & {
    cognitiveAttentionThreshold: number
    idleThreshold: number
    wordsPerMinute: number
    debugMode: boolean
    showOverlay: boolean
  }
  private onSustainedAttentionChange?: (attention: SustainedAttention) => void
  private state: TrackerState
  private textElements: TextElement[] = []
  private attentionScores = new Map<Element, AttentionCandidate>()
  private sustainedAttentionHistory = new Map<
    Element,
    SustainedAttentionHistory
  >()
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null
  private trackingInterval?: ReturnType<typeof setInterval>
  private lastBroadcastedElement: Element | null = null
  private ui: CognitiveAttentionTextUI

  constructor(config?: Partial<Config>) {
    this.onSustainedAttentionChange = config?.onSustainedAttentionChange

    this.config = {
      cognitiveAttentionThreshold:
        config?.cognitiveAttentionThreshold ||
        COGNITIVE_ATTENTION_SUSTAINED_TIME.defaultValue,
      idleThreshold:
        config?.idleThreshold ||
        COGNITIVE_ATTENTION_IDLE_THRESHOLD_TIME.defaultValue,
      wordsPerMinute:
        config?.wordsPerMinute ||
        COGNITIVE_ATTENTION_WORDS_PER_MINUTE.defaultValue,
      debugMode:
        config?.debugMode || COGNITIVE_ATTENTION_DEBUG_MODE.defaultValue,
      showOverlay:
        config?.showOverlay || COGNITIVE_ATTENTION_SHOW_OVERLAY.defaultValue
    }

    this.ui = new CognitiveAttentionTextUI({
      debugMode: this.config.debugMode,
      showOverlay: this.config.showOverlay
    })

    const now = Date.now()
    this.state = {
      mousePosition: { x: 0, y: 0 },
      lastMouseMove: now,
      isPageActive: true,
      scrollPosition: 0,
      lastScrollTime: now,
      scrollVelocity: 0,
      mouseHoverElement: null,
      mouseHoverStartTime: null,
      isScrolling: false,
      lastActivity: now,
      currentTopElement: null,
      topElementStartTime: null
    }
  }

  init(): void {
    this.discoverTextElements()
    this.setupEventListeners()

    this.trackingInterval = setInterval(() => {
      this.calculateAttention()
    }, UPDATE_INTERVAL)
  }

  destroy(): void {
    if (this.trackingInterval) clearInterval(this.trackingInterval)
    if (this.scrollTimeout) clearTimeout(this.scrollTimeout)

    document.removeEventListener("mousemove", this.onMouseMove)
    document.removeEventListener("scroll", this.onScroll)
    document.removeEventListener("visibilitychange", this.onVisibilityChange)

    this.ui.destroy()
  }

  updateConfig(newConfig: Partial<Config>): void {
    // Update tracker config
    if (newConfig.cognitiveAttentionThreshold !== undefined) {
      this.config.cognitiveAttentionThreshold =
        newConfig.cognitiveAttentionThreshold
    }
    if (newConfig.idleThreshold !== undefined) {
      this.config.idleThreshold = newConfig.idleThreshold
    }
    if (newConfig.wordsPerMinute !== undefined) {
      this.config.wordsPerMinute = newConfig.wordsPerMinute
    }
    if (newConfig.debugMode !== undefined) {
      this.config.debugMode = newConfig.debugMode
    }
    if (newConfig.showOverlay !== undefined) {
      this.config.showOverlay = newConfig.showOverlay
    }
    if (newConfig.onSustainedAttentionChange !== undefined) {
      this.onSustainedAttentionChange = newConfig.onSustainedAttentionChange
    }

    // Update UI config
    this.ui.updateConfig({
      debugMode: this.config.debugMode,
      showOverlay: this.config.showOverlay
    })
  }

  // Private methods
  private setupEventListeners(): void {
    document.addEventListener("mousemove", this.onMouseMove)
    document.addEventListener("scroll", this.onScroll, { passive: true })
    document.addEventListener("visibilitychange", this.onVisibilityChange)
  }

  private onMouseMove = (e: MouseEvent): void => {
    const now = Date.now()
    this.state.mousePosition = { x: e.clientX, y: e.clientY }
    this.state.lastMouseMove = now
    this.state.lastActivity = now

    const hoveredElement = document.elementFromPoint(e.clientX, e.clientY)
    if (hoveredElement !== this.state.mouseHoverElement) {
      this.state.mouseHoverElement = hoveredElement
      this.state.mouseHoverStartTime = now
    }
  }

  private onScroll = (): void => {
    const now = Date.now()
    const currentScroll = window.scrollY
    const timeDelta = now - this.state.lastScrollTime
    const scrollDelta = currentScroll - this.state.scrollPosition

    this.state.scrollVelocity = Math.abs((scrollDelta / timeDelta) * 1000)
    this.state.scrollPosition = currentScroll
    this.state.lastScrollTime = now
    this.state.isScrolling = true
    this.state.lastActivity = now

    if (this.scrollTimeout) clearTimeout(this.scrollTimeout)
    this.scrollTimeout = setTimeout(() => {
      this.state.isScrolling = false
      this.state.scrollVelocity = 0
    }, 150)
  }

  private onVisibilityChange = (): void => {
    this.state.isPageActive = !document.hidden
    if (this.state.isPageActive) {
      this.state.lastActivity = Date.now()
    }
  }

  private discoverTextElements(): void {
    this.textElements = []
    const textTags = [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "li",
      "td",
      "div",
      "span",
      "article",
      "section"
    ]

    textTags.forEach((tag) => {
      const elements = document.getElementsByTagName(tag)
      Array.from(elements).forEach((el) => {
        const htmlEl = el as HTMLElement
        const text = htmlEl.innerText?.trim() || ""

        if (text.length >= MIN_TEXT_LENGTH && !this.shouldIgnoreElement(el)) {
          this.textElements.push({
            element: htmlEl,
            text,
            tag,
            bounds: null,
            isMainContent: this.isMainContent(htmlEl)
          })
        }
      })
    })
  }

  private shouldIgnoreElement(element: Element): boolean {
    let current: Element | null = element

    while (current && current !== document.body) {
      const tagName = current.tagName.toLowerCase()
      if (
        [
          "nav",
          "header",
          "footer",
          "aside",
          "button",
          "input",
          "select",
          "textarea"
        ].includes(tagName)
      ) {
        return true
      }

      for (const selector of IGNORE_SELECTORS) {
        try {
          if (current.matches(selector)) return true
        } catch {
          // Ignore invalid selectors
        }
      }

      const className = (current.className || "").toString().toLowerCase()
      const id = (current.id || "").toLowerCase()
      if (
        (className + " " + id).match(
          /\b(nav|menu|header|footer|sidebar|advertisement|banner|cookie|popup|modal)\b/
        )
      ) {
        return true
      }

      current = current.parentElement
    }

    return false
  }

  private isMainContent(element: HTMLElement): boolean {
    let current: Element | null = element
    while (current && current !== document.body) {
      const tag = current.tagName.toLowerCase()
      if (["article", "main"].includes(tag)) return true

      const role = current.getAttribute("role")
      if (role === "main" || role === "article") return true

      current = current.parentElement
    }
    return false
  }

  private isElementInViewport(bounds: DOMRect): boolean {
    return (
      bounds.top < window.innerHeight &&
      bounds.bottom > 0 &&
      bounds.left < window.innerWidth &&
      bounds.right > 0
    )
  }

  private calculateAttention(): void {
    const now = Date.now()
    this.attentionScores.clear()

    const timeSinceLastActivity = now - this.state.lastActivity
    const isIdle = timeSinceLastActivity > this.config.idleThreshold

    if (!this.state.isPageActive || isIdle) return

    const candidates: AttentionCandidate[] = []

    this.textElements.forEach((textElem) => {
      const bounds = textElem.element.getBoundingClientRect()
      textElem.bounds = bounds

      if (!this.isElementInViewport(bounds)) return

      let score = 0
      const reasons: string[] = []

      // 1. Viewport position (0-30)
      score += 20
      reasons.push("in-viewport(20)")

      if (!this.state.isScrolling) {
        const elementCenterY = (bounds.top + bounds.bottom) / 2
        const viewportCenterY = window.innerHeight / 2
        const distanceFromCenter =
          Math.abs(elementCenterY - viewportCenterY) / (window.innerHeight / 2)

        if (distanceFromCenter < 0.5) {
          const centerBonus = Math.floor(10 * (1 - distanceFromCenter * 2))
          score += centerBonus
          reasons.push(`center-focus(${centerBonus})`)
        }
      }

      // 2. Mouse proximity (0-35)
      const { x: mouseX, y: mouseY } = this.state.mousePosition

      if (
        mouseX >= bounds.left &&
        mouseX <= bounds.right &&
        mouseY >= bounds.top &&
        mouseY <= bounds.bottom
      ) {
        const elementAtMouse = document.elementFromPoint(mouseX, mouseY)
        const isTextUnderMouse =
          elementAtMouse === textElem.element ||
          textElem.element.contains(elementAtMouse)
        const hasTextUnderMouse =
          elementAtMouse &&
          "innerText" in elementAtMouse &&
          (elementAtMouse as HTMLElement).innerText?.trim().length > 0

        if (isTextUnderMouse && hasTextUnderMouse) {
          score += 25
          reasons.push("mouse-over-text(25)")

          if (
            this.state.mouseHoverElement === textElem.element &&
            this.state.mouseHoverStartTime !== null
          ) {
            const hoverDuration = now - this.state.mouseHoverStartTime
            if (hoverDuration > MOUSE_HOVER_THRESHOLD) {
              score += 10
              reasons.push(`hover-${Math.floor(hoverDuration / 1000)}s(10)`)
            }
          }
        } else {
          score += 5
          reasons.push("mouse-near(5)")
        }
      } else {
        const centerX = (bounds.left + bounds.right) / 2
        const centerY = (bounds.top + bounds.bottom) / 2
        const distance = Math.sqrt(
          Math.pow(mouseX - centerX, 2) + Math.pow(mouseY - centerY, 2)
        )

        if (distance < 200) {
          const proximityScore = Math.floor(15 * (1 - distance / 200))
          score += proximityScore
          reasons.push(`proximity(${proximityScore})`)
        }
      }

      // 3. Scroll behavior (0-25)
      if (this.state.isScrolling) {
        if (this.state.scrollVelocity > SCROLL_VELOCITY_THRESHOLD) {
          score -= 15
          reasons.push("fast-scroll(-15)")
        } else {
          score += 15
          reasons.push("slow-scroll(15)")
        }
      } else {
        score += 10
        reasons.push("no-scroll(10)")
      }

      // 4. Element importance (0-10)
      const tag = textElem.tag.toLowerCase()
      if (tag.match(/^h[1-3]$/)) {
        score += 10
        reasons.push("heading(10)")
      } else if (tag.match(/^h[4-6]$/)) {
        score += 5
        reasons.push("subheading(5)")
      }

      const style = window.getComputedStyle(textElem.element)
      if (style.fontWeight === "bold" || parseInt(style.fontWeight) >= 600) {
        score += 3
        reasons.push("bold(3)")
      }

      // 5. Main content bonus (0-15)
      if (textElem.isMainContent) {
        score += 15
        reasons.push("main-content(15)")
      }

      candidates.push({
        element: textElem.element,
        text: textElem.text,
        score: Math.max(0, score),
        reasons,
        bounds
      })
    })

    candidates.sort((a, b) => b.score - a.score)

    const topCandidate = candidates[0]
    if (topCandidate) {
      if (this.state.currentTopElement !== topCandidate.element) {
        this.state.currentTopElement = topCandidate.element
        this.state.topElementStartTime = now

        if (!this.sustainedAttentionHistory.has(topCandidate.element)) {
          this.sustainedAttentionHistory.set(topCandidate.element, {
            element: topCandidate.element,
            text: topCandidate.text,
            firstSeenAt: now,
            totalDuration: 0,
            lastEmittedProgress: 0,
            lastEmittedTime: now
          })
        }
      }

      const sustainedDuration =
        this.state.topElementStartTime !== null
          ? now - this.state.topElementStartTime
          : 0
      const history = this.sustainedAttentionHistory.get(topCandidate.element)

      if (history) {
        history.totalDuration = sustainedDuration

        if (sustainedDuration >= this.config.cognitiveAttentionThreshold) {
          topCandidate.cognitivelyAttended = true
          topCandidate.sustainedDuration = sustainedDuration
        }
      }
    }

    candidates.slice(0, 10).forEach((candidate) => {
      this.attentionScores.set(candidate.element, candidate)
    })

    // Update UI with current attention state
    if (topCandidate && this.state.topElementStartTime !== null) {
      const sustainedDuration = now - this.state.topElementStartTime
      const history = this.sustainedAttentionHistory.get(topCandidate.element)

      if (history) {
        const readingProgress = this.calculateReadingProgress(
          topCandidate.text,
          sustainedDuration
        )
        const confidence = this.calculateConfidenceScore(
          topCandidate,
          sustainedDuration
        )

        this.ui.update(
          {
            message: isIdle ? "💤 User is idle" : "👁️ Tracking active",
            topElements: candidates.slice(0, 5),
            currentSustainedAttention: {
              confidence,
              wordsRead: readingProgress.wordsRead,
              totalWords: readingProgress.totalWords,
              readingProgress: readingProgress.readingProgress,
              duration: sustainedDuration,
              cognitiveAttentionThreshold:
                this.config.cognitiveAttentionThreshold,
              wordsPerMinute: this.config.wordsPerMinute
            },
            state: {
              scrollVelocity: this.state.scrollVelocity,
              isPageActive: this.state.isPageActive,
              textElementsCount: this.textElements.length
            }
          },
          topCandidate
        )
      }
    } else {
      // No candidate or not tracking yet
      this.ui.update(
        {
          message: isIdle ? "💤 User is idle" : "👁️ Tracking active",
          topElements: candidates.slice(0, 5),
          currentSustainedAttention: null,
          state: {
            scrollVelocity: this.state.scrollVelocity,
            isPageActive: this.state.isPageActive,
            textElementsCount: this.textElements.length
          }
        },
        topCandidate
      )
    }

    // Emit callback when sustained attention threshold is met
    if (this.onSustainedAttentionChange && topCandidate) {
      const sustainedDuration =
        this.state.topElementStartTime !== null
          ? now - this.state.topElementStartTime
          : 0
      const metThreshold =
        sustainedDuration >= this.config.cognitiveAttentionThreshold

      if (metThreshold) {
        const history = this.sustainedAttentionHistory.get(topCandidate.element)

        if (history) {
          const readingProgress = this.calculateReadingProgress(
            topCandidate.text,
            sustainedDuration
          )
          const timeSinceLastEmit = now - history.lastEmittedTime

          // Emit if:
          // 1. It's a new element (different from last broadcasted), OR
          // 2. Enough time has passed since last emission (READING_PROGRESS_INTERVAL), OR
          // 3. User has progressed significantly in reading (at least 10% more)
          const isNewElement =
            topCandidate.element !== this.lastBroadcastedElement
          const hasEnoughTimePassed =
            timeSinceLastEmit >= READING_PROGRESS_INTERVAL
          const hasProgressedEnough =
            readingProgress.readingProgress >= history.lastEmittedProgress + 10

          if (isNewElement || hasEnoughTimePassed || hasProgressedEnough) {
            const confidence = this.calculateConfidenceScore(
              topCandidate,
              sustainedDuration
            )

            const sustainedAttention: SustainedAttention = {
              text: topCandidate.text,
              confidence,
              wordsRead: readingProgress.wordsRead,
              totalWords: readingProgress.totalWords,
              readingProgress: readingProgress.readingProgress,
              readingTimeElapsed: sustainedDuration
            }

            this.onSustainedAttentionChange(sustainedAttention)
            this.lastBroadcastedElement = topCandidate.element
            history.lastEmittedProgress = readingProgress.readingProgress
            history.lastEmittedTime = now
          }
        }
      }
    }
  }

  private calculateConfidenceScore(
    candidate: AttentionCandidate,
    sustainedDuration: number
  ): number {
    let confidence = 0

    // 1. Sustained duration (0-40)
    const durationFactor = Math.min(
      40,
      (sustainedDuration / this.config.cognitiveAttentionThreshold) * 40
    )
    confidence += durationFactor

    // 2. Score quality (0-30)
    const scoreQuality = Math.min(30, (candidate.score / 115) * 30)
    confidence += scoreQuality

    // 3. Engagement signals (0-30)
    let engagementPoints = 0

    if (candidate.reasons.some((r) => r.includes("mouse-over-text"))) {
      engagementPoints += 15
    } else if (candidate.reasons.some((r) => r.includes("hover"))) {
      engagementPoints += 10
    } else if (candidate.reasons.some((r) => r.includes("proximity"))) {
      engagementPoints += 5
    }

    if (
      candidate.reasons.some(
        (r) => r.includes("slow-scroll") || r.includes("no-scroll")
      )
    ) {
      engagementPoints += 10
    }

    if (candidate.reasons.some((r) => r.includes("main-content"))) {
      engagementPoints += 5
    }

    confidence += Math.min(30, engagementPoints)

    return Math.round(Math.min(100, confidence))
  }

  private countWords(text: string): number {
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length
  }

  private calculateReadingProgress(
    text: string,
    durationMs: number
  ): {
    wordsRead: number
    totalWords: number
    readingProgress: number
  } {
    const totalWords = this.countWords(text)
    const minutesElapsed = durationMs / 60000
    const wordsRead = Math.min(
      Math.floor(minutesElapsed * this.config.wordsPerMinute),
      totalWords
    )
    const readingProgress =
      totalWords > 0 ? Math.min(100, (wordsRead / totalWords) * 100) : 0

    return { wordsRead, totalWords, readingProgress }
  }
}

export default CognitiveAttentionTextTracker
