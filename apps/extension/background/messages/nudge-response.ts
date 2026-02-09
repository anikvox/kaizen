import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const storage = new Storage()

// @ts-expect-error - PLASMO_PUBLIC_ env vars are injected at build time
const apiUrl = (typeof PLASMO_PUBLIC_KAIZEN_API_URL !== "undefined" ? PLASMO_PUBLIC_KAIZEN_API_URL : "https://api.kaizen.apps.sandipan.dev") as string

export type NudgeResponseRequest = {
  nudgeId: string
  response: "acknowledged" | "false_positive" | "dismissed"
}

export type NudgeResponseResponse = {
  success: boolean
  error?: string
}

const handler: PlasmoMessaging.MessageHandler<NudgeResponseRequest, NudgeResponseResponse> = async (req, res) => {
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
    const api = createApiClient(apiUrl, async () => token)

    // Send response to API
    await api.agent.respondToNudge(body.nudgeId, body.response)

    res.send({ success: true })
  } catch (error) {
    console.error("[Nudge Response] Failed to send response:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
