import type { PlasmoCSConfig } from "plasmo"
import { useCallback, useEffect, useRef, useState } from "react"

import "./glow-overlay.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

export const getRootContainer = () => {
  const container = document.createElement("div")
  container.id = "kaizen-glow-root"
  container.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483647;
  `
  document.body.appendChild(container)
  return container
}

const animateNumber = (options: {
  startValue?: number
  endValue?: number
  duration?: number
  delay?: number
  onUpdate?: (value: number) => void
  ease?: (t: number) => number
  onStart?: () => void
  onEnd?: () => void
}) => {
  const {
    startValue = 0,
    endValue = 100,
    duration = 1000,
    delay = 0,
    onUpdate = () => {},
    ease = (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
    onStart = () => {},
    onEnd = () => {}
  } = options

  const startTime = performance.now() + delay

  function update() {
    const currentTime = performance.now()
    const elapsed = currentTime - startTime
    const t = Math.min(elapsed / duration, 1)
    const easedValue = startValue + (endValue - startValue) * ease(t)

    onUpdate(easedValue)

    if (t < 1) requestAnimationFrame(update)
    else onEnd()
  }

  setTimeout(() => {
    onStart()
    requestAnimationFrame(update)
  }, delay)
}

const GlowOverlay = () => {
  const [shouldRender, setShouldRender] = useState(true)
  const overlayRef = useRef<HTMLDivElement>(null)
  const animationPlayedRef = useRef(false)

  const playAnimation = useCallback(() => {
    const $overlay = overlayRef.current
    if (!$overlay || animationPlayedRef.current) return

    setTimeout(() => {
      $overlay.classList.add("animating")

      animateNumber({
        ease: (t) => t,
        duration: 2000,
        startValue: 0,
        endValue: 360,
        onUpdate: (v) => {
          $overlay.style.setProperty("--pointer-deg", `${v}deg`)
          $overlay.style.setProperty("--pointer-d", "100")
        },
        onEnd: () => {
          $overlay.classList.remove("animating")
          $overlay.classList.add("finished")
          animationPlayedRef.current = true

          setTimeout(() => {
            setShouldRender(false)
          }, 300)
        }
      })
    }, 300)
  }, [])

  useEffect(() => {
    const handleMessage = (message: { type: string }) => {
      if (message.type === "SIDEPANEL_OPENED" && !animationPlayedRef.current) {
        playAnimation()
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [playAnimation])

  if (!shouldRender) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      id="kaizen-glow-overlay"
      style={{
        // @ts-expect-error - CSS custom properties
        "--pointer-deg": "45deg",
        "--pointer-d": "100"
      }}>
      <span className="glow"></span>
    </div>
  )
}

export default GlowOverlay
