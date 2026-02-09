import { Check, X } from "lucide-react";
import type { PlasmoCSConfig } from "plasmo";
import { useState, useEffect, useCallback } from "react";
import { Storage } from "@plasmohq/storage";
import { sendToBackground } from "@plasmohq/messaging";
import type { AgentNudge } from "@kaizen/api-client";

import { ATTENTION_TRACKING_IGNORE_LIST } from "../cognitive-attention/default-settings";
import { shouldIgnoreUrlSync } from "../cognitive-attention/url-ignore-list";
import { AGENT_NUDGE_KEY } from "../background/settings-sync";

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  exclude_matches: [
    "http://localhost:60091/*"
  ],
  all_frames: false,
};

// Skip on the Kaizen web app itself
const kaizenWebUrl =
  process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091";
const isKaizenWebApp = location.href.startsWith(kaizenWebUrl);

const storage = new Storage();
const currentUrl = location.href;

interface StoredNudge extends AgentNudge {
  receivedAt: number;
}

function NudgeOverlay() {
  const [nudge, setNudge] = useState<StoredNudge | null>(null);
  const [visible, setVisible] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [isExiting, setIsExiting] = useState(false);
  const [hoveredButton, setHoveredButton] = useState<string | null>(null);

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

    storage.watch({
      [ATTENTION_TRACKING_IGNORE_LIST.key]: checkIgnoreList,
    });

    return () => {
      storage.unwatch({
        [ATTENTION_TRACKING_IGNORE_LIST.key]: checkIgnoreList,
      });
    };
  }, []);

  // Watch for nudge updates
  useEffect(() => {
    const checkForNudge = async () => {
      const storedNudge = await storage.get<StoredNudge | null>(AGENT_NUDGE_KEY);

      if (storedNudge && storedNudge.receivedAt) {
        // Only show nudge if it was received in the last 30 seconds
        const isRecent = Date.now() - storedNudge.receivedAt < 30000;

        if (isRecent && storedNudge.id !== nudge?.id) {
          setNudge(storedNudge);
          setVisible(true);
          setIsExiting(false);
        }
      }
    };

    checkForNudge();

    storage.watch({
      [AGENT_NUDGE_KEY]: checkForNudge,
    });

    return () => {
      storage.unwatch({
        [AGENT_NUDGE_KEY]: checkForNudge,
      });
    };
  }, [nudge?.id]);

  const hideOverlay = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      setVisible(false);
      setNudge(null);
      setIsExiting(false);
    }, 200);
  }, []);

  const handleResponse = useCallback(
    async (response: "acknowledged" | "false_positive") => {
      if (!nudge) return;

      hideOverlay();

      try {
        // Clear the nudge from storage
        await storage.remove(AGENT_NUDGE_KEY);

        // Send response to background to forward to API
        await sendToBackground({
          name: "nudge-response",
          body: {
            nudgeId: nudge.id,
            response,
          },
        });
      } catch (error) {
        console.error("[Kaizen] Error sending nudge response:", error);
      }
    },
    [nudge, hideOverlay]
  );

  // Auto-dismiss after 20 seconds
  useEffect(() => {
    if (visible && nudge) {
      const timer = setTimeout(() => {
        handleResponse("dismissed" as any);
      }, 20000);
      return () => clearTimeout(timer);
    }
  }, [visible, nudge, handleResponse]);

  // Don't render on Kaizen web app, if disabled by ignore list, not visible, or if it's an "all_clear" type
  // "all_clear" nudges are for Health tab visibility only, not popup notifications
  if (isKaizenWebApp || !isEnabled || !visible || !nudge || nudge.type === "all_clear") return null;

  const getNudgeColor = (type: string) => {
    switch (type) {
      case "doomscroll":
        return { bg: "#fef2f2", border: "#fecaca", icon: "#dc2626" };
      case "distraction":
        return { bg: "#fffbeb", border: "#fde68a", icon: "#d97706" };
      case "break":
        return { bg: "#f0fdf4", border: "#bbf7d0", icon: "#16a34a" };
      case "focus_drift":
        return { bg: "#fefce8", border: "#fef08a", icon: "#ca8a04" };
      case "encouragement":
        return { bg: "#eff6ff", border: "#bfdbfe", icon: "#2563eb" };
      case "all_clear":
        return { bg: "#ecfdf5", border: "#a7f3d0", icon: "#059669" };
      default:
        return { bg: "#f9fafb", border: "#e5e7eb", icon: "#6b7280" };
    }
  };

  const colors = getNudgeColor(nudge.type);

  const buttonStyle = (isHovered: boolean, isPrimary: boolean = false) => ({
    padding: "8px 16px",
    border: "none",
    borderRadius: "8px",
    backgroundColor: isPrimary
      ? isHovered
        ? "#16a34a"
        : "#22c55e"
      : isHovered
        ? "#e5e7eb"
        : "#f3f4f6",
    cursor: "pointer",
    fontWeight: 500,
    color: isPrimary ? "white" : "#374151",
    transition: "all 0.15s cubic-bezier(0.4, 0, 0.2, 1)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    fontSize: "13px",
    transform: isHovered ? "translateY(-1px)" : "translateY(0)",
    boxShadow: isHovered
      ? "0 4px 12px rgba(0, 0, 0, 0.1)"
      : "0 1px 3px rgba(0, 0, 0, 0.05)",
  });

  return (
    <div
      className="kaizen-nudge-overlay"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 2147483647,
        backgroundColor: colors.bg,
        borderRadius: "16px",
        padding: "16px 20px",
        boxShadow:
          "0 10px 40px rgba(0, 0, 0, 0.15), 0 0 0 1px " + colors.border,
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif",
        maxWidth: "360px",
        animation: isExiting
          ? "kaizenNudgeSlideOut 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards"
          : "kaizenNudgeSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
      }}>
      <style>
        {`
          @keyframes kaizenNudgeSlideIn {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
          @keyframes kaizenNudgeSlideOut {
            from {
              opacity: 1;
              transform: translateX(0);
            }
            to {
              opacity: 0;
              transform: translateX(20px);
            }
          }
        `}
      </style>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "10px",
            backgroundColor: colors.icon + "15",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}>
          <span style={{ fontSize: "18px" }}>
            {nudge.type === "doomscroll" && "🌀"}
            {nudge.type === "distraction" && "📱"}
            {nudge.type === "break" && "☕"}
            {nudge.type === "focus_drift" && "🎯"}
            {nudge.type === "encouragement" && "🌟"}
            {nudge.type === "all_clear" && "✅"}
          </span>
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: colors.icon,
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: "4px",
            }}>
            Kaizen
          </div>
          <div
            style={{
              fontSize: "14px",
              color: "#1f2937",
              lineHeight: "1.4",
            }}>
            {nudge.message}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: "8px", marginTop: "4px" }}>
        <button
          onClick={() => handleResponse("false_positive")}
          onMouseEnter={() => setHoveredButton("false_positive")}
          onMouseLeave={() => setHoveredButton(null)}
          style={buttonStyle(hoveredButton === "false_positive")}>
          <X size={16} strokeWidth={2.5} />
          <span>Not helpful</span>
        </button>

        <button
          onClick={() => handleResponse("acknowledged")}
          onMouseEnter={() => setHoveredButton("acknowledged")}
          onMouseLeave={() => setHoveredButton(null)}
          style={buttonStyle(hoveredButton === "acknowledged", true)}>
          <Check size={16} strokeWidth={2.5} />
          <span>Got it!</span>
        </button>
      </div>
    </div>
  );
}

export default NudgeOverlay;
