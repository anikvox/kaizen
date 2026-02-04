import { useLiveQuery } from "~hooks/useLiveQuery"
import {
  Award,
  BarChart3,
  Coffee,
  Compass,
  Flame,
  // HelpCircle,
  LayoutDashboard,
  Lightbulb,
  Link2Off,
  LogOut,
  Pause,
  Play,
  Target,
  Timer,
  Trophy,
  X
} from "lucide-react"
import React, { useCallback, useEffect, useMemo, useState } from "react"

import { Storage } from "@plasmohq/storage"
import {
  ApiClient,
  DeviceTokenService,
  createAuthProvider
} from "@kaizen/api"

import db, { type Focus, type PomodoroState } from "~db"
import { INTENT_QUEUE_NOTIFY } from "~default-settings"

import { parseFocus, type FocusWithParsedData } from "./sidepanel-api/focus"
import { getPomodoroState, togglePomodoro } from "./sidepanel-api/pomodoro"
import { getWinsData } from "./sidepanel-api/wins"
import { IntentsTab } from "./sidepanel-components/IntentsTab"
import { TreeAnimationSection } from "./sidepanel-components/TreeAnimationSection"
import type { WinItem } from "./sidepanel-types/wins"

import "./sidepanel.css"

import type { Intent } from "~background/messages/intent"

import { Chat } from "./sidepanel-chat"
import { chatService } from "~chat"
import { themeManager, type Theme } from "~theme-manager"

type TabType = "focus" | "insights" | "explore" | "intents"

const generateChatId = () =>
  `chat-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`

const storage = new Storage()
const DEVICE_TOKEN_KEY = "kaizen_device_token"
const USER_DATA_KEY = "kaizen_user_data"
const INSTALLATION_ID_KEY = "kaizen_installation_id"
const API_BASE_URL = process.env.PLASMO_PUBLIC_SERVER_URL || "http://localhost:60092"

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
  baseUrl: `${API_BASE_URL}/api`,
  authProvider: extensionAuthProvider
})

const deviceTokenService = new DeviceTokenService(apiClient)

// Frontend dashboard URL (separate from backend API)
const DASHBOARD_URL = process.env.PLASMO_PUBLIC_DASHBOARD_URL || "http://localhost:60091/dashboard"

