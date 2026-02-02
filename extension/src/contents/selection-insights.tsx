import {
  CheckCheck,
  FileText,
  Languages,
  MessageSquarePlus,
  RefreshCw
} from "lucide-react"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState } from "react"

import { sendToBackground } from "@plasmohq/messaging"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false
}

export const getRootContainer = () => {
  const container = document.createElement("div")
  container.id = "kaizen-selection-insights"
  container.style.cssText = `
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 2147483646;
  `
  document.body.appendChild(container)
  return container
}

const CODE_TO_LANGUAGE = {
  en: "English",
  es: "Spanish",
  hi: "Hindi",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ru: "Russian",
  "zh-CN": "Chinese (Simplified)",
  "zh-TW": "Chinese (Traditional)",
  ja: "Japanese",
  ko: "Korean",
  ar: "Arabic",
  bn: "Bengali",
  id: "Indonesian",
  tr: "Turkish",
  vi: "Vietnamese",
  th: "Thai",
  nl: "Dutch",
  pl: "Polish"
}

type IntentAction = "proofread" | "translate" | "rephrase" | "summarize" | "chat"

const SelectionCard = () => {
  const [visible, setVisible] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [selectedText, setSelectedText] = useState("")
  const [hoveredButton, setHoveredButton] = useState<string | null>(null)
  const [lastSelectionText, setLastSelectionText] = useState("")
  const [showTranslateDropdown, setShowTranslateDropdown] = useState(false)

  useEffect(() => {
    console.log("[Kaizen Selection] Content script loaded and mounted")
    
    const handleSelection = () => {
      setTimeout(() => {
        const selection = window.getSelection()
        const text = selection?.toString().trim()

        if (text && text.length > 0 && text !== lastSelectionText) {
          const range = selection?.getRangeAt(0)
          const rect = range?.getBoundingClientRect()

          if (rect) {
            console.log("[Kaizen Selection] Text selected:", text.substring(0, 50))
            setPosition({
              x: rect.left + rect.width / 2,
              y: rect.top + window.scrollY - 10
            })
            setSelectedText(text)
            setLastSelectionText(text)
            setVisible(true)
          }
        } else if (!text) {
          setVisible(false)
          setLastSelectionText("")
          setShowTranslateDropdown(false)
        }
      }, 10)
    }

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest(".kaizen-selection-card")) {
        setVisible(false)
        setLastSelectionText("")
        setShowTranslateDropdown(false)
      }
    }

    document.addEventListener("mouseup", handleSelection)
    document.addEventListener("mousedown", handleClickOutside)

    return () => {
      document.removeEventListener("mouseup", handleSelection)
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [lastSelectionText])

  const handleAction = async (
    action: IntentAction,
    language?: keyof typeof CODE_TO_LANGUAGE
  ) => {
    console.log(`[Kaizen Selection] Action clicked: ${action}`)
    console.log(`[Kaizen Selection] Selected text: ${selectedText}`)

    setVisible(false)
    setLastSelectionText("")
    setShowTranslateDropdown(false)

    try {
      console.log(`[Kaizen Selection] Opening sidepanel first...`)
      const openResponse = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }, resolve)
      })
      console.log(`[Kaizen Selection] Sidepanel open response:`, openResponse)

      console.log(`[Kaizen Selection] Sending intent to background...`)
      const response = await sendToBackground({
        name: "intent",
        body: {
          type: action,
          text: selectedText,
          language: language
        }
      })
      console.log(`[Kaizen Selection] Intent response:`, response)
    } catch (error) {
      console.error(`[Kaizen Selection] Error:`, error)
    }
  }

  const handleTranslateClick = () => {
    setShowTranslateDropdown(!showTranslateDropdown)
  }

  const buttonStyle = (isHovered: boolean, isPrimary: boolean = false) => ({
    padding: "10px 16px",
    border: "none",
    borderRadius: "10px",
    backgroundColor: isPrimary
      ? isHovered
        ? "#2563eb"
        : "#3b82f6"
      : isHovered
        ? "#e5e7eb"
        : "#f9fafb",
    cursor: "pointer",
    fontWeight: 500,
    color: isPrimary ? "white" : "#374151",
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    fontSize: "12px",
    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
    boxShadow: isHovered
      ? "0 4px 12px rgba(0, 0, 0, 0.1)"
      : "0 1px 3px rgba(0, 0, 0, 0.05)",
    width: "100%",
    height: "100%"
  })

  return (
    <>
      <style>
        {`
          @keyframes slideUp {
            from {
              opacity: 0;
              transform: translate(-50%, calc(-100% - 8px));
            }
            to {
              opacity: 1;
              transform: translate(-50%, calc(-100% - 12px));
            }
          }
        `}
      </style>
      {visible && (
        <div
          className="kaizen-selection-card"
          onMouseDown={(e) => {
            e.stopPropagation()
          }}
          style={{
            position: "absolute",
            left: `${position.x}px`,
            top: `${position.y}px`,
            transform: "translate(-50%, calc(-100% - 12px))",
            zIndex: 2147483647,
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "10px",
            boxShadow:
              "0 10px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)",
            display: "flex",
            gap: "8px",
            fontFamily:
              "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
            backdropFilter: "blur(10px)",
            animation: "slideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
            pointerEvents: "auto"
          }}>
          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex"
            }}>
            <button
              onClick={() => handleAction("proofread")}
              onMouseEnter={() => setHoveredButton("proofread")}
              onMouseLeave={() => setHoveredButton(null)}
              style={buttonStyle(hoveredButton === "proofread")}>
              <CheckCheck size={18} strokeWidth={2.5} />
              <span>Proofread</span>
            </button>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex"
            }}>
            <button
              onClick={handleTranslateClick}
              onMouseEnter={() => setHoveredButton("translate")}
              onMouseLeave={() => setHoveredButton(null)}
              style={buttonStyle(hoveredButton === "translate")}>
              <Languages size={18} strokeWidth={2.5} />
              <span>Translate</span>
            </button>

            {showTranslateDropdown && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: "0",
                  backgroundColor: "white",
                  borderRadius: "12px",
                  padding: "8px",
                  boxShadow:
                    "0 10px 40px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.08)",
                  maxHeight: "300px",
                  overflowY: "auto",
                  minWidth: "200px",
                  zIndex: 2147483648
                }}>
                {Object.entries(CODE_TO_LANGUAGE).map(([code, name]) => (
                  <button
                    key={code}
                    onClick={() =>
                      handleAction(
                        "translate",
                        code as keyof typeof CODE_TO_LANGUAGE
                      )
                    }
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "10px 14px",
                      border: "none",
                      backgroundColor: "transparent",
                      textAlign: "left",
                      cursor: "pointer",
                      borderRadius: "8px",
                      fontSize: "14px",
                      color: "#374151",
                      transition: "background-color 0.15s"
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "#f3f4f6"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent"
                    }}>
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex"
            }}>
            <button
              onClick={() => handleAction("rephrase")}
              onMouseEnter={() => setHoveredButton("rephrase")}
              onMouseLeave={() => setHoveredButton(null)}
              style={buttonStyle(hoveredButton === "rephrase")}>
              <RefreshCw size={18} strokeWidth={2.5} />
              <span>Rephrase</span>
            </button>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex"
            }}>
            <button
              onClick={() => handleAction("summarize")}
              onMouseEnter={() => setHoveredButton("summarize")}
              onMouseLeave={() => setHoveredButton(null)}
              style={buttonStyle(hoveredButton === "summarize")}>
              <FileText size={18} strokeWidth={2.5} />
              <span>Summarize</span>
            </button>
          </div>

          <div
            style={{
              position: "relative",
              flex: 1,
              minWidth: 0,
              display: "flex"
            }}>
            <button
              onClick={() => handleAction("chat")}
              onMouseEnter={() => setHoveredButton("chat")}
              onMouseLeave={() => setHoveredButton(null)}
              style={buttonStyle(hoveredButton === "chat", true)}>
              <MessageSquarePlus size={18} strokeWidth={2.5} />
              <span>Chat</span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SelectionCard
