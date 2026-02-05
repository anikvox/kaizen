import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
} from "../../cognitive-attention/default-settings"
import { pushSettingsToServer } from "../settings-sync"

const storage = new Storage()

export type UpdateSettingsRequest = {
  cognitiveAttentionDebugMode?: boolean
  cognitiveAttentionShowOverlay?: boolean
}

export type UpdateSettingsResponse = {
  success: boolean
  error?: string
}

const handler: PlasmoMessaging.MessageHandler<UpdateSettingsRequest, UpdateSettingsResponse> = async (req, res) => {
  const body = req.body
  if (!body) {
    res.send({ success: false, error: "No body provided" })
    return
  }

  const token = await storage.get<string>("deviceToken")
  if (!token) {
    res.send({ success: false, error: "Not authenticated" })
    return
  }

  try {
    // Update local storage first for immediate UI feedback
    if (body.cognitiveAttentionDebugMode !== undefined) {
      await storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, body.cognitiveAttentionDebugMode)
    }
    if (body.cognitiveAttentionShowOverlay !== undefined) {
      await storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, body.cognitiveAttentionShowOverlay)
    }

    // Then push to server (this will trigger SSE to sync to other extensions)
    await pushSettingsToServer(body)

    res.send({ success: true })
  } catch (error) {
    console.error("Failed to update settings:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
