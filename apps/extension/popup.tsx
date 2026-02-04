import { useEffect, useState, useCallback } from "react"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"
const webUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"

const storage = new Storage()

interface UserInfo {
  id: string
  email: string
  name: string | null
}

function IndexPopup() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [linkWindow, setLinkWindow] = useState<Window | null>(null)

  const verifyToken = useCallback(async (token: string) => {
    const api = createApiClient(apiUrl)
    try {
      const result = await api.deviceTokens.verify(token)
      setUser(result.user)
      setError("")
      return true
    } catch {
      // Token invalid, clear it
      await storage.remove("deviceToken")
      setUser(null)
      return false
    }
  }, [])

  // Check for existing token on load
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

  // Listen for token from link window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "KAIZEN_DEVICE_TOKEN" && event.data?.token) {
        const token = event.data.token
        await storage.set("deviceToken", token)
        const valid = await verifyToken(token)
        if (valid && linkWindow) {
          linkWindow.close()
          setLinkWindow(null)
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [linkWindow, verifyToken])

  const handleLinkExtension = () => {
    const width = 500
    const height = 600
    const left = window.screenX + (window.outerWidth - width) / 2
    const top = window.screenY + (window.outerHeight - height) / 2

    const popup = window.open(
      `${webUrl}/link-extension`,
      "kaizen-link",
      `width=${width},height=${height},left=${left},top=${top}`
    )
    setLinkWindow(popup)
  }

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

  const handleManualToken = async () => {
    const token = prompt("Paste your device token:")
    if (token) {
      await storage.set("deviceToken", token.trim())
      const valid = await verifyToken(token.trim())
      if (!valid) {
        setError("Invalid token")
      }
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 16, minWidth: 300 }}>
        <h2>Kaizen</h2>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ padding: 16, minWidth: 300 }}>
        <h2>Kaizen</h2>
        <p style={{ marginBottom: 16 }}>Link this extension to your Kaizen account to get started.</p>
        {error && <p style={{ color: "red", marginBottom: 8 }}>{error}</p>}
        <button
          onClick={handleLinkExtension}
          style={{
            width: "100%",
            padding: "10px 16px",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 14,
            fontWeight: 500
          }}
        >
          Link Extension
        </button>
        <button
          onClick={handleManualToken}
          style={{
            width: "100%",
            padding: "8px 16px",
            background: "transparent",
            color: "#666",
            border: "1px solid #ddd",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 12,
            marginTop: 8
          }}
        >
          Enter Token Manually
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 16, minWidth: 300 }}>
      <h2>Kaizen</h2>
      <div style={{
        padding: 12,
        background: "#f5f5f5",
        borderRadius: 8,
        marginBottom: 16
      }}>
        <p style={{ margin: 0, fontWeight: 500 }}>
          {user.name || user.email}
        </p>
        {user.name && (
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#666" }}>
            {user.email}
          </p>
        )}
      </div>
      <button
        onClick={handleUnlink}
        style={{
          width: "100%",
          padding: "8px 16px",
          background: "transparent",
          color: "#dc3545",
          border: "1px solid #dc3545",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 12
        }}
      >
        Unlink Extension
      </button>
    </div>
  )
}

export default IndexPopup
