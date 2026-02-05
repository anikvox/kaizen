import { useEffect, useState, useRef } from "react"
import { Storage } from "@plasmohq/storage"
import { sendToBackground } from "@plasmohq/messaging"
import { createApiClient, type UserSettings } from "@kaizen/api-client"
import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
} from "./cognitive-attention/default-settings"

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
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const settingsEventSourceRef = useRef<EventSource | null>(null)

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
    setSettings(null)
  }

  const handleToggleSetting = async (key: keyof UserSettings) => {
    if (!settings) return

    setSavingSettings(true)
    const newValue = !settings[key]

    try {
      await sendToBackground({
        name: "update-settings",
        body: { [key]: newValue }
      })
      setSettings({ ...settings, [key]: newValue })
    } catch (error) {
      console.error("Failed to update setting:", error)
    } finally {
      setSavingSettings(false)
    }
  }

  // Connect to background script to track sidepanel open/close state
  useEffect(() => {
    const port = chrome.runtime.connect({ name: "sidepanel" })
    return () => port.disconnect()
  }, [])

  // Setup SSE connection for authentication and revocation events
  useEffect(() => {
    let cancelled = false

    const setupSSE = async () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }

      const api = createApiClient(apiUrl)
      const eventSource = api.sse.subscribeDeviceToken(
        (data) => {
          // Connected successfully, set user from SSE response
          if (!cancelled) {
            setUser(data.user)
            setLoading(false)
          }
        },
        async (data) => {
          // Token was revoked remotely, clear local state
          if (data.token === token) {
            await storage.remove("deviceToken")
            if (!cancelled) {
              setUser(null)
            }
          }
        },
        async () => {
          // On error, token is likely invalid - clear it
          await storage.remove("deviceToken")
          if (!cancelled) {
            setUser(null)
            setLoading(false)
          }
        },
        token
      )

      eventSourceRef.current = eventSource
    }

    setupSSE()

    return () => {
      cancelled = true
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Setup SSE connection for settings changes
  useEffect(() => {
    let cancelled = false

    const setupSettingsSSE = async () => {
      // Close existing connection
      if (settingsEventSourceRef.current) {
        settingsEventSourceRef.current.close()
        settingsEventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token) {
        setSettings(null)
        return
      }

      const api = createApiClient(apiUrl)
      const eventSource = api.settings.subscribeSettings(
        (data) => {
          // Connected with initial settings
          if (!cancelled && data.settings) {
            setSettings(data.settings)
          }
        },
        (newSettings) => {
          // Settings changed remotely
          if (!cancelled) {
            setSettings(newSettings)
          }
        },
        () => {
          // On error
          console.error("Settings SSE error")
        },
        token
      )

      settingsEventSourceRef.current = eventSource
    }

    setupSettingsSSE()

    return () => {
      cancelled = true
      if (settingsEventSourceRef.current) {
        settingsEventSourceRef.current.close()
        settingsEventSourceRef.current = null
      }
    }
  }, [user])

  // Listen for storage changes to reconnect SSE
  useEffect(() => {
    const callbackMap = {
      deviceToken: async (change: { newValue?: string }) => {
        // Close existing connections
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        if (settingsEventSourceRef.current) {
          settingsEventSourceRef.current.close()
          settingsEventSourceRef.current = null
        }

        if (change.newValue) {
          // New token, setup new SSE connection
          const api = createApiClient(apiUrl)
          const eventSource = api.sse.subscribeDeviceToken(
            (data) => {
              setUser(data.user)
            },
            async (data) => {
              if (data.token === change.newValue) {
                await storage.remove("deviceToken")
                setUser(null)
                setSettings(null)
              }
            },
            async () => {
              await storage.remove("deviceToken")
              setUser(null)
              setSettings(null)
            },
            change.newValue
          )
          eventSourceRef.current = eventSource
        } else {
          setUser(null)
          setSettings(null)
        }
      }
    }

    storage.watch(callbackMap)

    return () => {
      storage.unwatch(callbackMap)
    }
  }, [])

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
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Attention Tracking</h3>
          {settings ? (
            <div style={styles.settingsList}>
              <div style={styles.settingItem}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingName}>Debug Mode</span>
                  <span style={styles.settingDesc}>Show debug overlay</span>
                </div>
                <button
                  onClick={() => handleToggleSetting("cognitiveAttentionDebugMode")}
                  disabled={savingSettings}
                  style={{
                    ...styles.toggleButton,
                    background: settings.cognitiveAttentionDebugMode ? "#28a745" : "#6c757d",
                    opacity: savingSettings ? 0.6 : 1,
                    cursor: savingSettings ? "not-allowed" : "pointer"
                  }}
                >
                  {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
                </button>
              </div>
              <div style={styles.settingItem}>
                <div style={styles.settingInfo}>
                  <span style={styles.settingName}>Show Overlay</span>
                  <span style={styles.settingDesc}>Highlight tracked elements</span>
                </div>
                <button
                  onClick={() => handleToggleSetting("cognitiveAttentionShowOverlay")}
                  disabled={savingSettings}
                  style={{
                    ...styles.toggleButton,
                    background: settings.cognitiveAttentionShowOverlay ? "#28a745" : "#6c757d",
                    opacity: savingSettings ? 0.6 : 1,
                    cursor: savingSettings ? "not-allowed" : "pointer"
                  }}
                >
                  {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          ) : (
            <p style={styles.text}>Loading settings...</p>
          )}
        </div>
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
    padding: 16,
    overflowY: "auto"
  },
  text: {
    margin: 0,
    fontSize: 14,
    color: "#666"
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: 14,
    fontWeight: 600,
    color: "#333"
  },
  settingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  settingItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    background: "#f8f9fa",
    borderRadius: 6
  },
  settingInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  settingName: {
    fontSize: 13,
    fontWeight: 500,
    color: "#333"
  },
  settingDesc: {
    fontSize: 11,
    color: "#666"
  },
  toggleButton: {
    padding: "4px 10px",
    border: "none",
    borderRadius: 4,
    color: "#fff",
    fontSize: 11,
    fontWeight: 500,
    minWidth: 40
  }
}

export default SidePanel
