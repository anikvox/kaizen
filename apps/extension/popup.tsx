import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"
import { Logo } from "@kaizen/ui"
import { Link2, ArrowRight, Loader2 } from "lucide-react"
import "./styles.css"

const webUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"
const logoUrl = chrome.runtime.getURL("assets/kaizen-logo.png")

const storage = new Storage()

function IndexPopup() {
  const [loading, setLoading] = useState(true)
  const [linkWindow, setLinkWindow] = useState<Window | null>(null)
  const [error, setError] = useState("")
  const [hovering, setHovering] = useState(false)
  const [isDark, setIsDark] = useState(false)

  // Sync theme from storage
  useEffect(() => {
    const syncTheme = async () => {
      const theme = await storage.get<string>("themeMode")
      const dark = theme === "dark"
      setIsDark(dark)
      document.documentElement.classList.toggle("dark", dark)
    }
    syncTheme()
    storage.watch({ themeMode: (c) => {
      const dark = c.newValue === "dark"
      setIsDark(dark)
      document.documentElement.classList.toggle("dark", dark)
    }})
  }, [])

  // Check for existing token on load
  useEffect(() => {
    const checkAuth = async () => {
      const token = await storage.get<string>("deviceToken")
      if (token) {
        // User has a token, close popup - sidepanel will verify via SSE
        window.close()
        return
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  // Listen for token from link window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "KAIZEN_DEVICE_TOKEN" && event.data?.token) {
        const token = event.data.token
        await storage.set("deviceToken", token)
        if (linkWindow) {
          linkWindow.close()
          setLinkWindow(null)
          // Give background script time to process storage change and update action behavior
          await new Promise(resolve => setTimeout(resolve, 100))
          // Close popup after successful link
          window.close()
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [linkWindow])

  const handleLinkExtension = () => {
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      `${webUrl}/link-extension`,
      "kaizen-link",
      `width=${width},height=${height},left=${left},top=${top}`
    )
    setLinkWindow(popup)
  }

  if (loading) {
    return (
      <div className="relative min-w-[320px] overflow-hidden p-6 bg-background">
        <div className="flex items-center gap-3">
          <Logo size="sm" src={logoUrl} />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">Loading...</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative min-w-[320px] overflow-hidden"
      style={{
        background: isDark
          ? "linear-gradient(135deg, rgba(10,15,30,0.95) 0%, rgba(15,20,40,0.9) 100%)"
          : "linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(240,245,255,0.9) 100%)",
        backdropFilter: "blur(20px) saturate(1.8)",
        WebkitBackdropFilter: "blur(20px) saturate(1.8)",
      }}
    >
      {/* Decorative gradient orbs */}
      <div
        className="pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(160 84% 39% / 0.4), transparent 70%)",
          opacity: isDark ? 0.2 : 0.3,
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-8 -left-8 h-24 w-24 rounded-full"
        style={{
          background: "radial-gradient(circle, hsl(217 91% 60% / 0.4), transparent 70%)",
          opacity: isDark ? 0.15 : 0.2,
        }}
      />

      <div className="relative z-10 p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl"
            style={{
              background: isDark
                ? "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))"
                : "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3))",
              boxShadow: isDark
                ? "inset 0 1px 1px rgba(255,255,255,0.06), 0 1px 3px rgba(0,0,0,0.3)"
                : "inset 0 1px 1px rgba(255,255,255,0.8), 0 1px 3px rgba(0,0,0,0.06)",
              border: isDark
                ? "1px solid rgba(255,255,255,0.08)"
                : "1px solid rgba(255,255,255,0.5)",
            }}
          >
            <img
              src={logoUrl}
              alt="Kaizen"
              className="w-6 h-6 object-contain"
            />
          </div>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-foreground leading-none mb-0.5">
              Kaizen
            </h1>
            <p className="text-[11px] text-muted-foreground leading-none">
              Focus & Wellness Companion
            </p>
          </div>
        </div>

        {/* Divider */}
        <div
          className="mb-4 h-px"
          style={{
            background: isDark
              ? "linear-gradient(to right, transparent, rgba(255,255,255,0.06) 20%, rgba(255,255,255,0.06) 80%, transparent)"
              : "linear-gradient(to right, transparent, rgba(0,0,0,0.08) 20%, rgba(0,0,0,0.08) 80%, transparent)",
          }}
        />

        {/* Content */}
        <div
          className="rounded-xl p-4 mb-4"
          style={{
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.5)",
            boxShadow: isDark
              ? "inset 0 1px 1px rgba(255,255,255,0.04), 0 1px 2px rgba(0,0,0,0.2)"
              : "inset 0 1px 1px rgba(255,255,255,0.7), 0 1px 2px rgba(0,0,0,0.04)",
            border: isDark
              ? "1px solid rgba(255,255,255,0.06)"
              : "1px solid rgba(255,255,255,0.6)",
          }}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              <Link2 className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-[13px] leading-relaxed text-foreground/80">
              Link this extension to your Kaizen account to enable focus tracking and wellness features.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-3 rounded-lg px-3 py-2 text-[12px] font-medium text-destructive"
            style={{
              background: isDark ? "rgba(239,68,68,0.12)" : "rgba(239,68,68,0.08)",
              border: isDark ? "1px solid rgba(239,68,68,0.2)" : "1px solid rgba(239,68,68,0.15)",
            }}
          >
            {error}
          </div>
        )}

        {/* CTA Button */}
        <button
          onClick={handleLinkExtension}
          onMouseEnter={() => setHovering(true)}
          onMouseLeave={() => setHovering(false)}
          className="w-full group relative overflow-hidden rounded-xl px-4 py-2.5 text-[13px] font-semibold text-white transition-all duration-300"
          style={{
            background: "linear-gradient(135deg, hsl(160 84% 39%) 0%, hsl(160 84% 33%) 100%)",
            boxShadow: hovering
              ? "0 4px 16px rgba(16,185,129,0.35), inset 0 1px 1px rgba(255,255,255,0.2)"
              : "0 2px 8px rgba(16,185,129,0.2), inset 0 1px 1px rgba(255,255,255,0.15)",
          }}
        >
          <span className="relative z-10 flex items-center justify-center gap-2">
            Link Extension
            <ArrowRight
              className="w-3.5 h-3.5 transition-transform duration-300"
              style={{ transform: hovering ? "translateX(2px)" : "translateX(0)" }}
            />
          </span>
        </button>

        {/* Footer hint */}
        <p className="mt-3 text-center text-[10px] text-muted-foreground/60">
          You'll be redirected to sign in
        </p>
      </div>
    </div>
  )
}

export default IndexPopup
