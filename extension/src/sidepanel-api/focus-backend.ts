// Backend focus API service for extension
// Fetches focus data from the kaizen backend instead of local DB

export interface BackendFocus {
  id: number
  score: number // 0-100
  category: string // "deep_work", "shallow_work", "distraction", "rest"
  summary: string
  insights?: string
  windowStart: string // ISO date string
  windowEnd: string // ISO date string
  textCount: number
  imageCount: number
  youtubeCount: number
  audioCount: number
  modelUsed: string
  traceId?: string
  timestamp: string // ISO date string
  updatedAt: string // ISO date string
}

const API_BASE_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

// Get device token from storage
const getDeviceToken = async (): Promise<string | null> => {
  const result = await chrome.storage.local.get("kaizen_device_token")
  return result.kaizen_device_token || null
}

/**
 * Fetch the latest focus calculation from backend
 */
export async function getLatestFocusFromBackend(): Promise<BackendFocus | null> {
  try {
    const token = await getDeviceToken()
    if (!token) {
      console.warn("[Focus API] No device token found")
      return null
    }

    const response = await fetch(`${API_BASE_URL}/api/focus/latest`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // No focus data found yet
        return null
      }
      const errorText = await response.text()
      console.error(`[Focus API] Failed to fetch latest focus: ${response.status}`, errorText)
      return null
    }

    return response.json()
  } catch (error) {
    console.error("[Focus API] Error fetching latest focus:", error)
    return null
  }
}

/**
 * Fetch focus history from backend
 */
export async function getFocusHistoryFromBackend(
  limit = 10,
  offset = 0
): Promise<BackendFocus[]> {
  try {
    const token = await getDeviceToken()
    if (!token) {
      console.warn("[Focus API] No device token found")
      return []
    }

    const response = await fetch(
      `${API_BASE_URL}/api/focus?limit=${limit}&offset=${offset}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Focus API] Failed to fetch focus history: ${response.status}`, errorText)
      return []
    }

    return response.json()
  } catch (error) {
    console.error("[Focus API] Error fetching focus history:", error)
    return []
  }
}

/**
 * Fetch today's focus statistics from backend
 */
export async function getTodayFocusStats(): Promise<{
  averageScore: number
  totalRecords: number
  categoryDistribution: Record<string, number>
  timeline: Array<{
    id: number
    score: number
    category: string
    timestamp: string
  }>
} | null> {
  try {
    const token = await getDeviceToken()
    if (!token) {
      console.warn("[Focus API] No device token found")
      return null
    }

    const response = await fetch(`${API_BASE_URL}/api/focus/stats/today`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Focus API] Failed to fetch today's stats: ${response.status}`, errorText)
      return null
    }

    return response.json()
  } catch (error) {
    console.error("[Focus API] Error fetching today's stats:", error)
    return null
  }
}

/**
 * Start polling for focus updates
 * @param callback - Function to call with new focus data
 * @param intervalMs - Polling interval in milliseconds (default 30s)
 * @returns Function to stop polling
 */
export function startFocusPolling(
  callback: (focus: BackendFocus | null) => void,
  intervalMs = 30000
): () => void {
  console.log("[Focus Polling] Starting focus polling with interval:", intervalMs)

  // Initial fetch
  getLatestFocusFromBackend().then(callback)

  // Set up polling
  const intervalId = setInterval(() => {
    getLatestFocusFromBackend().then(callback)
  }, intervalMs)

  // Return cleanup function
  return () => {
    console.log("[Focus Polling] Stopping focus polling")
    clearInterval(intervalId)
  }
}
