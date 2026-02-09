/// <reference types="chrome"/>
import { RuntimeLoader, useRive } from "@rive-app/react-canvas"
import { useEffect, useState } from "react"

// Use chrome.runtime.getURL for guaranteed correct extension asset paths.
// Must be set at module level before any useRive hook runs.
const wasmUrl = chrome.runtime.getURL("assets/rive.wasm")
const rivUrl = chrome.runtime.getURL("assets/8178-15744-focusforest.riv")
RuntimeLoader.setWasmUrl(wasmUrl)

interface TreeAnimationSectionProps {
  elapsedSeconds: number
  growthDurationMs: number
}

export function TreeAnimationSection({
  elapsedSeconds,
  growthDurationMs
}: TreeAnimationSectionProps) {
  const durationSeconds = growthDurationMs / 1000
  // Linear growth: 0s → 10 (seed visible), durationSeconds → 110 (max)
  const growthStage = Math.min(100, (elapsedSeconds / durationSeconds) * 100) + 10

  const [canvasSize] = useState(() => window.innerHeight)

  const { rive, RiveComponent } = useRive({
    src: rivUrl,
    autoplay: true,
    stateMachines: ["State Machine 1"]
  })

  // Update animation state based on growth stage
  useEffect(() => {
    if (!rive) return
    try {
      const names = rive.stateMachineNames
      if (names && names.length > 0) {
        const inputs = rive.stateMachineInputs(names[0])
        if (inputs) {
          const ctrl = inputs.find((i) => i.name === "input")
          if (ctrl) ctrl.value = growthStage
        }
      }
    } catch (e) {
      console.error("Rive input error:", e)
    }
  }, [rive, growthStage])

  return (
    <div
      className="absolute bottom-0 left-0 w-full h-full z-10 pointer-events-none"
      style={{ overflow: "visible" }}
    >
      {/* Positioning layer: translate + rotate (no animation here) */}
      <div
        className="absolute bottom-0 left-0 -translate-x-[40%] translate-y-4 rotate-6"
        style={{
          width: canvasSize,
          height: canvasSize,
        }}
      >
        {/* Animation layer: sway + visual filters (separate from positioning transform) */}
        <div
          className="w-full h-full opacity-80"
          style={{
            animation: "sway 8s ease-in-out infinite",
            filter: "hue-rotate(120deg)",
            transformOrigin: "bottom left",
          }}
        >
          <RiveComponent
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    </div>
  )
}
