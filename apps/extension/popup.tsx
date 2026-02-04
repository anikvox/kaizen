import { useEffect, useState, useCallback } from "react"
import { Storage } from "@plasmohq/storage"
import { createApiClient } from "@kaizen/api-client"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"
const webUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"

const storage = new Storage()

function IndexPopup() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [linkWindow, setLinkWindow] = useState<Window | null>(null)

  const verifyToken = useCallback(async (token: string) => {
    const api = createApiClient(apiUrl)
    try {
      await api.deviceTokens.verify(token)
      return true
    } catch {
      // Token invalid, clear it
      await storage.remove("deviceToken")
      return false
    }
  }, [])

  // Check for existing token on load
  useEffect(() => {
    const checkAuth = async () => {
      const token = await storage.get<string>("deviceToken")
      if (token) {
        const valid = await verifyToken(token)
        if (valid) {
          // User is logged in, close popup - sidepanel should be used
          window.close()
          return
        }
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
          // Close popup after successful link
          window.close()
        } else if (!valid) {
          setError("Invalid token received")
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

  if (loading) {
    return (
      <div style={{ padding: 16, minWidth: 300 }}>
        <h2>Kaizen</h2>
        <p>Loading...</p>
      </div>
    )
  }

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
    </div>
  )
}

export default IndexPopup
