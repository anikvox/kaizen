import { useEffect, useState, useCallback } from "react"
import { ChevronRight, Terminal, ExternalLink, Link2, LogOut, User, Loader2 } from "lucide-react"
import { SERVER_URL } from "./default-settings"

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
    if (!response.ok) throw new Error("Failed to check status")
    return await response.json()
  } catch (error) {
    console.error("Error checking device status:", error)
    return { linked: false, token: null, user: null }
  }
}

function IndexOptions() {
  const [isLoading, setIsLoading] = useState(true)
  const [isLinked, setIsLinked] = useState(false)
  const [user, setUser] = useState<UserData | null>(null)
  const [installationId, setInstallationId] = useState<string | null>(null)

  const checkStatus = useCallback(async () => {
    const id = await getOrCreateInstallationId()
    setInstallationId(id)

    const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    if (cached[DEVICE_TOKEN_KEY] && cached[USER_DATA_KEY]) {
      setIsLinked(true)
      setUser(cached[USER_DATA_KEY])
      setIsLoading(false)
      
      const status = await checkDeviceStatus(id)
      if (!status.linked) {
        await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
        setIsLinked(false)
        setUser(null)
      } else if (status.user) {
        setUser(status.user)
        await chrome.storage.local.set({ [USER_DATA_KEY]: status.user })
      }
      return
    }

    const status = await checkDeviceStatus(id)
    if (status.linked && status.token) {
      await chrome.storage.local.set({
        [DEVICE_TOKEN_KEY]: status.token,
        [USER_DATA_KEY]: status.user
      })
      chrome.runtime.sendMessage({ type: "SET_AUTH_TOKEN", token: status.token })
      setIsLinked(true)
      setUser(status.user)
    }
    
    setIsLoading(false)
  }, [])

  useEffect(() => {
    checkStatus()
    const interval = setInterval(checkStatus, 3000)
    return () => clearInterval(interval)
  }, [checkStatus])

  const handleLinkAccount = () => {
    if (!installationId) return
    const linkUrl = `${WEBSITE_URL}/link-extension?installationId=${installationId}`
    chrome.tabs.create({ url: linkUrl })
  }

  const handleUnlink = async () => {
    await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" })
    setIsLinked(false)
    setUser(null)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-white selection:text-black flex flex-col items-center justify-center p-8 relative overflow-hidden font-sans">
      {/* Background Grid Effect */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]" />

      <div className="relative z-10 w-full max-w-md">
        {isLinked ? (
          <div className="bg-[#0A0A0A] border border-white/10 p-10 text-center shadow-2xl">
            <div className="flex justify-center mb-8">
              <div className="p-1 bg-white">
                {user?.image ? (
                  <img src={user.image} alt="" className="w-12 h-12" />
                ) : (
                  <div className="w-12 h-12 bg-gray-200 flex items-center justify-center">
                    <User className="w-6 h-6 text-gray-500" />
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-8 h-8 bg-white flex items-center justify-center">
                <div className="w-4 h-4 bg-black rotate-45" />
              </div>
              <h1 className="text-3xl font-bold tracking-tighter uppercase">KAIZEN</h1>
            </div>
            
            <p className="text-gray-400 mb-2 leading-relaxed">
              Connected as <span className="text-white">{user?.name || user?.email}</span>
            </p>
            <p className="text-gray-500 text-sm mb-8">
              Your cognitive telemetry is now active and synchronizing.
            </p>
            
            <div className="bg-white/5 border border-white/10 p-6 mb-8 text-left">
              <div className="flex items-center gap-2 text-[10px] font-mono text-gray-500 mb-4 uppercase tracking-widest">
                <Terminal className="w-3 h-3" /> System_Status
              </div>
              <ul className="space-y-3 text-sm font-mono text-gray-300">
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-green-500 rounded-full" />
                  Device linked successfully
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-green-500 rounded-full" />
                  Attention tracking active
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1 h-1 bg-green-500 rounded-full" />
                  Telemetry sync enabled
                </li>
              </ul>
            </div>

            <button
              onClick={() => {
                const dashboardUrl = process.env.PLASMO_PUBLIC_DASHBOARD_URL || 'http://localhost:3000/dashboard'
                chrome.tabs.create({ url: dashboardUrl })
              }}
              className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group"
            >
              Go to Dashboard <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={handleUnlink}
              className="w-full mt-4 py-3 bg-transparent border border-white/10 text-gray-400 font-medium uppercase text-xs tracking-widest hover:bg-white/5 hover:text-white transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="w-3 h-3" />
              Unlink Account
            </button>
          </div>
        ) : (
          <>
            <div className="text-center mb-12">
              <div className="w-16 h-16 bg-white flex items-center justify-center mx-auto mb-6">
                <div className="w-8 h-8 bg-black rotate-45" />
              </div>
              <h1 className="text-5xl font-bold tracking-tighter uppercase mb-2">KAIZEN</h1>
              <p className="text-gray-500 uppercase tracking-[0.3em] text-[10px]">Master your digital focus</p>
            </div>
            
            <div className="bg-[#0A0A0A] border border-white/10 p-8 shadow-2xl text-center">
              <p className="text-gray-400 mb-6 leading-relaxed">
                Link your account on the Kaizen website. Your extension will be connected to your account automatically.
              </p>
              
              <button
                onClick={handleLinkAccount}
                className="w-full py-4 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-all flex items-center justify-center gap-2 group"
              >
                <Link2 className="w-4 h-4" />
                Link Account <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </button>
              
              <p className="mt-6 text-gray-600 text-[10px] uppercase tracking-widest">
                Extension syncs automatically after linking
              </p>
            </div>

            <p className="mt-8 text-center text-gray-600 text-[10px] uppercase tracking-widest">
              Powered by Gemini Nano
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default IndexOptions
