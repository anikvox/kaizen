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

export type YoutubeAttentionEvent = {
  event: "opened" | "caption" | "active-watch-time-update"
  data: {
    title?: string
    channelName?: string
    url?: string
    caption?: string
    activeWatchTime?: number
  }
  videoId: string | null
  timestamp: number
}

const handler: PlasmoMessaging.MessageHandler<YoutubeAttentionEvent> = async (req, res) => {
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
    await api.attention.youtube({
      event: body.event,
      videoId: body.videoId,
      title: body.data.title,
      channelName: body.data.channelName,
      url: body.data.url,
      caption: body.data.caption,
      activeWatchTime: body.data.activeWatchTime,
      timestamp: body.timestamp
    })
    res.send({ success: true })
  } catch (error) {
    console.error("Failed to send youtube attention data:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
