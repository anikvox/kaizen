import { useEffect, useState, useCallback } from "react"
import { ExternalLink, Loader2, Link2, LogOut, User } from "lucide-react"
import {
  ApiClient,
  DeviceTokenService,
  createAuthProvider
} from "@kaizen/api"

import "./style.css"

const DASHBOARD_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL?.replace('/dashboard', '') || 'http://localhost:60091'
const API_BASE_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"
const INSTALLATION_ID_KEY = "kaizen_installation_id"
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"

interface UserData {
  email: string
  name: string | null
  image: string | null
}

// Auth provider for authenticated requests (device token)
const extensionAuthProvider = createAuthProvider(async () => {
  try {
    const result = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
    return result[DEVICE_TOKEN_KEY] || null
  } catch {
    return null
  }
})

// API client for device token operations
const apiClient = new ApiClient({
  baseUrl: `${API_BASE_URL}`,
  authProvider: extensionAuthProvider
})

const deviceTokenService = new DeviceTokenService(apiClient)

// Generate a unique installation ID for this extension install
async function getOrCreateInstallationId(): Promise<string> {
  const result = await chrome.storage.local.get(INSTALLATION_ID_KEY)
  if (result[INSTALLATION_ID_KEY]) {
    return result[INSTALLATION_ID_KEY]
  }

  // Generate a new unique ID
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ [INSTALLATION_ID_KEY]: id })
  return id
}

// Check device token status from server
async function checkDeviceStatus(installationId: string): Promise<{
  linked: boolean
  token: string | null
  user: UserData | null
}> {
  try {
    const status = await deviceTokenService.getStatus(installationId)
    return {
      linked: status.linked,
      token: status.token || null,
      user: status.user ? {
        email: status.user.email,
        name: status.user.name,
        image: status.user.image || null
      } : null
    }
  } catch (error) {
    console.error("Error checking device status:", error)
    return { linked: false, token: null, user: null }
  }
}

