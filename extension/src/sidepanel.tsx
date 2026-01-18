import { useEffect, useState, useCallback } from "react"
import { SERVER_URL } from "./default-settings"
import { ExternalLink, Loader2, LogOut, User, RefreshCw, FileText, Activity, TrendingUp, Clock } from "lucide-react"
import { 
  FocusSection, 
  PulseSection, 
  ChatWindow, 
  Button,
  Card,
  CardHeader
} from "@kaizen/ui"

import "./style.css"

const WEBSITE_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL?.replace('/dashboard', '') || 'http://localhost:60091'
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"

interface UserData {
  email: string
  name: string | null
  image: string | null
}

const DUMMY_PULSE = [
  {
    id: "1",
    type: "text",
    content: "Reviewing Historical landmarks - Wikipedia",
    timestamp: "Just now",
    icon: FileText
  },
  {
    id: "2",
    type: "focus",
    content: "Deep work session started",
    timestamp: "2m ago",
    icon: TrendingUp
  }
];

const DUMMY_CHATS = [
  {
    id: "1",
    role: "user" as const,
    content: "what am I focused on?",
    timestamp: "12:45"
  },
  {
    id: "2",
    role: "assistant" as const,
    content: "You're currently exploring historical landmarks. Your focus score is high (88/100).",
    timestamp: "12:46"
  }
];

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
      const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY, USER_DATA_KEY, "kaizen_installation_id"])
      const installationId = cached["kaizen_installation_id"]
      
      if (cached[DEVICE_TOKEN_KEY] && cached[USER_DATA_KEY]) {
        setIsLinked(true)
        setUser(cached[USER_DATA_KEY])
        setIsLoading(false)
        
        if (installationId) {
          const status = await checkDeviceStatus(installationId)
          if (!status.linked) {
            await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY])
            setIsLinked(false)
            setUser(null)
            chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
          } else if (status.user) {
            setUser(status.user)
            await chrome.storage.local.set({ [USER_DATA_KEY]: status.user })
          }
        }
        return
      }

      setIsLinked(false)
      setIsLoading(false)
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
    
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes[DEVICE_TOKEN_KEY]) {
        if (!changes[DEVICE_TOKEN_KEY].newValue) {
          setIsLinked(false)
          setUser(null)
          chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false })
        }
      }
    }
    
    chrome.storage.local.onChanged.addListener(handleStorageChange)
    const interval = setInterval(checkStatus, 30000)
    
    return () => {
      clearInterval(interval)
      chrome.storage.local.onChanged.removeListener(handleStorageChange)
    }
  }, [checkStatus])

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
      <div className="min-h-screen bg-[#050505] text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 bg-white flex items-center justify-center mb-6">
          <div className="w-6 h-6 bg-black rotate-45" />
        </div>
        <h1 className="text-xl font-bold tracking-tighter uppercase mb-2">KAIZEN</h1>
        <p className="text-gray-400 text-sm mb-4">
          Session expired or account unlinked
        </p>
        <p className="text-gray-500 text-[10px] uppercase font-mono tracking-widest">
          Click the extension icon to re-link
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 bg-[#050505]/80 backdrop-blur-md border-b border-white/10 p-4 z-50">
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
              <img src={user.image} alt="" className="w-7 h-7 border border-white/10" />
            ) : (
              <div className="w-7 h-7 bg-white/10 border border-white/10 flex items-center justify-center">
                <User className="w-4 h-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
        <FocusSection 
          title="Historical landmarks"
          elapsedTime="00:05:06"
          category="DEEP WORK"
          summary="Your tree thrives as your focus grows, keep nurturing it!"
          isLive={true}
          inferredParams={[
            { label: "Cognitive Load", value: "Balanced" },
            { label: "Attention", value: "Focused" }
          ]}
        />

        <PulseSection 
           title="Live Activity"
           items={DUMMY_PULSE} 
        />

        <ChatWindow 
           messages={DUMMY_CHATS} 
           onSend={() => {}} 
           className="h-[400px]"
        />

        <div className="grid grid-cols-3 gap-2">
           <Card className="p-2 flex flex-col items-center">
              <span className="text-xs font-bold">{stats?.todayTexts || 0}</span>
              <span className="text-[8px] text-gray-500 uppercase">Texts</span>
           </Card>
           <Card className="p-2 flex flex-col items-center">
              <span className="text-xs font-bold">{stats?.todayImages || 0}</span>
              <span className="text-[8px] text-gray-500 uppercase">Images</span>
           </Card>
           <Card className="p-2 flex flex-col items-center">
              <span className="text-xs font-bold">{stats?.todayAudio || 0}</span>
              <span className="text-[8px] text-gray-500 uppercase">Audio</span>
           </Card>
        </div>

        <div className="pt-4 space-y-2">
          <Button
            onClick={handleOpenDashboard}
            className="w-full"
          >
            Open Dashboard
            <ExternalLink className="w-3 h-3" />
          </Button>

          <Button
            onClick={handleUnlink}
            variant="outline"
            className="w-full"
          >
            <LogOut className="w-3 h-3" />
            Unlink Account
          </Button>
        </div>
      </div>
    </div>
  )
}

export default SidePanel
