import { SERVER_URL } from "./default-settings"

console.log("Kaizen background script initialized")

// Storage key for device token (set by popup when user links account)
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"

// Check if user is authenticated
async function isAuthenticated(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return !!result[DEVICE_TOKEN_KEY]
  } catch (error) {
    return false
  }
}

// Update action behavior based on auth state
async function updateActionBehavior() {
  const authenticated = await isAuthenticated()
  
  if (authenticated) {
    // Disable popup so clicking opens sidepanel
    await chrome.action.setPopup({ popup: "" })
    
    // Enable side panel globally
    if (chrome.sidePanel) {
      try {
        await chrome.sidePanel.setOptions({
          enabled: true
        })
        // Set the panel to open on action click (Chrome 116+)
        if (chrome.sidePanel.setPanelBehavior) {
          await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
        }
      } catch (error) {
        console.error("Error setting up side panel:", error)
      }
    }
    console.log("User authenticated - sidepanel mode enabled")
  } else {
    // Enable popup for unauthenticated users
    await chrome.action.setPopup({ popup: "popup.html" })
    
    // Disable side panel auto-open when not authenticated
    if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
      try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      } catch (error) {
        console.error("Error disabling side panel behavior:", error)
      }
    }
    console.log("User not authenticated - popup mode enabled")
  }
}

// Handle extension icon click - open sidepanel when authenticated (fallback)
// Note: This listener only fires when popup is empty AND openPanelOnActionClick is false/unavailable
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id) {
    try {
      // Check if sidePanel API is available (Chrome 114+)
      if (chrome.sidePanel) {
        // Ensure side panel is enabled for this tab
        await chrome.sidePanel.setOptions({
          tabId: tab.id,
          enabled: true
        })
        // Try opening by windowId first (more reliable), fall back to tabId
        if (tab.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId })
        } else {
          await chrome.sidePanel.open({ tabId: tab.id })
        }
      } else {
        // Fallback for older Chrome versions - open popup manually
        console.warn("sidePanel API not available, falling back to popup")
        await chrome.action.setPopup({ popup: "popup.html" })
      }
    } catch (error) {
      console.error("Error opening side panel:", error)
      // Fallback to popup on error
      await chrome.action.setPopup({ popup: "popup.html" })
    }
  }
})

// Initialize action behavior on startup
updateActionBehavior()

// Listen for storage changes to update behavior dynamically
chrome.storage.local.onChanged.addListener((changes) => {
  if (changes[DEVICE_TOKEN_KEY]) {
    updateActionBehavior()
  }
})

// Helper to get device token from storage
async function getAuthToken(): Promise<string | null> {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch (error) {
    console.error("Error getting device token:", error)
    return null
  }
}

// Message types
const COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME = "cognitive-attention-text"
const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"
const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"

// Unified message listener for all message types
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
    // Request to open sidepanel from popup after successful auth
    // First update behavior, then open
    updateActionBehavior().then(() => {
      chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
        if (tabs[0]?.id && chrome.sidePanel) {
          try {
            // Enable side panel for this tab first
            await chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              enabled: true
            })
            // Try opening by windowId first (more reliable), fall back to tabId
            const windowId = tabs[0].windowId
            if (windowId) {
              await chrome.sidePanel.open({ windowId })
            } else {
              await chrome.sidePanel.open({ tabId: tabs[0].id })
            }
          } catch (error) {
            console.error("Error opening side panel:", error)
          }
        }
      })
    })
    sendResponse({ success: true })
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
  }

  // Acknowledge receipt
  sendResponse({ success: true })
})

// =============================================================================
// TEXT ATTENTION HANDLER
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        url: payload.url,
        title: getPageTitle(payload.url),
        content: payload.text,
        wordCount: payload.wordsRead,
        readingTime: Math.ceil(payload.wordsRead / 150) // Approximate reading time in minutes
      })
    })

    if (!response.ok) {
      console.error("Failed to upload text attention:", response.statusText)
    } else {
      console.log("Text attention uploaded successfully")
    }
  } catch (error) {
    console.error("Error uploading text attention:", error)
  }
}

// =============================================================================
// IMAGE ATTENTION HANDLER
// =============================================================================

interface ImageAttentionPayload {
  url: string
  src: string
  alt: string
  title: string
  width: number
  height: number
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        url: payload.src,
        title: payload.alt || payload.title || "Untitled Image",
        description: `Viewed on ${payload.url} for ${payload.hoverDuration}ms with ${payload.confidence}% confidence`,
        width: payload.width,
        height: payload.height
      })
    })

    if (!response.ok) {
      console.error("Failed to upload image attention:", response.statusText)
    } else {
      console.log("Image attention uploaded successfully")
    }
  } catch (error) {
    console.error("Error uploading image attention:", error)
  }
}

// =============================================================================
// AUDIO ATTENTION HANDLER
// =============================================================================

interface AudioAttentionPayload {
  url: string
  src: string
  title: string
  duration: number
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        url: payload.src,
        title: payload.title || "Untitled Audio",
        duration: Math.round(payload.duration), // Duration in seconds
        artist: `Listened on ${payload.url}`
      })
    })

    if (!response.ok) {
      console.error("Failed to upload audio attention:", response.statusText)
    } else {
      console.log("Audio attention uploaded successfully")
    }
  } catch (error) {
    console.error("Error uploading audio attention:", error)
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function getPageTitle(url: string): string {
  try {
    const urlObj = new URL(url)
    return urlObj.hostname + urlObj.pathname
  } catch {
    return url
  }
}

export {}