const Popup = () => {
  console.log("Popup component rendering")

  const [activeTab, setActiveTab] = useState<TabType>("focus")
  const [focusData, setFocusData] = useState<FocusWithParsedData | null>(null)
  const [currentChatId, setCurrentChatId] = useState<string>("")
  const [isDeviceLinked, setIsDeviceLinked] = useState<boolean | null>(null)
  const [showRevokeModal, setShowRevokeModal] = useState(false)
  const [isPomodoroExpanded, setIsPomodoroExpanded] = useState(true)
  const [theme, setTheme] = useState<Theme>("system")
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

  // Notify background script that sidepanel has opened
  useEffect(() => {
    console.log("[Sidepanel] Mounted - notifying background script")
    chrome.runtime.sendMessage({ type: "SIDEPANEL_MOUNTED" }).catch((err) => {
      console.log("[Sidepanel] Could not notify background:", err)
    })
  }, [])

  // Initialize and sync theme (listen-only, no toggle button)
  useEffect(() => {
    const initTheme = async () => {
      const currentTheme = await themeManager.getTheme()
      console.log("[Sidepanel] Initial theme:", currentTheme)
      setTheme(currentTheme)
      const resolved = themeManager.getResolvedTheme(currentTheme)
      console.log("[Sidepanel] Resolved theme:", resolved)
      setResolvedTheme(resolved)
      
      // Apply theme class to document
      if (resolved === "dark") {
        document.documentElement.classList.add("dark")
        console.log("[Sidepanel] Applied dark class")
      } else {
        document.documentElement.classList.remove("dark")
        console.log("[Sidepanel] Removed dark class")
      }
    }

    initTheme()

    // Subscribe to theme changes from frontend
    const unsubscribe = themeManager.subscribe((newTheme) => {
      console.log("[Sidepanel] Theme changed to:", newTheme)
      setTheme(newTheme)
      const resolved = themeManager.getResolvedTheme(newTheme)
      console.log("[Sidepanel] New resolved theme:", resolved)
      setResolvedTheme(resolved)
      
      // Apply theme class to document
      if (resolved === "dark") {
        document.documentElement.classList.add("dark")
        console.log("[Sidepanel] Applied dark class")
      } else {
        document.documentElement.classList.remove("dark")
        console.log("[Sidepanel] Removed dark class")
      }
    })

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleSystemThemeChange = () => {
      if (theme === "system") {
        const resolved = themeManager.getResolvedTheme("system")
        console.log("[Sidepanel] System theme changed, resolved:", resolved)
        setResolvedTheme(resolved)
        
        if (resolved === "dark") {
          document.documentElement.classList.add("dark")
        } else {
          document.documentElement.classList.remove("dark")
        }
      }
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange)

    return () => {
      unsubscribe()
      mediaQuery.removeEventListener("change", handleSystemThemeChange)
    }
  }, [theme])

  const focusDataDex = useLiveQuery(() => {
    return db.table<Focus>("focus").toArray()
  }, [])

  useEffect(() => {
    if (!focusDataDex || focusDataDex.length === 0) {
      setFocusData(null)
      return
    }

    let interval: number | null = null

    const currentFocus = [...focusDataDex].sort(
      (a, b) => b.last_updated - a.last_updated
    )[0]

    console.log(currentFocus)

    // Check if the focus session is currently active
    const lastSession =
      currentFocus.time_spent[currentFocus.time_spent.length - 1]
    const isActive = lastSession && lastSession.end === null

    if (isActive) {
      // Only set focusData if there's an active session
      const parsedFocus = parseFocus(currentFocus)
      setFocusData(parsedFocus)
      updateTimeSpent(parsedFocus)

      // update the time spent every second
      interval = setInterval(() => {
        updateTimeSpent(parseFocus(currentFocus))
      }, 1000) as unknown as number
    } else {
      // No active session, clear focusData
      setFocusData(null)
    }

    return () => {
      if (interval) {
        clearInterval(interval)
      }
    }
  }, [focusDataDex])

  const [wins, setWins] = useState<WinItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [pomodoroState, setPomodoroState] = useState<PomodoroState>({
    id: "current",
    isActive: false,
    remainingTime: 1500,
    state: "idle",
    startTime: null,
    totalPomodoros: 0,
    lastUpdated: Date.now()
  })

  // Watch for intent queue changes and switch to Learning tab
  useEffect(() => {
    storage.watch({
      [INTENT_QUEUE_NOTIFY.key]: async () => {
        // check if latest intent is a chat
        const iq = await db
          .table<Intent>("intentQueue")
          .orderBy("timestamp")
          .reverse()
          .toArray()

        const unprocessed = (iq as any[])?.filter((i) => i.processed === false)

        if (
          unprocessed &&
          unprocessed.length > 0 &&
          unprocessed[0].type !== "chat" &&
          unprocessed[0].name !== "chat-with-this-page"
        ) {
          setActiveTab("intents")
        } else if (
          unprocessed &&
          unprocessed.length > 0 &&
          unprocessed[0].type === "chat" &&
          unprocessed[0].name === "chat-with-this-page"
        ) {
          setActiveTab("focus")
        }
      }
    })
  }, [])
  const [formattedFocusTime, setFormattedFocusTime] = useState("00:00:00")

  const updateTimeSpent = (focusData: FocusWithParsedData) => {
    const totalTime = focusData.total_time
    const hours = Math.floor(totalTime / 3600000)
    const minutes = Math.floor((totalTime % 3600000) / 60000)
    const seconds = Math.floor((totalTime % 60000) / 1000)
    const strxx = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`

    setFormattedFocusTime(strxx)
  }

  // Check device link status on mount
  useEffect(() => {
    const checkDeviceLink = async () => {
      const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY])
      setIsDeviceLinked(!!cached[DEVICE_TOKEN_KEY])
    }
    checkDeviceLink()
  }, [])

  // Fetch data on mount
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true)
      try {
        const [winsData] = await Promise.all([getWinsData()])

        setWins(winsData)

        console.log("currentFocus", winsData)

        // Fetch pomodoro state separately with error handling
        try {
          const pomodoro = await getPomodoroState()
          if (pomodoro) {
            setPomodoroState(pomodoro)
          }
        } catch (pomodoroError) {
          console.error("Error fetching pomodoro state:", pomodoroError)
        }
        // Initialize chat session - use most recent session or create new one
        try {
          const sessions = await chatService.getSessions()
          if (sessions.length > 0) {
            // Use the most recent session
            console.log("[Sidepanel] Using most recent session:", sessions[0].id)
            setCurrentChatId(sessions[0].id)
          } else {
            // No sessions exist, create a new one
            const newSession = await chatService.createSession("New Chat")
            if (newSession) {
              console.log("[Sidepanel] Created new session:", newSession.id)
              setCurrentChatId(newSession.id)
            } else {
              setCurrentChatId(generateChatId())
            }
          }
        } catch (chatError) {
          console.error("Error initializing chat session:", chatError)
          setCurrentChatId(generateChatId())
        }
      } catch (error) {
        console.error("Error fetching data:", error)
      } finally {
        console.log(`Initial data Loaded...`)
        setIsLoading(false)
      }
    }

    fetchData()
  }, [])
  
  // Poll for session updates to stay in sync with dashboard
  // Only switch to a new session if it was created externally (not by this sidepanel)
  useEffect(() => {
    let lastKnownSessionCount = 0
    
    const sessionPollInterval = setInterval(async () => {
      try {
        const sessions = await chatService.getSessions()
        
        // Only switch if a new session was created externally (session count increased)
        // and we don't have a current chat selected
        if (sessions.length > lastKnownSessionCount && !currentChatId) {
          console.log(`[Sidepanel] New session detected externally, switching to: ${sessions[0].id}`)
          setCurrentChatId(sessions[0].id)
        }
        
        lastKnownSessionCount = sessions.length
      } catch (error) {
        console.error("Error polling sessions:", error)
      }
    }, 3000)
    
    return () => {
      clearInterval(sessionPollInterval)
    }
  }, [currentChatId])

  // Poll pomodoro state every second
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const state = await getPomodoroState()
        if (state) {
          setPomodoroState(state)
        }
      } catch (error) {
        console.error("Error fetching pomodoro state:", error)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const handlePomodoroToggle = useCallback(async () => {
    try {
      const newState = await togglePomodoro()
      if (newState) {
        setPomodoroState(newState)
      }
    } catch (error) {
      console.error("Error toggling pomodoro:", error)
    }
  }, [])

  const getWinIcon = useCallback((type: string) => {
    switch (type) {
      case "milestone":
        return <Trophy className="w-4 h-4 text-yellow-600" />
      case "streak":
        return <Flame className="w-4 h-4 text-orange-600" />
      case "achievement":
        return <Award className="w-4 h-4 text-blue-600" />
      default:
        return <Trophy className="w-4 h-4 text-gray-600" />
    }
  }, [])

  const formattedPomodoroTime = useMemo(() => {
    if (!pomodoroState) {
      return "25:00"
    }
    const minutes = Math.floor(pomodoroState.remainingTime / 60)
    const seconds = pomodoroState.remainingTime % 60
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }, [pomodoroState])

  const handleNewChatRequest = useCallback(async () => {
    try {
      console.log("[Sidepanel] Creating new chat session...")
      const newSession = await chatService.createSession("New Chat")
      if (newSession) {
        console.log("[Sidepanel] New session created:", newSession.id)
        setCurrentChatId(newSession.id)
      } else {
        console.log("[Sidepanel] Failed to create session, using local ID")
        setCurrentChatId(generateChatId())
      }
    } catch (error) {
      console.error("Error creating new chat:", error)
      setCurrentChatId(generateChatId())
    }
  }, [])

  const handleRevokeToken = useCallback(async () => {
    try {
      // Get the current device token
      const cached = await chrome.storage.local.get([DEVICE_TOKEN_KEY])
      const token = cached[DEVICE_TOKEN_KEY]

      if (token) {
        // Call server to delete the device token
        await deviceTokenService.unlink()
      }
    } catch (error) {
      console.error("Error revoking device token:", error)
    }

    // Always clear local storage regardless of server response
    await chrome.storage.local.remove([DEVICE_TOKEN_KEY, USER_DATA_KEY, INSTALLATION_ID_KEY])
    
    // Send messages to background script
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" }).catch(err => console.log("Message error:", err))
    chrome.runtime.sendMessage({ type: "AUTH_STATE_CHANGED", isAuthenticated: false }).catch(err => console.log("Message error:", err))

    // Update local state immediately
    setIsDeviceLinked(false)
    setShowRevokeModal(false)

    // Close the sidepanel after a brief delay to show the unlinked state
    setTimeout(() => {
      window.close()
    }, 500)
  }, [])

  const renderFocusTab = () => {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Chat
          chatId={currentChatId}
          isNewChat={true}
          onChatCreated={(id) => setCurrentChatId(id)}
          onNewChatRequested={handleNewChatRequest}
        />
      </div>
    )
  }

  const activitySummaries = useLiveQuery(async () => {
    const summaries = await db
      .table<any>("activitySummary")
      .orderBy("timestamp")
      .reverse()
      .toArray()
    return summaries.slice(0, 5)
  }, [])

  const renderInsightsTab = () => {
    return (
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Refresher Quiz Section */}
        <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100/80 dark:bg-purple-900/40 backdrop-blur-sm rounded-lg border border-purple-200/50 dark:border-purple-800/50">
              <Award className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Refresher Quiz
            </h3>
          </div>
          {focusDataDex && focusDataDex.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                You've learnt a lot recently... let's take a refresher! 🧠
              </p>
              <button
                onClick={() => {
                  chrome.tabs.create({ url: DASHBOARD_URL })
                }}
                className="w-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg">
                Start Refresher Quiz
              </button>
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 text-center py-2">
              <p className="mb-2">
                It will get active once you've enough focus 😔
              </p>
              <p className="text-xs italic">
                Complete some focus sessions to unlock the quiz
              </p>
            </div>
          )}
        </div>

        {/* Activity Summaries Section */}
        <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100/80 dark:bg-blue-900/40 backdrop-blur-sm rounded-lg border border-blue-200/50 dark:border-blue-800/50">
              <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Activity Summaries
            </h3>
          </div>
          {activitySummaries && activitySummaries.length > 0 ? (
            <div className="space-y-3">
              {activitySummaries.map((summary, index) => (
                <div
                  key={index}
                  className="bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm p-4 rounded-lg border border-gray-300/50 dark:border-slate-500/50 shadow-md">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                    {summary.summary}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(summary.timestamp).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="mb-2">No activity summaries yet</p>
              <p className="text-xs italic">
                Start browsing to see AI-powered insights
              </p>
            </div>
          )}
        </div>

        {/* Focus History Section */}
        <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-sm rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100/80 dark:bg-green-900/40 backdrop-blur-sm rounded-lg border border-green-200/50 dark:border-green-800/50">
              <Target className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Recent Focus Sessions
            </h3>
          </div>
          {focusDataDex && focusDataDex.length > 0 ? (
            <div className="space-y-2">
              {focusDataDex.slice(0, 5).map((focus) => {
                const parsed = parseFocus(focus)
                return (
                  <div
                    key={focus.id}
                    className="bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm p-3 rounded-lg border border-gray-300/50 dark:border-slate-500/50 shadow-md">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {focus.item}
                      </p>
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                        {Math.floor(parsed.total_time / 3600000)}h{" "}
                        {Math.floor((parsed.total_time % 3600000) / 60000)}m
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400">
              <p className="mb-2">No focus sessions yet</p>
              <p className="text-xs italic">
                Start focusing to track your learning journey
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  const renderExploreTab = () => {
    return (
      <div className="flex-1 overflow-y-auto p-2 space-y-4">
        {/* Wins Section */}
        <div className="bg-white/40 dark:bg-slate-700/40 backdrop-blur-xs rounded-xl border border-gray-300/50 dark:border-slate-600/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-yellow-100/80 dark:bg-yellow-900/40 backdrop-blur-sm rounded-lg border border-yellow-200/50 dark:border-yellow-800/50">
              <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
            </div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">
              Wins
            </h3>
          </div>
          {wins.length === 0 ? (
            <div className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
              No wins yet. Keep focusing to unlock achievements!
            </div>
          ) : (
            <div className="space-y-3">
              {wins.map((win, index) => (
                <div
                  key={win.id}
                  className="flex items-center gap-3 bg-white/50 dark:bg-slate-600/40 backdrop-blur-sm px-4 py-3 rounded-lg border border-gray-300/50 dark:border-slate-500/50 hover:shadow-lg hover:border-gray-400/60 dark:hover:border-slate-400/60 transition-all"
                  style={{ animationDelay: `${index * 100}ms` }}>
                  {getWinIcon(win.type)}
                  <div className="flex-1">
                    <p className="font-bold text-gray-900 dark:text-white text-sm">
                      {win.focusItem}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {win.text}
                    </p>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 font-mono text-xs">
                    {Math.floor(win.totalTimeSpent / 60000)}:
                    {((win.totalTimeSpent % 60000) / 1000)
                      .toString()
                      .padStart(2, "0")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Milestones Section */}
        {(() => {
          const milestones = [
            { 
              label: "First Focus", 
              time: 7, 
              icon: "🌱",
              color: "emerald" as const,
              achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 7 * 60 * 1000),
              currentProgress: focusDataDex && focusDataDex.length > 0 
                ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
                : 0
            },
            { 
              label: "Deep Work", 
              time: 25, 
              icon: "🎯",
              color: "blue" as const,
              achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 25 * 60 * 1000),
              currentProgress: focusDataDex && focusDataDex.length > 0 
                ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
                : 0
            },
            { 
              label: "Flow State", 
              time: 60, 
              icon: "🧘",
              color: "purple" as const,
              achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 60 * 60 * 1000),
              currentProgress: focusDataDex && focusDataDex.length > 0 
                ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
                : 0
            },
            { 
              label: "Master", 
              time: 120, 
              icon: "⚡",
              color: "amber" as const,
              achieved: focusDataDex && focusDataDex.some(f => parseFocus(f).total_time >= 120 * 60 * 1000),
              currentProgress: focusDataDex && focusDataDex.length > 0 
                ? Math.max(...focusDataDex.map(f => parseFocus(f).total_time)) 
                : 0
            }
          ];

          const achievedCount = milestones.filter(m => m.achieved).length;

          return (
            <div className="relative bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-xl border border-gray-200/60 dark:border-slate-700/60 p-5 shadow-sm">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-purple-100/70 dark:bg-purple-900/30 rounded-lg">
                    <Award className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                      Milestones
                    </h3>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {achievedCount} of 4 achieved
                    </p>
                  </div>
                </div>
              </div>

              {/* Milestone Grid */}
              <div className="grid grid-cols-2 gap-3">
                {milestones.map((milestone, index) => {
                  const colorClasses = {
                    emerald: {
                      bg: milestone.achieved ? "bg-emerald-50/80 dark:bg-emerald-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
                      border: milestone.achieved ? "border-emerald-200/60 dark:border-emerald-800/40" : "border-gray-200/40 dark:border-slate-700/40",
                      text: milestone.achieved ? "text-emerald-700 dark:text-emerald-300" : "text-gray-400 dark:text-gray-500",
                      badge: milestone.achieved ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600",
                      progress: "bg-emerald-500",
                      icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
                    },
                    blue: {
                      bg: milestone.achieved ? "bg-blue-50/80 dark:bg-blue-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
                      border: milestone.achieved ? "border-blue-200/60 dark:border-blue-800/40" : "border-gray-200/40 dark:border-slate-700/40",
                      text: milestone.achieved ? "text-blue-700 dark:text-blue-300" : "text-gray-400 dark:text-gray-500",
                      badge: milestone.achieved ? "bg-blue-500" : "bg-gray-300 dark:bg-slate-600",
                      progress: "bg-blue-500",
                      icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
                    },
                    purple: {
                      bg: milestone.achieved ? "bg-purple-50/80 dark:bg-purple-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
                      border: milestone.achieved ? "border-purple-200/60 dark:border-purple-800/40" : "border-gray-200/40 dark:border-slate-700/40",
                      text: milestone.achieved ? "text-purple-700 dark:text-purple-300" : "text-gray-400 dark:text-gray-500",
                      badge: milestone.achieved ? "bg-purple-500" : "bg-gray-300 dark:bg-slate-600",
                      progress: "bg-purple-500",
                      icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
                    },
                    amber: {
                      bg: milestone.achieved ? "bg-amber-50/80 dark:bg-amber-900/20" : "bg-gray-50/50 dark:bg-slate-800/30",
                      border: milestone.achieved ? "border-amber-200/60 dark:border-amber-800/40" : "border-gray-200/40 dark:border-slate-700/40",
                      text: milestone.achieved ? "text-amber-700 dark:text-amber-300" : "text-gray-400 dark:text-gray-500",
                      badge: milestone.achieved ? "bg-amber-500" : "bg-gray-300 dark:bg-slate-600",
                      progress: "bg-amber-500",
                      icon: milestone.achieved ? "opacity-100" : "opacity-30 grayscale"
                    }
                  };

                  const colors = colorClasses[milestone.color];
                  
                  // Calculate progress percentage
                  const targetTime = milestone.time * 60 * 1000;
                  const progressPercent = milestone.achieved 
                    ? 100 
                    : Math.min((milestone.currentProgress / targetTime) * 100, 100);
                  
                  return (
                    <div
                      key={index}
                      className={`relative ${colors.bg} ${colors.border} border rounded-lg p-3.5 transition-all duration-300 ${
                        milestone.achieved ? "hover:shadow-md" : ""
                      }`}>
                      
                      {/* Achievement indicator */}
                      {milestone.achieved && (
                        <div className="absolute top-2 right-2">
                          <div className={`w-1.5 h-1.5 ${colors.badge} rounded-full`} />
                        </div>
                      )}
                      
                      {/* Icon */}
                      <div className={`text-3xl mb-2 transition-all duration-300 ${colors.icon}`} style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif' }}>
                        {milestone.icon}
                      </div>
                      
                      {/* Content */}
                      <div>
                        <h4 className={`text-xs font-semibold mb-1 ${
                          milestone.achieved 
                            ? "text-gray-900 dark:text-white" 
                            : "text-gray-500 dark:text-gray-400"
                        }`}>
                          {milestone.label}
                        </h4>
                        
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[10px] font-medium ${colors.text}`}>
                            {milestone.time} min
                          </span>
                          {milestone.achieved && (
                            <Award className={`w-3 h-3 ${colors.text}`} />
                          )}
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-gray-200/50 dark:bg-slate-700/50 rounded-full h-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              milestone.achieved 
                                ? colors.progress 
                                : progressPercent > 0 
                                  ? colors.progress + " opacity-60"
                                  : "bg-gray-300 dark:bg-slate-600"
                            }`}
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        {/* Progress text for incomplete milestones */}
                        {!milestone.achieved && progressPercent > 0 && (
                          <p className="text-[9px] text-gray-500 dark:text-gray-400 mt-1">
                            {Math.floor(milestone.currentProgress / 60000)} / {milestone.time} min
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Progress Summary */}
              <div className="mt-4 pt-3 border-t border-gray-200/50 dark:border-slate-700/50">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    Continue focusing to unlock more
                  </span>
                  <div className="flex gap-1">
                    {milestones.map((milestone, i) => (
                      <div
                        key={i}
                        className={`w-1 h-1 rounded-full transition-colors duration-300 ${
                          milestone.achieved ? "bg-purple-500" : "bg-gray-300 dark:bg-slate-600"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    )
  }

  if (isLoading || isDeviceLinked === null) {
    return (
      <div className="w-full h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-900 dark:to-slate-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  // Show device not linked page if user is not authenticated
  if (isDeviceLinked === false) {
    return (
      <div className="h-screen w-full bg-white relative overflow-hidden">
        {/* Enhanced background with subtle animation */}
        <div
          className="absolute inset-0 z-0"
          style={{
            backgroundImage: `
              radial-gradient(125% 125% at 50% 90%, #ffffff 50%, #10b981 100%)
            `,
            backgroundSize: "100% 100%",
            filter: "hue-rotate(60deg)"
          }}
        />
        
        {/* Subtle decorative elements */}
        <div className="absolute top-20 right-10 w-64 h-64 bg-emerald-200/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 left-10 w-80 h-80 bg-blue-200/10 rounded-full blur-3xl" />

        <div className="relative z-10 flex items-center justify-center h-full px-4 py-6">
          <div className="max-w-md w-full">
            {/* Logo - more compact */}
            <div className="flex justify-center mb-6">
              <img
                src={chrome.runtime.getURL("assets/logo_NPxx.png")}
                className="w-20 bg-transparent opacity-90"
                alt="Kaizen"
              />
            </div>

            {/* Main card with enhanced styling */}
            <div className="bg-white/60 dark:bg-slate-800/60 backdrop-blur-2xl rounded-3xl border border-white/80 dark:border-slate-600/80 shadow-2xl overflow-hidden">
              {/* Header section with gradient and icon */}
              <div className="relative bg-gradient-to-br from-amber-50/90 via-orange-50/90 to-red-50/90 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-red-900/30 px-6 py-6 text-center">
                {/* Decorative gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/20 to-transparent" />
                
                <div className="relative">
                  <div className="flex justify-center mb-3">
                    <div className="relative">
                      {/* Glow effect */}
                      <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-red-500 rounded-2xl blur-xl opacity-40" />
                      {/* Icon container */}
                      <div className="relative w-16 h-16 bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 rounded-2xl flex items-center justify-center shadow-xl">
                        <Link2Off className="w-8 h-8 text-white" strokeWidth={2.5} />
                      </div>
                    </div>
                  </div>
                  
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    Device Not Linked
                  </h2>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Your device needs to be reconnected
                  </p>
                </div>
              </div>

              {/* Content section */}
              <div className="px-6 py-5">
                <p className="text-xs text-gray-700 dark:text-gray-300 mb-4 text-center leading-relaxed">
                  This device has been unlinked from your Kaizen account. Follow these steps to reconnect:
                </p>

                {/* Instructions with enhanced styling */}
                <div className="space-y-2.5 mb-4">
                  <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-white/80 to-white/60 dark:from-slate-700/60 dark:to-slate-700/40 rounded-xl border border-gray-200/60 dark:border-slate-600/60 shadow-sm">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md">
                      1
                    </div>
                    <p className="text-xs font-medium text-gray-800 dark:text-gray-200 pt-0.5">
                      Close this sidepanel
                    </p>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-white/80 to-white/60 dark:from-slate-700/60 dark:to-slate-700/40 rounded-xl border border-gray-200/60 dark:border-slate-600/60 shadow-sm">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md">
                      2
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        Click the Kaizen extension icon
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Look for it in your browser toolbar
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-3 p-3 bg-gradient-to-br from-white/80 to-white/60 dark:from-slate-700/60 dark:to-slate-700/40 rounded-xl border border-gray-200/60 dark:border-slate-600/60 shadow-sm">
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-md">
                      3
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                        Complete the linking process
                      </p>
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        Follow the on-screen instructions
                      </p>
                    </div>
                  </div>
                </div>

                {/* Reassurance footer with icon */}
                <div className="relative bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-900/30 dark:to-teal-900/30 border border-emerald-200/60 dark:border-emerald-800/40 rounded-xl px-4 py-3 shadow-sm">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-4 h-4 bg-emerald-500/20 dark:bg-emerald-500/30 rounded-lg flex items-center justify-center mt-0.5">
                      <span className="text-xs">💡</span>
                    </div>
                    <p className="text-[10px] text-emerald-800 dark:text-emerald-200 leading-relaxed">
                      Your focus data is safe and will automatically sync once you reconnect
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom hint with better styling */}
            <p className="text-center text-[10px] text-gray-600/80 dark:text-gray-400/80 mt-4 px-4">
              Need assistance? Visit your extension popup for help
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-white dark:bg-slate-800 relative transition-colors duration-500">
      {/* Sky Background - Light mode: white to light blue, Dark mode: slate to dawn yellow */}
      <div
        className="absolute inset-0 z-0 transition-all duration-500"
        style={{
          backgroundImage: resolvedTheme === "dark"
            ? `linear-gradient(to bottom, #334155 0%, #475569 40%, #f59e0b 100%)`
            : `linear-gradient(to bottom, #e0f2fe 0%, #ffffff 100%)`,
          backgroundSize: "100% 100%"
        }}
      />

      {/* Subtle stars for dawn mode - very smooth twinkling */}
      {resolvedTheme === "dark" && (
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => {
            const size = Math.random() * 1.5 + 0.8
            const left = Math.random() * 100
            const top = Math.random() * 40 // Only in upper 40% (sky area)
            const delay = Math.random() * 12 // 0-12 seconds stagger
            const duration = Math.random() * 8 + 10 // 10-18 seconds for ultra-smooth, natural twinkling
            
            return (
              <div
                key={i}
                className="absolute rounded-full bg-amber-50 animate-twinkle"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${left}%`,
                  top: `${top}%`,
                  opacity: Math.random() * 0.2 + 0.2,
                  animationDelay: `${delay}s`,
                  animationDuration: `${duration}s`,
                  boxShadow: `0 0 ${size * 2}px rgba(255, 251, 235, 0.3)`
                }}
              />
            )
          })}
        </div>
      )}

      <div
        className="relative h-screen overflow-hidden flex flex-col"
        role="main"
        id="main-bg-x">
        {/* Tree Animation Background */}
        <div id="tour-tree">
          <TreeAnimationSection totalFocusTime={focusData?.total_time || 0} />
        </div>

        {/* Content Container with padding for card layout */}

        <div className="relative z-10 flex flex-col h-full bg-transparent">
          {/* Header - No Card */}
          <div className="shrink-0 px-2">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 mt-2" id="tour-logo">
                <img
                  src={chrome.runtime.getURL("assets/logo_NPxx.png")}
                  className="w-20 bg-transparent"
                />
              </div>
              <div className="flex items-center gap-2">
                {/* Help/Tour Button */}
                {/* <button
                  onClick={() => setIsTourOpen(true)}
                  className="cursor-pointer h-10 relative bg-white/60 hover:bg-white/80 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200/50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95"
                  aria-label="Start Tour"
                  title="Take a tour">
                  <HelpCircle className="w-4 h-4 text-gray-600" />
                </button> */}

                {/* Dashboard Button */}
                <button
                  id="tour-dashboard"
                  onClick={() =>
                    chrome.tabs.create({ url: DASHBOARD_URL })
                  }
                  className="cursor-pointer h-10 relative bg-gradient-to-br from-blue-500/90 to-purple-600/90 hover:from-blue-600 hover:to-purple-700 backdrop-blur-md px-3 py-2 rounded-xl border border-white/20 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95"
                  aria-label="Open Dashboard">
                  <div className="flex items-center gap-1.5">
                    <LayoutDashboard className="w-4 h-4 text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-400 to-purple-500 opacity-0 group-hover:opacity-20 blur-md transition-opacity duration-300 -z-10" />
                </button>

                {/* Revoke Device Button */}
                <button
                  onClick={() => setShowRevokeModal(true)}
                  className="cursor-pointer h-10 relative bg-white/60 hover:bg-red-500/80 backdrop-blur-md px-3 py-2 rounded-xl border border-gray-200/50 hover:border-red-300/50 shadow-md hover:shadow-lg transition-all duration-300 hover:scale-105 active:scale-95 group"
                  aria-label="Revoke Device"
                  title="Revoke this device">
                  <LogOut className="w-4 h-4 text-gray-600 group-hover:text-white transition-colors" />
                </button>

                {/* Pomodoro Timer - Collapsible */}
                <div 
                  className="relative group/pomodoro mr-3" 
                  id="tour-pomodoro"
                  ref={(node) => {
                    if (node) {
                      const handleClickOutside = (e: MouseEvent) => {
                        if (!node.contains(e.target as Node)) {
                          setIsPomodoroExpanded(false)
                        }
                      }
                      if (isPomodoroExpanded) {
                        document.addEventListener('mousedown', handleClickOutside)
                        return () => document.removeEventListener('mousedown', handleClickOutside)
                      }
                    }
                  }}
                >
                  {isPomodoroExpanded ? (
                    // Expanded State
                    <div className="flex items-center gap-2 bg-gradient-to-r from-emerald-100/70 via-emerald-50/40 to-white/20 dark:from-emerald-900/50 dark:via-emerald-950/30 dark:to-slate-900/30 backdrop-blur-md px-4 py-2 rounded-xl border border-white/30 dark:border-emerald-400/40 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                      {/* Progress indicator background - Subtle fill */}
                      <div
                        className={`absolute inset-0 rounded-xl transition-all duration-1000 ease-in-out ${pomodoroState.isActive
                          ? pomodoroState.state === "focus"
                            ? "bg-gradient-to-r from-red-500/5 via-orange-500/5 to-transparent dark:from-red-600/10 dark:via-orange-600/10 dark:to-transparent"
                            : "bg-gradient-to-r from-green-500/5 via-teal-500/5 to-transparent dark:from-green-600/10 dark:via-teal-600/10 dark:to-transparent"
                          : "bg-transparent"
                          }`}
                        style={{
                          width: `${pomodoroState.state === "focus"
                            ? ((1500 - pomodoroState.remainingTime) / 1500) * 100
                            : ((300 - pomodoroState.remainingTime) / 300) * 100
                            }%`,
                          mixBlendMode: "multiply",
                          backdropFilter: "blur(4px)"
                        }}
                      />

                      <div className="relative flex items-center gap-2">
                        {/* Timer display with state icon */}
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`transition-transform duration-300 ${pomodoroState.isActive ? "animate-pulse" : ""
                              }`}>
                            {pomodoroState.state === "focus" ? (
                              <Timer className="w-4 h-4 text-red-600 dark:text-red-400" />
                            ) : (
                              <Coffee className="w-4 h-4 text-green-600 dark:text-green-400" />
                            )}
                          </div>
                          <span className="text-sm font-mono font-bold text-gray-800 dark:text-gray-100 tabular-nums">
                            {formattedPomodoroTime}
                          </span>
                        </div>

                        {/* Vertical divider */}
                        <div className="w-px h-5 bg-gray-300 dark:bg-slate-600" />

                        {/* Play/Pause button - Enhanced */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handlePomodoroToggle()
                          }}
                          className={`group relative flex items-center justify-center w-7 h-7 rounded-lg transition-all duration-300 ${pomodoroState.isActive
                            ? "bg-gradient-to-br from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 shadow-md"
                            : "bg-gradient-to-br from-green-400 to-emerald-500 hover:from-green-500 hover:to-emerald-600 shadow-md"
                            } hover:scale-110 active:scale-95 hover:shadow-lg`}
                          aria-label={
                            pomodoroState.isActive
                              ? `Pause ${pomodoroState.state}`
                              : `Start ${pomodoroState.state}`
                          }>
                          {pomodoroState.isActive ? (
                            <Pause className="w-3.5 h-3.5 text-white fill-white" />
                          ) : (
                            <Play className="w-3.5 h-3.5 text-white fill-white" />
                          )}
                          {/* Button glow effect */}
                          <div className="absolute inset-0 rounded-lg bg-white/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                        </button>
                      </div>

                      {/* Pomodoro count indicator */}
                      {pomodoroState.totalPomodoros > 0 && (
                        <div className="absolute -top-1 -right-1 bg-gradient-to-br from-purple-500 to-pink-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg border border-white/30">
                          {pomodoroState.totalPomodoros}
                        </div>
                      )}
                    </div>
                  ) : (
                    // Collapsed State - Icon Button Only with Fill Progress
                    <button
                      onClick={() => setIsPomodoroExpanded(true)}
                      className="relative h-10 scale-110 w-10 bg-gradient-to-r from-emerald-100/70 via-emerald-50/40 to-white/20 dark:from-emerald-900/50 dark:via-emerald-950/30 dark:to-slate-900/30 backdrop-blur-md rounded-xl border border-white/30 dark:border-emerald-400/40 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 active:scale-95 flex items-center justify-center overflow-hidden"
                      aria-label="Expand Pomodoro Timer"
                    >
                      {/* Progress Fill Overlay */}
                      {pomodoroState.isActive && (
                        <div
                          className={`absolute inset-0 rounded-xl transition-all duration-1000 ease-linear ${
                            pomodoroState.state === "focus"
                              ? "bg-gradient-to-t from-emerald-400/40 via-teal-300/30 to-green-400/40 dark:from-emerald-500/50 dark:via-teal-400/40 dark:to-green-500/50"
                              : "bg-gradient-to-t from-green-400/40 via-emerald-300/30 to-teal-400/40 dark:from-green-500/50 dark:via-emerald-400/40 dark:to-teal-500/50"
                          }`}
                          style={{
                            height: `${
                              pomodoroState.state === "focus"
                                ? ((1500 - pomodoroState.remainingTime) / 1500) * 100
                                : ((300 - pomodoroState.remainingTime) / 300) * 100
                            }%`,
                            bottom: 0,
                            top: 'auto'
                          }}
                        />
                      )}

                      <div
                        className={`relative z-10 transition-transform duration-300 ${
                          pomodoroState.isActive ? "animate-pulse" : ""
                        }`}>
                        {pomodoroState.isActive ? (
                          <Timer className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                          <Coffee className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                        )}
                      </div>

                      {/* Pomodoro count indicator */}
                      {pomodoroState.totalPomodoros > 0 && (
                        <div className="absolute -top-1 -right-1 bg-gradient-to-br from-purple-500 to-pink-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-lg border border-white/30 z-20">
                          {pomodoroState.totalPomodoros}
                        </div>
                      )}
                    </button>
                  )}

                  {/* Hover Popover - Shows for both collapsed and expanded states */}
                  <div className="absolute top-full right-0 mt-2 w-64 opacity-0 invisible group-hover/pomodoro:opacity-100 group-hover/pomodoro:visible transition-all duration-300 pointer-events-none z-50">
                    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 p-4 backdrop-blur-md">
                      {/* Arrow */}
                      <div className="absolute -top-2 right-6 w-4 h-4 bg-white dark:bg-slate-800 border-t border-l border-gray-200 dark:border-slate-700 transform rotate-45" />

                      <div className="relative space-y-3">
                        <div className="flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-slate-700">
                          <Timer className="w-5 h-5 text-red-500" />
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                            Pomodoro Timer
                          </h3>
                        </div>

                        <div className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
                          <div className="flex items-start gap-2">
                            <Timer className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold">Focus:</span> 25
                              minutes of concentrated work
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <Coffee className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-semibold">Break:</span> 5
                              minutes of rest
                            </div>
                          </div>
                        </div>

                        {pomodoroState.totalPomodoros > 0 && (
                          <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-gray-600 dark:text-gray-400">
                                Completed Today:
                              </span>
                              <div className="flex items-center gap-1">
                                <span className="font-bold text-purple-600 dark:text-purple-400">
                                  {pomodoroState.totalPomodoros}
                                </span>
                                <Trophy className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                              </div>
                            </div>
                          </div>
                        )}

                        <div className="pt-2 border-t border-gray-200 dark:border-slate-700">
                          <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                            {pomodoroState.isActive
                              ? "Timer is running. Click pause to stop."
                              : "Click play to start a focus session."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Current Focus Display */}
            <div className="bg-white/30 dark:bg-slate-800/30 backdrop-blur-md rounded-xl p-3 border border-gray-300/50 dark:border-slate-600/50 shadow-xs" id="current-focus">
              {focusData ? (
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
                      Current Focus
                    </p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">
                      {focusData.focus_item.replace(".", "")}
                    </p>
                  </div>
                  <div className="text-right ml-3">
                    <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 font-medium">
                      Elapsed
                    </p>
                    <p className="font-mono font-bold text-sm text-gray-900 dark:text-gray-200">
                      {formattedFocusTime}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 text-center font-medium">
                    No active focus session
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 italic text-center mb-3">
                    Spend 7 minutes of focus time to learn something new 🌱
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-gray-300/50 dark:border-slate-600/50 my-2"></div>

              {/* Tree Nurturing Message */}
              <p
                className="text-green-900 dark:text-green-300 text-center"
                style={{ fontSize: "10px" }}>
                🌱 Your tree thrives as your focus grows, keep nurturing it!
              </p>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="shrink-0 mx-4 pb-1 mt-4 mb-2" id="tour-tabs">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("focus")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${activeTab === "focus"
                  ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                  : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                  }`}>
                <div className="flex flex-col items-center gap-1">
                  <Target className="w-5 h-5" />
                  <span className="text-[11px]">Focus</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("insights")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${activeTab === "insights"
                  ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                  : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                  }`}>
                <div className="flex flex-col items-center gap-1">
                  <BarChart3 className="w-5 h-5" />
                  <span className="text-[11px]">Insights</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("intents")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${activeTab === "intents"
                  ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                  : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                  }`}>
                <div className="flex flex-col items-center gap-1">
                  <Lightbulb className="w-5 h-5" />
                  <span className="text-[11px]">Learning</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab("explore")}
                className={`relative flex-1 py-2.5 rounded-[16px] text-xs font-semibold transition-all duration-300 ${activeTab === "explore"
                  ? "bg-white/80 dark:bg-slate-700/80 backdrop-blur-xl text-gray-900 dark:text-white shadow-lg border border-white/40 dark:border-slate-600/40"
                  : "bg-white/40 dark:bg-slate-700/40 backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-white/20 dark:border-slate-600/20"
                  }`}>
                <div className="flex flex-col items-center gap-1">
                  <Compass className="w-5 h-5" />
                  <span className="text-[11px]">Explore</span>
                </div>
              </button>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 overflow-y-auto">
              {activeTab === "focus" && renderFocusTab()}
              {activeTab === "insights" && renderInsightsTab()}
              {activeTab === "intents" && <IntentsTab />}
              {activeTab === "explore" && renderExploreTab()}
            </div>
          </div>
        </div>

        {/* Revoke Device Confirmation Modal */}
        {showRevokeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            {/* Backdrop */}
            <div 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowRevokeModal(false)}
            />
            
            {/* Modal */}
            <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-gray-200/50 dark:border-slate-700/50 max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header with gradient */}
              <div className="relative bg-gradient-to-br from-red-50 via-orange-50 to-amber-50 dark:from-red-900/30 dark:via-orange-900/30 dark:to-amber-900/30 px-6 py-5 border-b border-red-100 dark:border-red-900/50">
                <div className="absolute inset-0 bg-gradient-to-br from-transparent via-white/20 to-transparent" />
                <div className="relative flex items-center gap-3">
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-400 to-orange-500 rounded-xl blur-lg opacity-40" />
                    <div className="relative w-12 h-12 bg-gradient-to-br from-red-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg">
                      <LogOut className="w-6 h-6 text-white" strokeWidth={2.5} />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                      Revoke Device Access
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      This action will unlink your device
                    </p>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="px-6 py-5">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
                  Are you sure you want to revoke this device? This will:
                </p>

                <div className="space-y-2.5 mb-5">
                  <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex-shrink-0 w-5 h-5 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-xs text-red-600 dark:text-red-400">✕</span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Disconnect</span> this device from your Kaizen account
                    </p>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex-shrink-0 w-5 h-5 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-xs text-red-600 dark:text-red-400">✕</span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Stop syncing</span> your focus data and insights
                    </p>
                  </div>

                  <div className="flex items-start gap-3 p-3 bg-red-50/50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/40">
                    <div className="flex-shrink-0 w-5 h-5 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mt-0.5">
                      <span className="text-xs text-red-600 dark:text-red-400">✕</span>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300">
                      <span className="font-semibold">Require re-linking</span> to use the extension again
                    </p>
                  </div>
                </div>

                <div className="bg-blue-50/80 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/40 rounded-lg px-4 py-3">
                  <div className="flex items-start gap-2.5">
                    <div className="flex-shrink-0 w-4 h-4 bg-blue-500/20 dark:bg-blue-500/30 rounded-lg flex items-center justify-center mt-0.5">
                      <span className="text-xs">💡</span>
                    </div>
                    <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">
                      Your focus data is safely stored and will be available when you reconnect
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-6 py-4 bg-gray-50/50 dark:bg-slate-900/50 border-t border-gray-200/50 dark:border-slate-700/50 flex gap-3">
                <button
                  onClick={() => setShowRevokeModal(false)}
                  className="flex-1 px-4 py-2.5 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 font-medium text-sm rounded-lg border border-gray-300 dark:border-slate-600 transition-all duration-200 hover:shadow-md"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRevokeToken}
                  className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white font-semibold text-sm rounded-lg shadow-md hover:shadow-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
                >
                  Revoke Device
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Error boundary wrapper
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Sidepanel Error:", error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: "20px", background: "#1a1a1a", color: "white" }}>
          <h1>Something went wrong</h1>
          <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap" }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ fontSize: "12px", marginTop: "10px", opacity: 0.7 }}>
            {this.state.error?.stack}
          </pre>
        </div>
      )
    }

    return this.props.children
  }
}

function SidepanelWithErrorBoundary() {
  return (
    <ErrorBoundary>
      <Popup />
    </ErrorBoundary>
  )
}

export default SidepanelWithErrorBoundary
