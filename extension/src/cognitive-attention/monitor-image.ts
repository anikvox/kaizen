import { IMAGE_HOVER_THRESHOLD, UPDATE_INTERVAL } from "./constants"
import { CognitiveAttentionImageUI } from "./ui"

type ImageConfig = {
  showOverlay: boolean // Show yellow border with progress
  onSustainedImageAttention?: (attention: SustainedImageAttention) => void
}

type SustainedImageAttention = {
  src: string
  alt: string
  title: string
  width: number
  height: number
  hoverDuration: number
  base64: string | null
  mimeType: string
  confidence: number // 0-100
  imageElement: HTMLImageElement
}

type ImageTrackerState = {
  mousePosition: { x: number; y: number }
  hoveredImage: HTMLImageElement | null
  imageHoverStartTime: number | null
  lastEmittedImage: string | null
}

class CognitiveAttentionImageTracker {
  public config: Omit<ImageConfig, "onSustainedImageAttention"> & {
    showOverlay: boolean
  }
  private onSustainedImageAttention?: (
    attention: SustainedImageAttention
  ) => void
  private state: ImageTrackerState
  private trackingInterval?: ReturnType<typeof setInterval>
  private imageUI: CognitiveAttentionImageUI

  constructor(config?: Partial<ImageConfig>) {
    this.onSustainedImageAttention = config?.onSustainedImageAttention

    this.config = {
      showOverlay: config?.showOverlay || false
    }

    this.state = {
      mousePosition: { x: 0, y: 0 },
      hoveredImage: null,
      imageHoverStartTime: null,
      lastEmittedImage: null
    }

    this.imageUI = new CognitiveAttentionImageUI({
      showOverlay: this.config.showOverlay
    })
  }

  init(): void {
    this.setupEventListeners()

    this.trackingInterval = setInterval(async () => {
      await this.checkImageHover()
    }, UPDATE_INTERVAL)
  }

  destroy(): void {
    if (this.trackingInterval) clearInterval(this.trackingInterval)

    document.removeEventListener("mousemove", this.onMouseMove)

    this.imageUI.destroy()
  }

  updateConfig(newConfig: Partial<ImageConfig>): void {
    if (newConfig.showOverlay !== undefined) {
      this.config.showOverlay = newConfig.showOverlay
    }
    if (newConfig.onSustainedImageAttention !== undefined) {
      this.onSustainedImageAttention = newConfig.onSustainedImageAttention
    }

    this.imageUI.updateConfig({
      showOverlay: this.config.showOverlay
    })
  }

  // Private methods
  private setupEventListeners(): void {
    document.addEventListener("mousemove", this.onMouseMove)
  }

  private onMouseMove = (e: MouseEvent): void => {
    this.state.mousePosition = { x: e.clientX, y: e.clientY }
  }

  private async checkImageHover(): Promise<void> {
    const hoveredElement = document.elementFromPoint(
      this.state.mousePosition.x,
      this.state.mousePosition.y
    )

    let imageElement: HTMLImageElement | null = null
    if (hoveredElement instanceof HTMLImageElement) {
      imageElement = hoveredElement
    } else if (hoveredElement) {
      const parentImg = hoveredElement.closest("img")
      if (parentImg instanceof HTMLImageElement) {
        imageElement = parentImg
      }
    }

    // Check if we have a valid loaded image
    if (
      imageElement &&
      imageElement.complete &&
      imageElement.naturalWidth > 0
    ) {
      if (this.state.hoveredImage !== imageElement) {
        // New image hovered
        this.state.hoveredImage = imageElement
        this.state.imageHoverStartTime = Date.now()
        this.imageUI.showHighlight(imageElement, 0)
      } else {
        // Continue hovering same image
        const hoverDuration = Date.now() - (this.state.imageHoverStartTime || 0)
        const progress = Math.min(
          100,
          (hoverDuration / IMAGE_HOVER_THRESHOLD) * 100
        )

        this.imageUI.updateProgress(imageElement, progress)

        // Emit callback if threshold met and not already emitted for this image
        if (
          hoverDuration >= IMAGE_HOVER_THRESHOLD &&
          this.state.lastEmittedImage !== imageElement.src &&
          this.onSustainedImageAttention
        ) {
          this.state.lastEmittedImage = imageElement.src

          const confidence = this.calculateConfidence(
            imageElement,
            hoverDuration
          )

          const attention: SustainedImageAttention = {
            src: imageElement.src,
            alt: getImageDescription(imageElement),
            title: imageElement.title || "",
            width: imageElement.naturalWidth,
            height: imageElement.naturalHeight,
            base64: await imageToBase64(imageElement),
            mimeType: await getMimeType(imageElement),
            hoverDuration,
            confidence,
            imageElement
          }

          this.onSustainedImageAttention(attention)
        }
      }
    } else {
      // No image hovered or moved away
      if (this.state.hoveredImage) {
        this.state.hoveredImage = null
        this.state.imageHoverStartTime = null
        this.imageUI.hideHighlight()
      }
    }
  }

  private calculateConfidence(
    image: HTMLImageElement,
    hoverDuration: number
  ): number {
    let confidence = 0

    // 1. Duration factor (0-50 points)
    const durationFactor = Math.min(
      50,
      (hoverDuration / IMAGE_HOVER_THRESHOLD) * 50
    )
    confidence += durationFactor

    // 2. Image size factor (0-30 points) - larger images get more confidence
    const area = image.naturalWidth * image.naturalHeight
    const sizeFactor = Math.min(30, (area / 1000000) * 30) // Normalize to ~1MP
    confidence += sizeFactor

    // 3. Viewport coverage (0-20 points)
    const bounds = image.getBoundingClientRect()
    const viewportArea = window.innerWidth * window.innerHeight
    const imageArea = bounds.width * bounds.height
    const coverageFactor = Math.min(20, (imageArea / viewportArea) * 100)
    confidence += coverageFactor

    return Math.round(Math.min(100, confidence))
  }
}

export default CognitiveAttentionImageTracker
export type { SustainedImageAttention, ImageConfig }

const imageToBase64 = async (img: HTMLImageElement): Promise<string | null> => {
  try {
    const res = await fetch(img.src, { mode: "cors" })
    const blob = await res.blob()
    const reader = new FileReader()
    return await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.error("Failed to convert image to base64:", err)
    return null
  }
}

const getMimeType = async (img: HTMLImageElement): Promise<string | null> => {
  try {
    const res = await fetch(img.src, { method: "HEAD", mode: "cors" })
    return res.headers.get("Content-Type")
  } catch {
    return null
  }
}

const getImageDescription = (imageElement: HTMLImageElement) => {
  if (imageElement.tagName === "IMG") {
    const altText = imageElement.getAttribute("alt")
    if (altText && altText.trim() !== "") {
      return altText.trim()
    }
  }

  const figure = imageElement.closest("figure")
  if (figure) {
    const figcaption = figure.querySelector("figcaption")
    if (figcaption) {
      return figcaption.innerText.trim()
    }
  }

  if (imageElement.tagName === "FIGURE") {
    const figcaption = imageElement.querySelector("figcaption")
    if (figcaption) {
      return figcaption.innerText.trim()
    }
  }

  return ""
}
