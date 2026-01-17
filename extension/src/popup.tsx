import { useEffect, useState } from "react"
import { ClerkWrapper } from "./components/ClerkWrapper"
import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/chrome-extension"
import { SERVER_URL } from "./default-settings"

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

// Component to handle signed out state - opens options page for login
function SignedOutHandler() {
  useEffect(() => {
    // Open the options page for login
    chrome.runtime.openOptionsPage()
    // Close the popup after opening options
    window.close()
  }, [])

  return (
    <div style={{ padding: 24, minWidth: 250, textAlign: "center", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.025em' }}>KAIZEN</h1>
      </div>
      <p style={{ margin: 0, color: "#666", fontSize: "0.875rem" }}>Redirecting to login...</p>
    </div>
  )
}

function Dashboard() {
  const { getToken } = useAuth()
  const [stats, setStats] = useState<{ averageScore: number, totalRecords: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const token = await getToken()
        if (!token) return

        const response = await fetch(`${SERVER_URL}/focus/stats/today`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error("Error fetching stats:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [getToken])

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 20,
        minWidth: 300,
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#1a1a1a"
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: '1.25rem', letterSpacing: '-0.03em', fontWeight: 800 }}>KAIZEN</h1>
        <UserButton afterSignOutUrl="/options.html" />
      </div>

      <div style={{ 
        background: '#f8f9fa', 
        padding: '16px', 
        borderRadius: '12px',
        border: '1px solid #e9ecef',
        marginBottom: 16
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: '0.75rem', color: '#6c757d', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current Status</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#40c057' }}></div>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#40c057' }}>ACTIVE</span>
          </div>
        </div>
        
        <div style={{ marginTop: 12 }}>
          {loading ? (
            <div style={{ height: '40px', background: '#e9ecef', borderRadius: '4px', animation: 'pulse 1.5s infinite' }}></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                {stats ? `${Math.round(stats.averageScore * 100)}%` : '--%'}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6c757d' }}>Focus Score Today</span>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: 20 }}>
        <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #e9ecef' }}>
          <div style={{ fontSize: '0.7rem', color: '#6c757d', marginBottom: '4px' }}>Sessions</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>{stats?.totalRecords || 0}</div>
        </div>
        <div style={{ background: '#fff', padding: '12px', borderRadius: '10px', border: '1px solid #e9ecef' }}>
          <div style={{ fontSize: '0.7rem', color: '#6c757d', marginBottom: '4px' }}>Level</div>
          <div style={{ fontSize: '1rem', fontWeight: 600 }}>Pro</div>
        </div>
      </div>

      <button 
        onClick={() => {
          const dashboardUrl = process.env.PLASMO_PUBLIC_DASHBOARD_URL || 'http://localhost:3000/dashboard';
          chrome.tabs.create({ url: dashboardUrl });
        }}
        style={{
          width: '100%',
          padding: '12px',
          background: '#000',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '0.875rem',
          fontWeight: 600,
          transition: 'background 0.2s',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = '#333'}
        onMouseOut={(e) => e.currentTarget.style.background = '#000'}
      >
        Open Dashboard
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
          <polyline points="15 3 21 3 21 9"></polyline>
          <line x1="10" y1="14" x2="21" y2="3"></line>
        </svg>
      </button>
    </div>
  )
}

function IndexPopup() {
  return (
    <ClerkWrapper>
      <TokenSync />
      <SignedIn>
        <Dashboard />
      </SignedIn>
      <SignedOut>
        <SignedOutHandler />
      </SignedOut>
    </ClerkWrapper>
  )
}

export default IndexPopup
