import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const storage = new Storage()

const getApiClient = () => {
  // @ts-expect-error - PLASMO_PUBLIC_ env vars are injected at build time
  const baseUrl = (typeof PLASMO_PUBLIC_KAIZEN_API_URL !== "undefined" ? PLASMO_PUBLIC_KAIZEN_API_URL : "http://localhost:60092") as string
  return createApiClient(baseUrl, async () => {
    return (await storage.get<string>("deviceToken")) ?? null
  })
}

export type AudioAttentionEvent = {
  url: string
  src: string
  title: string
  duration: number
  playbackDuration: number
  currentTime: number
  confidence: number
  timestamp: number
}

const handler: PlasmoMessaging.MessageHandler<AudioAttentionEvent> = async (req, res) => {
  const body = req.body
  if (!body) {
    res.send({ success: false, error: "No body provided" })
    return
  }

  const token = await storage.get<string>("deviceToken")
  if (!token) {
    // User not logged in, don't track
    res.send({ success: false, error: "Not authenticated" })
    return
  }

  const api = getApiClient()

  try {
    await api.attention.audio({
      url: body.url,
      src: body.src,
      title: body.title,
      duration: body.duration,
      playbackDuration: body.playbackDuration,
      currentTime: body.currentTime,
      confidence: body.confidence,
      timestamp: body.timestamp
    })
    res.send({ success: true })
  } catch (error) {
    console.error("Failed to send audio attention data:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