function IndexPopup() {
  const [isLoading, setIsLoading] = useState(true)
  const [isLinked, setIsLinked] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [installationId, setInstallationId] = useState<string | null>(null)

  // Helper to send message and wait for async response
  const sendMessageAsync = (message: object): Promise<{ success: boolean; opened?: boolean }> => {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error("Message error:", chrome.runtime.lastError)
          resolve({ success: false })
        } else {
          resolve(response || { success: false })
        }
      })
    })
  }

  const openSidepanelAndClose = async () => {
    try {
      const response = await sendMessageAsync({ type: "OPEN_SIDEPANEL" })
      if (response?.opened) {
        // Sidepanel successfully opened, now we can close the popup
        window.close()
      } else {
        // Sidepanel failed to open, stay on popup and show fallback UI
        console.warn("Sidepanel did not open, showing fallback UI")
        setIsLoading(false)
        setIsLinked(true)
      }
    } catch (error) {
      console.error("Error opening sidepanel:", error)
      setIsLoading(false)
      setIsLinked(true)
    }
  }

  const checkStatus = useCallback(async () => {
    const id = await getOrCreateInstallationId()
    setInstallationId(id)

    // First check local storage for cached data
    const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    if (cached[DEVICE_TOKEN_KEY] && cached[USER_DATA_KEY]) {
      // User is already authenticated - verify with server first
      const status = await checkDeviceStatus(id)
      if (!status.linked) {
        // Token was revoked, clear local data
        await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
        chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
        setIsLoading(false)
      } else {
        // Token is valid - switch to sidepanel
        setUser(status.user)
        await openSidepanelAndClose()
      }
      return
    }

    // Check with server
    const status = await checkDeviceStatus(id)
    if (status.linked && status.token) {
      await chrome.storage.local.set({
        [DEVICE_TOKEN_KEY]: status.token,
        [USER_DATA_KEY]: status.user
      })
      // Notify background script
      chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token: status.token })
      // Notify about auth state change to switch to sidepanel mode
      chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: true })
      setIsLinked(true)
      setUser(status.user)

      // Wait for sidepanel to open before closing popup
      await openSidepanelAndClose()
      return
    }

    setIsLoading(false)
  }, [])

  useEffect(() => {
    checkStatus()

    // Poll for status changes (in case user links from website)
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [checkStatus])

  const handleLinkAccount = () => {
    if (!installationId) return
    const linkUrl = `${DASHBOARD_URL}/link-extension?installationId=${installationId}`
    chrome.tabs.create({ url: linkUrl })
  }

  const handleUnlink = async () => {
    try {
      // Get the current device token to authenticate the unlink request
      const cached = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
      const token = cached[DEVICE_TOKEN_KEY]

      if (token) {
        // Call server to delete the device token (server identifies device by token)
        await deviceTokenService.unlink()
      }
    } catch (error) {
      console.error("Error unlinking from server:", error)
    }

    // Always clear local storage regardless of server response
    await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" })
    chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
    setIsLinked(false)
    setUser(null)
  }

  const handleOpenDashboard = () => {
    chrome.tabs.create({ url: `${DASHBOARD_URL}/dashboard` })
    window.close()
  }

  if (isLoading) {
    return (
      <div className="p-6 min-w-[340px] bg-gradient-to-br from-[#050505] via-[#0a0a0a] to-[#050505] text-white rounded-lg overflow-hidden">
        <div className="flex flex-col items-center gap-6 py-8">
          {/* Animated logo skeleton */}
          <div className="relative">
            <div className="absolute inset-0 bg-blue-600/20 blur-2xl rounded-full animate-pulse" />
            <div className="relative w-14 h-14 bg-gradient-to-br from-blue-500/20 to-blue-700/20 flex items-center justify-center rounded-xl border border-blue-500/20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            </div>
          </div>
          
          {/* Loading text */}
          <div className="flex flex-col items-center gap-2">
            <div className="h-6 w-32 bg-white/5 rounded animate-pulse" />
            <div className="h-4 w-48 bg-white/5 rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-w-[340px] bg-gradient-to-br from-[#050505] via-[#0a0a0a] to-[#050505] text-white rounded-lg overflow-hidden">
      {isLinked ? (
        // Fallback UI for authenticated users if sidepanel can't open
        <div className="flex flex-col gap-5 animate-in fade-in duration-300">
          {/* Header with logo and user */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center rounded-lg shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-blue-500/50 hover:scale-105">
                <div className="w-4 h-4 bg-white rotate-45 rounded-sm" />
              </div>
              <h1 className="text-lg font-bold tracking-tighter uppercase bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
                KAIZEN
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {user?.image ? (
                <img 
                  src={user.image} 
                  alt="" 
                  className="w-8 h-8 rounded-full border-2 border-white/10 ring-2 ring-blue-500/20 transition-all duration-300 hover:ring-blue-500/40 hover:scale-105" 
                />
              ) : (
                <div className="w-8 h-8 bg-gradient-to-br from-white/10 to-white/5 rounded-full flex items-center justify-center border border-white/10 transition-all duration-300 hover:border-white/20">
                  <User className="w-4 h-4 text-gray-400" />
                </div>
              )}
            </div>
          </div>

          {/* Status card with glassmorphism */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-lg blur-sm group-hover:blur-md transition-all duration-300" />
            <div className="relative bg-gradient-to-br from-[#0A0A0A] to-[#0f0f0f] border border-white/10 rounded-lg p-4 backdrop-blur-sm transition-all duration-300 hover:border-green-500/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500 shadow-lg shadow-green-500/50"></span>
                </span>
                <p className="text-[11px] font-mono text-green-400 uppercase font-bold tracking-wider">Active</p>
              </div>
              <p className="text-sm text-gray-300 font-medium mb-1">
                {user?.name || user?.email}
              </p>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Click the extension icon on any webpage to open the side panel
              </p>
            </div>
          </div>

          {/* Primary action button */}
          <button
            onClick={handleOpenDashboard}
            className="relative w-full py-3.5 bg-white text-black font-bold rounded-lg uppercase text-xs tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group overflow-hidden hover:shadow-lg hover:shadow-white/20 hover:scale-[1.02] active:scale-[0.98]"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            <span className="relative flex items-center gap-2">
              Open Dashboard
              <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
            </span>
          </button>

          {/* Secondary action button */}
          <button
            onClick={handleUnlink}
            className="w-full py-3 bg-transparent border border-white/10 text-gray-400 font-medium rounded-lg uppercase text-[10px] tracking-widest transition-all duration-300 flex items-center justify-center gap-2 group hover:bg-red-500/5 hover:border-red-500/30 hover:text-red-400"
          >
            <LogOut className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform duration-300" />
            Unlink Account
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 py-4 animate-in fade-in duration-300">
          {/* Logo with enhanced glow effect */}
          <div className="relative group">
            <div className="absolute inset-0 bg-blue-600/30 blur-2xl rounded-full group-hover:bg-blue-500/40 transition-all duration-500" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center rounded-xl shadow-xl shadow-blue-500/40 transition-all duration-500 group-hover:shadow-blue-500/60 group-hover:scale-110 group-hover:rotate-3">
              <div className="w-8 h-8 bg-white rotate-45 rounded-sm transition-transform duration-500 group-hover:rotate-[50deg]" />
            </div>
          </div>

          {/* Title and description */}
          <div className="flex flex-col items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tighter uppercase bg-gradient-to-r from-white via-gray-200 to-gray-400 bg-clip-text text-transparent">
              KAIZEN
            </h1>
            <p className="text-gray-400 text-sm text-center max-w-[260px] leading-relaxed">
              Link your account to start tracking focus and unlock insights
            </p>
          </div>

          {/* Link button with enhanced styling */}
          <button
            onClick={handleLinkAccount}
            className="relative w-full py-4 bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600 bg-size-200 bg-pos-0 text-white font-bold rounded-lg uppercase text-xs tracking-widest transition-all duration-500 flex items-center justify-center gap-2 group shadow-xl shadow-blue-600/40 hover:shadow-blue-500/60 hover:bg-pos-100 hover:scale-[1.03] active:scale-[0.97] overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
            <span className="relative flex items-center gap-2">
              <Link2 className="w-4 h-4 group-hover:rotate-12 transition-transform duration-300" />
              Link Account
              <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
            </span>
          </button>

          {/* Footer note with better styling */}
          <div className="flex items-center gap-2.5 text-[10px] text-gray-500 text-center px-4">
            <div className="w-1 h-1 bg-gray-600 rounded-full animate-pulse" />
            <p className="font-medium">Secure authentication via Clerk</p>
            <div className="w-1 h-1 bg-gray-600 rounded-full animate-pulse" />
          </div>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
