import { useEffect, useState, useCallback } from "react"
import { SERVER_URL } from "./default-settings"
import { ExternalLink, Loader2, LogOut, User, Activity, Eye, Clock, BarChart3, RefreshCw } from "lucide-react"

import "./style.css"

const WEBSITE_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL?.replace('/dashboard', '') || 'http://localhost:3000'
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"

interface UserData {
  email: string
  name: string | null
  image: string | null
}

interface ActivityStats {
  todayTexts: number
  todayImages: number
  todayAudio: number
  totalActivities: number
}

// Check device token status from server
async function checkDeviceStatus(installationId: string): Promise<{
  linked: boolean
  token: string | null
  user: UserData | null
}> {
  try {
    const response = await fetch(`${SERVER_URL}/device-tokens/status/${installationId}`)
    if (!response.ok) {
      throw new Error("Failed to check status")
    }
    return await response.json()
  } catch (error) {
    console.error("Error checking device status:", error)
    return { linked: false, token: null, user: null }
  }
}

function SidePanel() {
  const [isLoading, setIsLoading] = useState(true)
  const [isLinked, setIsLinked] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [stats, setStats] = useState<ActivityStats | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      // Check local storage for cached data
      const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, USER_DATA_KEY, "kaizen_installation_id"])
      const installationId = cached["kaizen_installation_id"]
      
      if (cached[DEVICE_TOKEN_KEY] && cached[USER_DATA_KEY]) {
        setIsLinked(true)
        setUser(cached[USER_DATA_KEY])
        setIsLoading(false)
        
        // Verify with server in background
        if (installationId) {
          const status = await checkDeviceStatus(installationId)
          if (!status.linked) {
            // Token was revoked, clear local data and close sidepanel
            await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
            setIsLinked(false)
            setUser(null)
            // Notify background to switch back to popup mode
            chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
          } else if (status.user) {
            setUser(status.user)
            await chrome.storage.local.set({ [USER_DATA_KEY]: status.user })
          }
        }
        return
      }

      // Not linked - this shouldn't happen in sidepanel, but handle gracefully
      setIsLinked(false)
      setIsLoading(false)
      // Notify background to switch to popup mode
      chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
    } catch (error) {
      console.error("Error checking status:", error)
      setIsLoading(false)
    }
  }, [])

  const fetchStats = useCallback(async () => {
    try {
      const cached = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
      const token = cached[DEVICE_TOKEN_KEY]
      
      if (!token) return

      // For now, just show placeholder stats
      // In a real implementation, you'd fetch from the server
      setStats({
        todayTexts: 0,
        todayImages: 0,
        todayAudio: 0,
        totalActivities: 0
      })
    } catch (error) {
      console.error("Error fetching stats:", error)
    }
  }, [])

  const handleRefresh = async () => {
    setIsRefreshing(true)
    await checkStatus()
    await fetchStats()
    setIsRefreshing(false)
  }

  useEffect(() => {
    checkStatus()
    fetchStats()
    
    // Listen for storage changes (e.g., if user unlinks from popup)
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[DEVICE_TOKEN_KEY]) {
        if (!changes[DEVICE_TOKEN_KEY].newValue) {
          // Token was removed, user unlinked
          setIsLinked(false)
          setUser(null)
          chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
        }
      }
    }
    
    chrome.storage.local.onChanged.addListener(handleStorageChange)
    
    // Periodic status check
    const interval = setInterval(checkStatus, 30000)
    
    return () => {
      clearInterval(interval)
      chrome.storage.local.onChanged.removeListener(handleStorageChange)
    }
  }, [checkStatus, fetchStats])

  const handleUnlink = async () => {
    try {
      const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, "kaizen_installation_id"])
      const token = cached[DEVICE_TOKEN_KEY]
      const installationId = cached["kaizen_installation_id"]
      
      if (token && installationId) {
        await fetch(`${SERVER_URL}/device-tokens/unlink`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
          },
          body: JSON.stringify({ installationId }),
        })
      }
    } catch (error) {
      console.error("Error unlinking from server:", error)
    }
    
    // Clear local storage
    await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" })
    chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
    setIsLinked(false)
    setUser(null)
  }

  const handleOpenDashboard = () => {
    chrome.tabs.create({ url: `${WEBSITE_URL}/dashboard` })
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    )
  }

  if (!isLinked) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6">
        <div className="w-12 h-12 bg-white flex items-center justify-center mb-4">
          <div className="w-6 h-6 bg-black rotate-45" />
        </div>
        <h1 className="text-xl font-bold tracking-tighter uppercase mb-2">KAIZEN</h1>
        <p className="text-gray-400 text-sm text-center mb-4">
          Session expired or account unlinked
        </p>
        <p className="text-gray-500 text-xs text-center">
          Click the extension icon to re-link your account
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <div className="sticky top-0 bg-[#050505] border-b border-white/10 p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-white flex items-center justify-center">
              <div className="w-3 h-3 bg-black rotate-45" />
            </div>
            <h1 className="text-lg font-bold tracking-tighter uppercase">KAIZEN</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              className="p-2 hover:bg-white/5 transition-colors"
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            {user?.image ? (
              <img src={user.image} alt="" className="w-7 h-7" />
            ) : (
              <div className="w-7 h-7 bg-white/10 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-4">
        {/* Status Card */}
        <div className="bg-[#0A0A0A] border border-white/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-mono text-green-500 uppercase font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                Active
              </p>
              <p className="text-xs text-gray-400 mt-1">
                Tracking focus for {user?.name || user?.email}
              </p>
            </div>
            <Activity className="w-5 h-5 text-green-500" />
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-[#0A0A0A] border border-white/10 p-3 flex flex-col items-center">
            <Eye className="w-4 h-4 text-gray-500 mb-1" />
            <p className="text-lg font-bold">{stats?.todayTexts || 0}</p>
            <p className="text-[9px] text-gray-500 uppercase">Texts</p>
          </div>
          <div className="bg-[#0A0A0A] border border-white/10 p-3 flex flex-col items-center">
            <BarChart3 className="w-4 h-4 text-gray-500 mb-1" />
            <p className="text-lg font-bold">{stats?.todayImages || 0}</p>
            <p className="text-[9px] text-gray-500 uppercase">Images</p>
          </div>
          <div className="bg-[#0A0A0A] border border-white/10 p-3 flex flex-col items-center">
            <Clock className="w-4 h-4 text-gray-500 mb-1" />
            <p className="text-lg font-bold">{stats?.todayAudio || 0}</p>
            <p className="text-[9px] text-gray-500 uppercase">Audio</p>
          </div>
        </div>

        {/* Info */}
        <div className="bg-[#0A0A0A] border border-white/10 p-4">
          <p className="text-xs text-gray-400">
            Kaizen is actively monitoring your browsing activity and tracking focus patterns. 
            View detailed analytics on the dashboard.
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={handleOpenDashboard}
          className="w-full py-3 bg-white text-black font-bold uppercase text-xs tracking-widest hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
        >
          Open Dashboard
          <ExternalLink className="w-3 h-3" />
        </button>

        <button
          onClick={handleUnlink}
          className="w-full py-2 bg-transparent border border-white/10 text-gray-400 font-medium uppercase text-[10px] tracking-widest hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
        >
          <LogOut className="w-3 h-3" />
          Unlink Account
        </button>
      </div>
    </div>
  )
}

export default SidePanel
