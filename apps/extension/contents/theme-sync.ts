import type { PlasmoCSConfig } from "plasmo"
import { Storage } from "@plasmohq/storage"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_idle"
}

// Only run on the Kaizen web app
const kaizenWebUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"
if (!window.location.href.startsWith(kaizenWebUrl)) {
  // Not on Kaizen web app — exit early
} else {
  const storage = new Storage()
  const THEME_KEY = "themeMode"

  // Sync current theme from DOM to extension storage
  function syncTheme() {
    const isDark = document.documentElement.classList.contains("dark")
    storage.set(THEME_KEY, isDark ? "dark" : "light")
  }

  // Initial sync
  syncTheme()

  // Watch for class changes on <html> to detect theme toggles
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "class") {
        syncTheme()
      }
    }
  })

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  })
}
