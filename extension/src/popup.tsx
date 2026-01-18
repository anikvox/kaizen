import { useEffect, useState, useCallback } from "react"
import { SERVER_URL } from "./default-settings"
import { ExternalLink, Loader2, Link2, LogOut, User } from "lucide-react"

import "./style.css"

const WEBSITE_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL?.replace('/dashboard', '') || 'http://localhost:3000'
const INSTALLATION_ID_KEY = "kaizen_installation_id"
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"

interface UserData {
  email: string
  name: string | null
  image: string | null
}

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

function IndexPopup() {
  const [isLoading, setIsLoading] = useState(true)
  const [isLinked, setIsLinked] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [installationId, setInstallationId] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    const id = await getOrCreateInstallationId()
    setInstallationId(id)

    // First check local storage for cached data
    const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    if (cached[DEVICE_TOKEN_KEY] && cached[USER_DATA_KEY]) {
      setIsLinked(true)
      setUser(cached[USER_DATA_KEY])
      setIsLoading(false)
      
      // Still verify with server in background
      const status = await checkDeviceStatus(id)
      if (!status.linked) {
        // Token was revoked, clear local data
        await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
        setIsLinked(false)
        setUser(null)
      } else if (status.user) {
        setUser(status.user)
        await chrome.storage.local.set({ [USER_DATA_KEY]: status.user })
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
      setIsLinked(true)
      setUser(status.user)
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
    const linkUrl = `${WEBSITE_URL}/link-extension?installationId=${installationId}`
    chrome.tabs.create({ url: linkUrl })
  }

  const handleUnlink = async () => {
    try {
      // Get the current device token to authenticate the unlink request
      const cached = await chrome.storage.local.get(DEVICE_TOKEN_KEY)
      const token = cached[DEVICE_TOKEN_KEY]
      
      if (token && installationId) {
        // Call server to delete the device token
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
    
    // Always clear local storage regardless of server response
    await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" })
    setIsLinked(false)
    setUser(null)
  }

  const handleOpenDashboard = () => {
    chrome.tabs.create({ url: `${WEBSITE_URL}/dashboard` })
    window.close()
  }

  if (isLoading) {
    return (
      <div className="p-6 min-w-[300px] bg-[#050505] text-white">
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 min-w-[300px] bg-[#050505] text-white">
      {isLinked ? (
        <div className="flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-white flex items-center justify-center">
                <div className="w-3 h-3 bg-black rotate-45" />
              </div>
              <h1 className="text-lg font-bold tracking-tighter uppercase">KAIZEN</h1>
            </div>
            <div className="flex items-center gap-2">
              {user?.image ? (
                <img src={user.image} alt="" className="w-7 h-7" />
              ) : (
                <div className="w-7 h-7 bg-white/10 flex items-center justify-center">
                  <User className="w-4 h-4 text-gray-400" />
                </div>
              )}
            </div>
          </div>
          
          <div className="bg-[#0A0A0A] border border-white/10 p-4">
            <p className="text-[10px] font-mono text-green-500 uppercase font-bold">Active</p>
            <p className="text-xs text-gray-400 mt-1">
              Linked as {user?.name || user?.email}
            </p>
          </div>

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
      ) : (
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="w-10 h-10 bg-white flex items-center justify-center mb-2">
            <div className="w-5 h-5 bg-black rotate-45" />
          </div>
          <h1 className="text-xl font-bold tracking-tighter uppercase">KAIZEN</h1>
          <p className="text-gray-400 text-sm text-center">
            Link your account to start tracking focus
          </p>
          <button 
            onClick={handleLinkAccount}
            className="w-full py-3 bg-white text-black font-bold uppercase text-xs tracking-widest hover:bg-gray-200 transition-colors flex items-center justify-center gap-2 group"
          >
            <Link2 className="w-3 h-3" />
            Link Account
            <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
          </button>
          <p className="text-[10px] text-gray-500 text-center">
            You'll be redirected to sign in on the website
          </p>
        </div>
      )}
    </div>
  )
}

export default IndexPopup
