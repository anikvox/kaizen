import { ClerkWrapper } from "./components/ClerkWrapper"
import { SignedIn, SignedOut, UserButton, SignIn, useAuth } from "@clerk/chrome-extension"
import { useEffect } from "react"

import "./style.css"

// Component to sync auth token with background script
function TokenSync() {
  const { getToken, isSignedIn } = useAuth()

  useEffect(() => {
    const syncToken = async () => {
      if (isSignedIn) {
        try {
          const token = await getToken()
          if (token) {
            chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token })
          }
        } catch (error) {
          console.error("Error syncing token:", error)
        }
      } else {
        chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" })
      }
    }

    syncToken()
    // Re-sync token periodically (tokens expire)
    const interval = setInterval(syncToken, 60000) // Every minute
    return () => clearInterval(interval)
  }, [isSignedIn, getToken])

  return null
}

function IndexOptions() {
  return (
    <ClerkWrapper>
      <TokenSync />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: 32,
          fontFamily: "system-ui, -apple-system, sans-serif",
          background: "linear-gradient(180deg, #ffffff 0%, #f8f9fa 100%)",
          color: "#1a1a1a"
        }}>
        <SignedIn>
          <div style={{ 
            background: "#fff", 
            padding: "40px", 
            borderRadius: "24px",
            boxShadow: "0 10px 40px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
            textAlign: "center",
            maxWidth: 440,
            width: "100%"
          }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
              <div style={{ padding: "4px", background: "#f8f9fa", borderRadius: "50%", border: "1px solid #e9ecef" }}>
                <UserButton afterSignOutUrl="/options.html" />
              </div>
            </div>
            <h1 style={{ margin: "0 0 12px 0", fontSize: "2rem", letterSpacing: "-0.04em", fontWeight: 800 }}>KAIZEN</h1>
            <p style={{ margin: "0 0 24px 0", color: "#495057", fontSize: "1rem", lineHeight: 1.5 }}>
              Authentication successful. Your cognitive focus is now being synchronized.
            </p>
            <div style={{ 
              background: "#f8f9fa", 
              padding: "20px", 
              borderRadius: "16px",
              border: "1px solid #e9ecef",
              marginBottom: 24,
              textAlign: "left"
            }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 600, color: "#212529", marginBottom: "8px" }}>Next Steps</div>
              <ul style={{ margin: 0, padding: "0 0 0 18px", fontSize: "0.875rem", color: "#495057", lineHeight: 1.6 }}>
                <li>Close this tab and continue browsing</li>
                <li>Access stats via the extension popup</li>
                <li>View detailed insights on your dashboard</li>
              </ul>
            </div>
            <button
              onClick={() => {
                const dashboardUrl = process.env.PLASMO_PUBLIC_DASHBOARD_URL || 'http://localhost:3000/dashboard';
                chrome.tabs.create({ url: dashboardUrl });
              }}
              style={{
                width: "100%",
                padding: "14px 24px",
                background: "#000",
                color: "#fff",
                border: "none",
                borderRadius: "12px",
                cursor: "pointer",
                fontSize: "1rem",
                fontWeight: 600,
                transition: "all 0.2s"
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = "translateY(-1px)"}
              onMouseOut={(e) => e.currentTarget.style.transform = "none"}
            >
              Go to Dashboard
            </button>
          </div>
        </SignedIn>
        <SignedOut>
          <div style={{ 
            background: "#fff", 
            padding: "48px", 
            borderRadius: "32px",
            boxShadow: "0 20px 50px rgba(0,0,0,0.05)",
            textAlign: "center",
            maxWidth: 480,
            width: "100%",
            border: "1px solid #f1f3f5"
          }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ 
                width: "64px", 
                height: "64px", 
                background: "#000", 
                borderRadius: "16px", 
                margin: "0 auto 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "24px",
                fontWeight: 900
              }}>K</div>
              <h1 style={{ margin: "0 0 12px 0", fontSize: "2.5rem", letterSpacing: "-0.05em", fontWeight: 900 }}>KAIZEN</h1>
              <p style={{ margin: 0, color: "#6c757d", fontSize: "1.125rem" }}>Master your digital focus</p>
            </div>
            
            <div style={{ marginBottom: 32 }}>
              <SignIn routing="hash" />
            </div>

            <p style={{ margin: 0, color: "#adb5bd", fontSize: "0.875rem" }}>
              By continuing, you agree to Kaizen's Terms of Service and Privacy Policy.
            </p>
          </div>
        </SignedOut>
      </div>
    </ClerkWrapper>
  )
}

export default IndexOptions
