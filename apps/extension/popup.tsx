import { useEffect, useState } from "react"
import { Storage } from "@plasmohq/storage"
import { Button, Logo, Card, CardContent } from "@kaizen/ui"
import "./styles.css"

const webUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:60091"
const logoUrl = chrome.runtime.getURL("assets/kaizen-logo.png")

const storage = new Storage()

function IndexPopup() {
  const [loading, setLoading] = useState(true)
  const [linkWindow, setLinkWindow] = useState<Window | null>(null)
  const [error, setError] = useState("")

  // Check for existing token on load
  useEffect(() => {
    const checkAuth = async () => {
      const token = await storage.get<string>("deviceToken")
      if (token) {
        // User has a token, close popup - sidepanel will verify via SSE
        window.close()
        return
      }
      setLoading(false)
    }
    checkAuth()
  }, [])

  // Listen for token from link window
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.data?.type === "KAIZEN_DEVICE_TOKEN" && event.data?.token) {
        const token = event.data.token
        await storage.set("deviceToken", token)
        if (linkWindow) {
          linkWindow.close()
          setLinkWindow(null)
          // Give background script time to process storage change and update action behavior
          await new Promise(resolve => setTimeout(resolve, 100))
          // Close popup after successful link
          window.close()
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [linkWindow])

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
      <div className="p-4 min-w-[300px]">
        <Logo size="md" showText src={logoUrl} />
        <p className="text-muted-foreground mt-2">Loading...</p>
      </div>
    )
  }

  return (
    <div className="p-4 min-w-[300px]">
      <Logo size="md" showText className="mb-4" src={logoUrl} />
      <p className="text-sm text-muted-foreground mb-4">
        Link this extension to your Kaizen account to get started.
      </p>
      {error && (
        <p className="text-destructive text-sm mb-2">{error}</p>
      )}
      <Button onClick={handleLinkExtension} className="w-full">
        Link Extension
      </Button>
    </div>
  )
}

export default IndexPopup
