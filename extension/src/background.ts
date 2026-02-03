import {
  ApiClient,
  ActivityService,
  createAuthProvider,
  type TextActivityPayload,
  type ImageActivityPayload,
  type AudioActivityPayload,
  type WebsiteVisitPayload
} from "@kaizen/api"

console.log("Kaizen background script initialized")

// Storage key for device token (set by popup when user links account)
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const SERVER_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

// =============================================================================
// AUTH & API SETUP
// =============================================================================

/**
 * Auth provider that retrieves device token from Chrome storage.
 */
const extensionAuthProvider = createAuthProvider(async () => {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch (error) {
    console.error("Error getting device token:", error)
    return null
  }
})

/**
 * API client for activity tracking (uses /api prefix)
 */
const apiClient = new ApiClient({
  baseUrl: `${SERVER_URL}/api`,
  authProvider: extensionAuthProvider
})

const activityService = new ActivityService(apiClient)

// =============================================================================
// AUTHENTICATION HELPERS
// =============================================================================

async function isAuthenticated(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return !!result[DEVICE_TOKEN_KEY]
  } catch {
    return false
  }
}

async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch (error) {
    console.error("Error getting device token:", error)
    return null
  }
}

// =============================================================================
// SIDE PANEL MANAGEMENT
// =============================================================================

const SIDE_PANEL_PATH = "sidepanel.html"

async function updateActionBehavior() {
  const authenticated = await isAuthenticated()

  if (authenticated) {
    await chrome.action.setPopup({ popup: "" })

    if (chrome.sidePanel) {
      try {
        await chrome.sidePanel.setOptions({
          path: SIDE_PANEL_PATH,
          enabled: true
        })
        if (chrome.sidePanel.setPanelBehavior) {
          await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        }
        console.log("Side panel configured successfully")
      } catch (error) {
        console.error("Error setting up side panel:", error)
      }
    }
    console.log("User authenticated - sidepanel mode enabled")
  } else {
    await chrome.action.setPopup({ popup: "popup.html" })

    if (chrome.sidePanel?.setPanelBehavior) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      } catch (error) {
        console.error("Error disabling side panel behavior:", error)
      }
    }
    console.log("User not authenticated - popup mode enabled")
  }
}

// Handle extension icon click
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      if (chrome.sidePanel) {
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          path: SIDE_PANEL_PATH,
          enabled: true
        })
        if (tab.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId })
        } else {
          await chrome.sidePanel.open({ tabId: tab.id })
        }
        console.log("Side panel opened via action click")

        setTimeout(() => {
          chrome.tabs.sendMessage(tab.id!, { type: "SIDEPANEL_OPENED" }).catch((error) => {
            console.log("Content script not ready yet:", error)
          })
        }, 100)
      } else {
        console.warn("sidePanel API not available, falling back to popup")
        await chrome.action.setPopup({ popup: "popup.html" })
      }
    } catch (error) {
      console.error("Error opening side panel:", error)
      await chrome.action.setPopup({ popup: "popup.html" })
    }
  }
})

// Initialize on install/update and startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed/updated - initializing action behavior")
  updateActionBehavior()
})

chrome.runtime.onStartup.addListener(() => {
  console.log("Browser started - initializing action behavior")
  updateActionBehavior()
})

updateActionBehavior()

chrome.storage.local.onChanged.addListener((changes) => {
  if (changes[DEVICE_TOKEN_KEY]) {
    console.log("Device token changed - updating action behavior")
    updateActionBehavior()
  }
})

// =============================================================================
// MESSAGE HANDLING
// =============================================================================

const COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME = "cognitive-attention-text"
const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"
const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"
const WEBSITE_VISIT_MESSAGE_NAME = "website-visit"

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Handle sidepanel mounted notification
  if (message.type === "SIDEPANEL_MOUNTED") {
    console.log("[Background] Sidepanel mounted, broadcasting to active tab")
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "SIDEPANEL_OPENED" }).catch((error) => {
          console.log("[Background] Content script not ready:", error)
        })
      }
    })
    sendResponse({ success: true })
    return true
  }

  // Handle device token messages from popup
  if (message.type === "SET_AUTH_TOKEN") {
    chrome.storage.local.set({ [DEVICE_TOKEN_KEY]: message.token })
    console.log("Device token updated")
    sendResponse({ success: true })
    return true
  }
  if (message.type === "CLEAR_AUTH_TOKEN") {
    chrome.storage.local.remove(DEVICE_TOKEN_KEY)
    console.log("Device token cleared")
    sendResponse({ success: true })
    return true
  }
  if (message.type === "AUTH_STATE_CHANGED") {
    updateActionBehavior()
    sendResponse({ success: true })
    return true
  }
  if (message.type === "OPEN_SIDEPANEL") {
    ;(async () => {
      try {
        await updateActionBehavior()

        const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
        if (tabs[0]?.id && chrome.sidePanel) {
          await chrome.sidePanel.setOptions({
            tabId: tabs[0].id,
            path: SIDE_PANEL_PATH,
            enabled: true
          })
          const windowId = tabs[0].windowId
          if (windowId) {
            await chrome.sidePanel.open({ windowId })
          } else {
            await chrome.sidePanel.open({ tabId: tabs[0].id })
          }
          console.log("Side panel opened via OPEN_SIDEPANEL message")

          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id!, { type: "SIDEPANEL_OPENED" }).catch((error) => {
              console.log("Content script not ready yet:", error)
            })
          }, 100)

          await new Promise((resolve) => setTimeout(resolve, 150))
          sendResponse({ success: true, opened: true })
        } else {
          console.warn("No active tab or sidePanel API not available")
          sendResponse({ success: false, opened: false })
        }
      } catch (error) {
        console.error("Error opening side panel:", error)
        sendResponse({ success: false, opened: false, error: String(error) })
      }
    })()
    return true
  }

  // Handle attention messages from content scripts
  if (!message.type || !message.payload) {
    return
  }

  switch (message.type) {
    case COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME:
      handleTextAttention(message.payload)
      break
    case COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME:
      handleImageAttention(message.payload)
      break
    case COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME:
      handleAudioAttention(message.payload)
      break
    case WEBSITE_VISIT_MESSAGE_NAME:
      handleWebsiteVisit(message.payload)
      break
  }

  sendResponse({ success: true })
})

// =============================================================================
// ACTIVITY TRACKING HANDLERS (using shared ActivityService)
// =============================================================================

interface TextAttentionPayload {
  url: string
  text: string
  wordsRead: number
  timestamp: number
}

async function handleTextAttention(payload: TextAttentionPayload) {
  console.log("Received text attention:", payload)

  const token = await getAuthToken()
  if (!token) {
    console.warn("No auth token available, skipping upload")
    return
  }

  const apiPayload: TextActivityPayload = {
    url: payload.url,
    text: payload.text
  }

  await activityService.trackText(apiPayload)
  console.log("Text attention uploaded successfully")
}

interface ImageAttentionPayload {
  url: string
  src: string
  alt: string
  title: string
  width: number
  height: number
  caption?: string
  hoverDuration: number
  confidence: number
  timestamp: number
}

async function handleImageAttention(payload: ImageAttentionPayload) {
  console.log("Received image attention:", payload)

  const token = await getAuthToken()
  if (!token) {
    console.warn("No auth token available, skipping upload")
    return
  }

  const caption = payload.caption || payload.alt || payload.title || "Image viewed by user"

  const apiPayload: ImageActivityPayload = {
    url: payload.url,
    src: payload.src,
    alt: payload.alt || "",
    title: payload.title || "Untitled Image",
    width: payload.width,
    caption: caption
  }

  await activityService.trackImage(apiPayload)
  console.log("Image attention uploaded successfully")
}

interface AudioAttentionPayload {
  url: string
  src: string
  title: string
  duration: number
  summary?: string
  playbackDuration: number
  currentTime: number
  confidence: number
  timestamp: number
}

async function handleAudioAttention(payload: AudioAttentionPayload) {
  console.log("Received audio attention:", payload)

  const token = await getAuthToken()
  if (!token) {
    console.warn("No auth token available, skipping upload")
    return
  }

  const summary = payload.summary || `Audio played for ${Math.round(payload.playbackDuration)}s`

  const apiPayload: AudioActivityPayload = {
    url: payload.url,
    src: payload.src,
    title: payload.title || "Untitled Audio",
    duration: Math.round(payload.duration),
    summary: summary
  }

  await activityService.trackAudio(apiPayload)
  console.log("Audio attention uploaded successfully")
}

async function handleWebsiteVisit(payload: WebsiteVisitPayload) {
  console.log("Received website visit:", payload)

  const token = await getAuthToken()
  if (!token) {
    console.warn("No auth token available, skipping upload")
    return
  }

  await activityService.trackWebsiteVisit(payload)
  console.log("Website visit uploaded successfully")
}

export {}
