/**
 * Content script that bridges theme changes from the frontend website to the extension
 * This runs on localhost:60091 and listens for theme changes, then forwards them to the extension
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["http://localhost:60091/*", "https://*.kaizen.app/*"],
  all_frames: false
}

const THEME_STORAGE_KEY = "kaizen_theme_preference";

// Listen for messages from the web page
window.addEventListener("message", async (event) => {
  // Only accept messages from same origin
  if (event.origin !== window.location.origin) return;

  if (event.data.type === "KAIZEN_THEME_CHANGE") {
    const theme = event.data.theme;
    console.log("[Theme Bridge] Received theme change from page:", theme);

    try {
      // Store in chrome.storage so extension can access it
      await chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
      console.log("[Theme Bridge] Theme saved to chrome.storage:", theme);
    } catch (error) {
      console.error("[Theme Bridge] Error saving theme:", error);
    }
  }
});

// On load, check if there's a stored theme and notify the page
(async () => {
  try {
    const result = await chrome.storage.local.get(THEME_STORAGE_KEY);
    if (result[THEME_STORAGE_KEY]) {
      console.log("[Theme Bridge] Initial theme from storage:", result[THEME_STORAGE_KEY]);
      // Notify the page of the stored theme
      window.postMessage({
        type: "KAIZEN_THEME_INIT",
        theme: result[THEME_STORAGE_KEY]
      }, window.location.origin);
    }
  } catch (error) {
    console.error("[Theme Bridge] Error reading initial theme:", error);
  }
})();

console.log("[Theme Bridge] Content script loaded on", window.location.href);
