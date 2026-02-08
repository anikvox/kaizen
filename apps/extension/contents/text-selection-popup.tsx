import {
  CheckCheck,
  FileText,
  Languages,
  MessageSquarePlus,
  RefreshCw,
} from "lucide-react";
import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect } from "react";
import { Storage } from "@plasmohq/storage";
import { sendToBackground } from "@plasmohq/messaging";

import { ATTENTION_TRACKING_IGNORE_LIST } from "../cognitive-attention/default-settings";
import { shouldIgnoreUrlSync } from "../cognitive-attention/url-ignore-list";

// Types for text selection actions
type TextSelectionAction = "summarize" | "proofread" | "translate" | "rephrase" | "add_to_chat";

type TextSelectionResponse = {
  success: boolean;
  error?: string;
};

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: false,
};

// Skip on the Kaizen web app itself
const kaizenWebUrl =
  process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091";
const isKaizenWebApp = location.href.startsWith(kaizenWebUrl);

const storage = new Storage();
const currentUrl = location.href;

function SelectionCard() {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [selectedText, setSelectedText] = useState("");
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);
  const [lastSelectionText, setLastSelectionText] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);

  // Check ignore list on mount and watch for changes
  useEffect(() => {
    const checkIgnoreList = async () => {
      const ignoreList = await storage.get<string | null>(
        ATTENTION_TRACKING_IGNORE_LIST.key
      );
      const shouldIgnore = shouldIgnoreUrlSync(currentUrl, ignoreList);
      setIsEnabled(!shouldIgnore);
    };

    checkIgnoreList();

    // Watch for changes to the ignore list
    storage.watch({
      [ATTENTION_TRACKING_IGNORE_LIST.key]: checkIgnoreList,
    });

    return () => {
      storage.unwatch({
        [ATTENTION_TRACKING_IGNORE_LIST.key]: checkIgnoreList,
      });
    };
  }, []);

  useEffect(() => {
    const handleSelection = () => {
      // Small delay to ensure selection has been updated
      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();

        // Only show if there's new text selected and it's different from before
        if (text && text.length > 0 && text !== lastSelectionText) {
          const range = selection?.getRangeAt(0);
          const rect = range?.getBoundingClientRect();

          if (rect) {
            setPosition({
              x: rect.left + rect.width / 2,
              y: rect.top + window.scrollY - 10,
            });
            setSelectedText(text);
            setLastSelectionText(text);
            setVisible(true);
          }
        } else if (!text) {
          // Only hide if there's no selection and card is visible
          setVisible(false);
          setLastSelectionText("");
        }
      }, 10);
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Check if click is outside the card AND not on a button inside the card
      if (!target.closest(".kaizen-selection-card")) {
        setVisible(false);
        setLastSelectionText("");
      }
    };

    document.addEventListener("mouseup", handleSelection);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mouseup", handleSelection);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [lastSelectionText]);

  const handleAction = async (action: TextSelectionAction) => {
    console.log(`[Kaizen] Text selection action: ${action}`, {
      textLength: selectedText.length,
    });

    setVisible(false);
    setLastSelectionText("");

    try {
      // Send to background to open sidepanel and process
      const response = await sendToBackground<
        { action: TextSelectionAction; text: string },
        TextSelectionResponse
      >({
        name: "text-selection-action",
        body: {
          action,
          text: selectedText,
        },
      });

      if (!response?.success) {
        console.error("[Kaizen] Failed to process text selection:", response?.error);
      }
    } catch (error) {
      console.error("[Kaizen] Error sending to background:", error);
    }
  };

  // Don't render on Kaizen web app, if disabled by ignore list, or if not visible
  if (isKaizenWebApp || !isEnabled || !visible) return null;

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
    height: "100%",
  });

  return (
    <div
      className="kaizen-selection-card"
      onMouseDown={(e) => {
        // Prevent the mousedown event from bubbling to document
        e.stopPropagation();
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
        animation: "kaizenSlideUp 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
      <style>
        {`
          @keyframes kaizenSlideUp {
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

      <div
        style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
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
        style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
        <button
          onClick={() => handleAction("translate")}
          onMouseEnter={() => setHoveredButton("translate")}
          onMouseLeave={() => setHoveredButton(null)}
          style={buttonStyle(hoveredButton === "translate")}>
          <Languages size={18} strokeWidth={2.5} />
          <span>Translate</span>
        </button>
      </div>

      <div
        style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
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
        style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
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
        style={{ position: "relative", flex: 1, minWidth: 0, display: "flex" }}>
        <button
          onClick={() => handleAction("add_to_chat")}
          onMouseEnter={() => setHoveredButton("chat")}
          onMouseLeave={() => setHoveredButton(null)}
          style={buttonStyle(hoveredButton === "chat", true)}>
          <MessageSquarePlus size={18} strokeWidth={2.5} />
          <span>Chat</span>
        </button>
      </div>
    </div>
  );
}

export default SelectionCard;
