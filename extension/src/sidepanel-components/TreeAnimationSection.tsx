/// <reference types="chrome"/>
import { RuntimeLoader, useRive } from "@rive-app/react-webgl2"
import { useEffect, useState } from "react"

import { getTreeGrowthStage } from "~sidepanel-utils/tree"

interface TreeAnimationSectionProps {
  totalFocusTime: number // milliseconds
}

export function TreeAnimationSection({
  totalFocusTime
}: TreeAnimationSectionProps) {
  const growthStage = getTreeGrowthStage(totalFocusTime)
  const [runtimeLoaded, setRuntimeLoaded] = useState(false)

  // Configure Rive to use local WASM files from extension
  useEffect(() => {
    RuntimeLoader.setWasmUrl("/assets/rive.wasm")
    // RuntimeLoader.setWasmUrl("rive-wasm/rive_fallback.wasm");

    RuntimeLoader.getInstance(() => {
      console.log("Rive runtime loaded successfully")
      setRuntimeLoaded(true)
    })
  }, [])

  const { rive, setCanvasRef } = useRive(
    {
      src: "/assets/8178-15744-focusforest.riv",
      autoplay: true,
      stateMachines: ["State Machine 1"]
    },
    {
      fitCanvasToArtboardHeight: false,
      useOffscreenRenderer: true,
      shouldResizeCanvasToContainer: true,
      useDevicePixelRatio: true,
      shouldUseIntersectionObserver: false
    }
  )

  // Update animation state based on growth stage
  useEffect(() => {
    if (!rive) return

    try {
      const stateMachineNames = rive.stateMachineNames

      if (stateMachineNames && stateMachineNames.length > 0) {
        const inputs = rive.stateMachineInputs(stateMachineNames[0])

        if (inputs && inputs.length > 0) {
          // Find the input named "input"
          const inputControl = inputs.find((input) => input.name === "input")

          if (inputControl) {
            // Map growth stage (0-1) to integer value (0-3 for seed/sapling/growing/mature)
            inputControl.value = growthStage
          }
        }
      }
    } catch (error) {
      console.error("Error updating Rive animation:", error)
    }
  }, [rive, growthStage])



  const [layoutHeight] = useState(window.innerHeight)


  if (!runtimeLoaded) {
    return (
      <div className="absolute inset-0 flex items-center justify-center text-white/50">
        Loading...
      </div>
    )
  }

  return (
    <>
      <div
        className="absolute bottom-0 w-full h-full left-0 z-10 opacity-80"
        style={{
          animation: "sway 8s ease-in-out infinite",
          filter: "hue-rotate(120deg)",
          transform: "rotate(8deg)",
          transformOrigin: "bottom left",
        }}
      >
        <canvas width={layoutHeight} height={layoutHeight} className="-translate-x-[40%] translate-y-4 rotate-6" ref={setCanvasRef} />
      </div>
      <style>{`
        @keyframes sway {
          0%, 100% {
            transform: translateX(0) rotate(0deg);
          }
          25% {
            transform: translateX(-3px) rotate(-0.5deg);
          }
          75% {
            transform: translateX(3px) rotate(0.5deg);
          }
        }
      `}</style>
    </>
  )
}
