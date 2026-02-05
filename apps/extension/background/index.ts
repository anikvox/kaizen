import { Storage } from "@plasmohq/storage"
import { startSettingsSync, stopSettingsSync } from "./settings-sync"

const storage = new Storage()

// Track sidepanel connections per window
const sidepanelPorts = new Map<number, chrome.runtime.Port>()

// Update the action behavior based on auth state
async function updateActionBehavior() {
  const token = await storage.get<string>("deviceToken")

  if (token) {
    // User is logged in - disable popup so clicking opens sidepanel
    await chrome.action.setPopup({ popup: "" })
    // Start settings sync when logged in
    startSettingsSync()
  } else {
    // User is not logged in - enable popup for login
    await chrome.action.setPopup({ popup: "popup.html" })
    // Stop settings sync when logged out
    stopSettingsSync()
  }
}

// Close sidepanel by disabling and re-enabling it
async function closeSidepanel() {
  await chrome.sidePanel.setOptions({ enabled: false })
  await chrome.sidePanel.setOptions({ enabled: true, path: "sidepanel.html" })
}

// Handle extension icon click - toggle sidepanel when logged in
chrome.action.onClicked.addListener(async (tab) => {
  // This only fires when popup is disabled (user is logged in)
  if (!tab.id || !tab.windowId) return

  if (sidepanelPorts.has(tab.windowId)) {
    // Sidepanel is open - close it
    await closeSidepanel()
  } else {
    // Sidepanel is closed - open it
    await chrome.sidePanel.open({ tabId: tab.id })
  }
})

// Listen for sidepanel connections
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "sidepanel") {
    // Get the window ID from the sender
    chrome.windows.getCurrent().then((window) => {
      if (window.id) {
        sidepanelPorts.set(window.id, port)

        // Clean up when sidepanel disconnects (closes)
        port.onDisconnect.addListener(() => {
          if (window.id) {
            sidepanelPorts.delete(window.id)
          }
        })
      }
    })
  }
})

// Watch for storage changes to update behavior
storage.watch({
  deviceToken: async (change) => {
    await updateActionBehavior()

    // Close sidepanel when user logs out
    if (!change.newValue) {
      await closeSidepanel()
      sidepanelPorts.clear()
    }
  }
})

// Initialize on startup
updateActionBehavior()
