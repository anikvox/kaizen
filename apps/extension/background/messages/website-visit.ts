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

export type WebsiteVisitEvent = {
  event: "opened" | "active-time-update" | "closed"
  url: string
  timestamp: number
  title?: string
  metadata?: Record<string, string>
  referrer?: string
  time?: number
}

const handler: PlasmoMessaging.MessageHandler<WebsiteVisitEvent> = async (req, res) => {
  console.log("[website-visit] Received message:", req.body)

  const body = req.body
  if (!body) {
    console.log("[website-visit] No body provided")
    res.send({ success: false, error: "No body provided" })
    return
  }

  const token = await storage.get<string>("deviceToken")
  if (!token) {
    console.log("[website-visit] Not authenticated - no device token")
    res.send({ success: false, error: "Not authenticated" })
    return
  }

  console.log("[website-visit] Got device token, sending to API")

  const api = getApiClient()

  try {
    switch (body.event) {
      case "opened": {
        console.log("[website-visit] Sending opened event for:", body.url)
        const result = await api.websiteVisits.opened({
          url: body.url,
          title: body.title || "",
          metadata: body.metadata || {},
          referrer: body.url === body.referrer ? null : (body.referrer || null),
          timestamp: body.timestamp
        })
        console.log("[website-visit] Opened event result:", result)
        break
      }
      case "active-time-update": {
        await api.websiteVisits.updateActiveTime({
          url: body.url,
          activeTime: body.time || 0,
          timestamp: body.timestamp
        })
        break
      }
      case "closed": {
        console.log("[website-visit] Sending closed event for:", body.url)
        await api.websiteVisits.closed({
          url: body.url,
          activeTime: body.time || 0,
          timestamp: body.timestamp
        })
        break
      }
    }
    console.log("[website-visit] Success")
    res.send({ success: true })
  } catch (error) {
    console.error("[website-visit] Failed to send website visit data:", error)
    res.send({ success: false, error: String(error) })
  }
}

export default handler
