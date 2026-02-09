import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const storage = new Storage()

const getApiClient = () => {
  // @ts-expect-error - PLASMO_PUBLIC_ env vars are injected at build time
  const baseUrl = (typeof PLASMO_PUBLIC_KAIZEN_API_URL !== "undefined" ? PLASMO_PUBLIC_KAIZEN_API_URL : "https://api.kaizen.apps.sandipan.dev") as string
  return createApiClient(baseUrl, async () => {
    return (await storage.get<string>("deviceToken")) ?? null
  })
}

export type ImageAttentionEvent = {
  url: string
  src: string
  alt: string
  title: string
  width: number
  height: number
  hoverDuration: number
  confidence: number
  timestamp: number
  kaizenId: string
}

export type ImageAttentionResponse = {
  success: boolean
  error?: string
  summary?: string | null
  kaizenId?: string
}

const handler: PlasmoMessaging.MessageHandler<ImageAttentionEvent, ImageAttentionResponse> = async (req, res) => {
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

  // Check if tracking is enabled (default to true)
  const trackingEnabled = await storage.get<boolean>("trackingEnabled")
  if (trackingEnabled === false) {
    res.send({ success: false, error: "Tracking disabled" })
    return
  }

  const api = getApiClient()

  try {
    const response = await api.attention.image({
      url: body.url,
      src: body.src,
      alt: body.alt,
      title: body.title,
      width: body.width,
      height: body.height,
      hoverDuration: body.hoverDuration,
      confidence: body.confidence,
      timestamp: body.timestamp,
      kaizenId: body.kaizenId
    })
    res.send({ success: true, summary: response.summary, kaizenId: body.kaizenId })
  } catch (error) {
    console.error("Failed to send image attention data:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
