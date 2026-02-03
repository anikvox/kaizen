// User activity types and utilities

export type UserActivity = {
  url: string
  title: string
  timestamp: number
  type: "website" | "text" | "image" | "audio" | "video"
  content?: string
  metadata?: Record<string, any>
}

export type AttentionContent = {
  text: string[]
  images: { src: string; alt: string }[]
  audio: string[]
}

// Get all user activity for the last N milliseconds
export const allUserActivityForLastMs = async (
  durationMs: number
): Promise<UserActivity[]> => {
  const now = Date.now()
  const cutoff = now - durationMs

  // Dummy data for now - in production, this would fetch from kaizen backend
  const dummyActivity: UserActivity[] = [
    {
      url: "https://developer.chrome.com/docs/extensions",
      title: "Chrome Extensions Documentation",
      timestamp: now - 600000, // 10 minutes ago
      type: "website"
    },
    {
      url: "https://react.dev",
      title: "React Documentation",
      timestamp: now - 1200000, // 20 minutes ago
      type: "website"
    }
  ]

  return dummyActivity.filter((activity) => activity.timestamp >= cutoff)
}

// Get attention content (text, images, audio) from user activity
export const attentionContent = async (
  userActivity: UserActivity[]
): Promise<AttentionContent> => {
  const content: AttentionContent = {
    text: [],
    images: [],
    audio: []
  }

  for (const activity of userActivity) {
    if (activity.type === "text" && activity.content) {
      content.text.push(activity.content)
    } else if (activity.type === "image" && activity.metadata) {
      content.images.push({
        src: activity.metadata.src || "",
        alt: activity.metadata.alt || ""
      })
    } else if (activity.type === "audio" && activity.metadata) {
      content.audio.push(activity.metadata.title || "")
    }
  }

  return content
}
