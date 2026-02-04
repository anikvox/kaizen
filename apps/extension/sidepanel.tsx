import { useEffect, useState, useCallback } from "react"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"

const storage = new Storage()

interface UserInfo {
  id: string
  email: string
  name: string | null
}

function SidePanel() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const verifyToken = useCallback(async (token: string) => {
    const api = createApiClient(apiUrl)
    try {
      const result = await api.deviceTokens.verify(token)
      setUser(result.user)
      return true
    } catch {
      // Token invalid, clear it
      await storage.remove("deviceToken")
      setUser(null)
      return false
    }
  }, [])

  const handleUnlink = async () => {
    const token = await storage.get<string>("deviceToken")
    if (token) {
      const api = createApiClient(apiUrl)
      try {
        await api.deviceTokens.revoke(token)
      } catch {
        // Ignore errors - token may already be invalid
      }
    }
    await storage.remove("deviceToken")
    setUser(null)
  }

  useEffect(() => {
    const checkAuth = async () => {
      const token = await storage.get<string>("deviceToken")
      if (token) {
        await verifyToken(token)
      }
      setLoading(false)
    }
    checkAuth()
  }, [verifyToken])

  // Listen for storage changes
  useEffect(() => {
    const callbackMap = {
      deviceToken: async (change: { newValue?: string }) => {
        if (change.newValue) {
          await verifyToken(change.newValue)
        } else {
          setUser(null)
        }
      }
    }

    storage.watch(callbackMap)

    return () => {
      storage.unwatch(callbackMap)
    }
  }, [verifyToken])

  // Subscribe to SSE for remote unlink events
  useEffect(() => {
    let eventSource: EventSource | null = null

    const setupSSE = async () => {
      const token = await storage.get<string>("deviceToken")
      if (!token || !user) return

      const api = createApiClient(apiUrl)
      eventSource = api.sse.subscribeDeviceTokenRevoked(
        async (data) => {
          // Token was revoked remotely, clear local state
          if (data.token === token) {
            await storage.remove("deviceToken")
            setUser(null)
          }
        },
        () => {
          // On error, verify token is still valid
          if (token) {
            verifyToken(token)
          }
        },
        token
      )
    }

    setupSSE()

    return () => {
      eventSource?.close()
    }
  }, [user, verifyToken])

  if (loading) {
    return (
      <div style={styles.container}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.centered}>
          <h2 style={styles.title}>Kaizen</h2>
          <p style={styles.text}>Not logged in. Please click the extension icon to link your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <h2 style={styles.title}>Kaizen</h2>
          <button onClick={handleUnlink} style={styles.unlinkButton}>
            Unlink
          </button>
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user.name || user.email}</span>
          {user.name && <span style={styles.userEmail}>{user.email}</span>}
        </div>
      </div>
      <div style={styles.content}>
        <p style={styles.text}>Side panel is ready. Your browsing context will appear here.</p>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#fff"
  },
  centered: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    textAlign: "center"
  },
  header: {
    padding: 16,
    borderBottom: "1px solid #eee"
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    margin: 0,
    fontSize: 18,
    fontWeight: 600
  },
  unlinkButton: {
    padding: "4px 12px",
    background: "transparent",
    color: "#dc3545",
    border: "1px solid #dc3545",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 12
  },
  userInfo: {
    marginTop: 8,
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  userName: {
    fontSize: 14,
    fontWeight: 500
  },
  userEmail: {
    fontSize: 12,
    color: "#666"
  },
  content: {
    flex: 1,
    padding: 16
  },
  text: {
    margin: 0,
    fontSize: 14,
    color: "#666"
  }
}

export default SidePanel
