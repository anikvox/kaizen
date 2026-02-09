import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"
import { startSettingsSync, stopSettingsSync } from "./settings-sync"

const storage = new Storage()

// API client for active tab syncing
const getApiClient = () => {
  // @ts-expect-error - PLASMO_PUBLIC_ env vars are injected at build time
  const baseUrl = (typeof PLASMO_PUBLIC_KAIZEN_API_URL !== "undefined" ? PLASMO_PUBLIC_KAIZEN_API_URL : "http://localhost:60092") as string
  return createApiClient(baseUrl, async () => {
    return (await storage.get<string>("deviceToken")) ?? null
  })
}

// Debounce timer for active tab sync
let activeTabSyncTimer: ReturnType<typeof setTimeout> | null = null
let lastSyncedTabId: number | null = null
let lastSyncedUrl: string | null = null

// Sync current active tab to backend
async function syncActiveTab() {
  const token = await storage.get<string>("deviceToken")
  if (!token) return

  // Check if tracking is enabled (default to true)
  const trackingEnabled = await storage.get<boolean>("trackingEnabled")
  if (trackingEnabled === false) return

  try {
    // Get the currently active tab in the focused window
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    // Skip if no tab, or it's a chrome:// or extension page
    if (!tab || !tab.url || tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) {
      // If switching away from a regular tab, sync null
      if (lastSyncedUrl !== null) {
        const api = getApiClient()
        await api.attention.activeTab({
          url: null,
          title: null,
          timestamp: Date.now()
        })
        lastSyncedUrl = null
        lastSyncedTabId = null
      }
      return
    }

    // Skip if same tab and URL (avoid duplicate syncs)
    if (tab.id === lastSyncedTabId && tab.url === lastSyncedUrl) {
      return
    }

    const api = getApiClient()
    await api.attention.activeTab({
      url: tab.url,
      title: tab.title || null,
      timestamp: Date.now()
    })

    lastSyncedTabId = tab.id ?? null
    lastSyncedUrl = tab.url
  } catch (error) {
    console.error("[active-tab] Failed to sync:", error)
  }
}

// Debounced sync to avoid rapid updates
function debouncedSyncActiveTab() {
  if (activeTabSyncTimer) {
    clearTimeout(activeTabSyncTimer)
  }
  activeTabSyncTimer = setTimeout(syncActiveTab, 300)
}

// Start listening for tab changes
function startActiveTabTracking() {
  // Tab activated (user switches tabs)
  chrome.tabs.onActivated.addListener(debouncedSyncActiveTab)

  // Tab updated (URL or title change)
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.url || changeInfo.title) {
      // Only sync if this is the active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id === tabId) {
          debouncedSyncActiveTab()
        }
      })
    }
  })

  // Window focus changed
  chrome.windows.onFocusChanged.addListener((windowId) => {
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      // Browser lost focus - sync null
      if (lastSyncedUrl !== null) {
        storage.get<string>("deviceToken").then((token) => {
          if (token) {
            const api = getApiClient()
            api.attention.activeTab({
              url: null,
              title: null,
              timestamp: Date.now()
            }).catch(console.error)
            lastSyncedUrl = null
            lastSyncedTabId = null
          }
        })
      }
    } else {
      debouncedSyncActiveTab()
    }
  })

  // Initial sync
  syncActiveTab()
}

function stopActiveTabTracking() {
  if (activeTabSyncTimer) {
    clearTimeout(activeTabSyncTimer)
    activeTabSyncTimer = null
  }
  lastSyncedTabId = null
  lastSyncedUrl = null
}

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
    // Start active tab tracking
    startActiveTabTracking()
  } else {
    // User is not logged in - enable popup for login
    await chrome.action.setPopup({ popup: "popup.html" })
    // Stop settings sync when logged out
    stopSettingsSync()
    // Stop active tab tracking
    stopActiveTabTracking()
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
    // Notify the active tab's content scripts so glow overlay can play
    chrome.tabs.sendMessage(tab.id, { type: "SIDEPANEL_OPENED" }).catch(() => {})
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
