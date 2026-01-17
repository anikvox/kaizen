import { SERVER_URL } from "./default-settings"

console.log("Kaizen background script initialized")

// Message types
const COGNITIVE_ATTENTION_TEXT_MESSAGE_NAME = "cognitive-attention-text"
const COGNITIVE_ATTENTION_IMAGE_MESSAGE_NAME = "cognitive-attention-image"
const COGNITIVE_ATTENTION_AUDIO_MESSAGE_NAME = "cognitive-attention-audio"

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/image`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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

  try {
    const response = await fetch(`${SERVER_URL}/activities/audio`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
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
