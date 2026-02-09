import { useEffect, useState, useRef } from "react"
import { Storage } from "@plasmohq/storage"
import {
  createApiClient,
  formatToolResultMessage,
  type UserSettings,
  type ChatSessionListItem,
  type ChatMessage,
  type ChatAttachment,
  type Focus,
  type PomodoroStatus,
  type UnifiedSSEData,
  type AttentionInsight,
  type AgentNudgeDetail,
  type AgentNudgeStats
} from "@kaizen/api-client"
import {
  cn,
  PomodoroTimer
} from "@kaizen/ui"
import {
  MessageSquare,
  Lightbulb,
  Settings,
  Plus,
  Send,
  Target,
  BarChart3,
  Paperclip,
  X,
  FileText,
  AlertTriangle,
  Heart,
  Shield,
  CheckCircle,
  XCircle,
  Clock,
  Brain,
  Sparkles,
  User
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import rehypeRaw from "rehype-raw"

import { COGNITIVE_ATTENTION_DEBUG_MODE, COGNITIVE_ATTENTION_SHOW_OVERLAY } from "./cognitive-attention/default-settings"
import { TreeAnimationSection } from "./sidepanel-components/TreeAnimationSection"
import "./styles.css"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"
const webUrl = process.env.PLASMO_PUBLIC_KAIZEN_WEB_URL || "http://localhost:3000"

const storage = new Storage()

const getTokenFn = async () => {
  return await storage.get<string>("deviceToken") || null
}

interface UserInfo {
  id: string
  email: string
  name: string | null
  imageUrl: string | null
}

type Tab = "focus" | "insights" | "health" | "explore"

function SidePanel() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("focus")

  // Focus state
  const [focuses, setFocuses] = useState<Focus[]>([])

  // Pomodoro state
  const [pomodoroStatus, setPomodoroStatus] = useState<PomodoroStatus | null>(null)

  // Insights state
  const [insights, setInsights] = useState<AttentionInsight[]>([])

  // Agent nudges state
  const [nudges, setNudges] = useState<AgentNudgeDetail[]>([])
  const [nudgeStats, setNudgeStats] = useState<AgentNudgeStats | null>(null)

  // Settings state
  const [settings, setSettings] = useState<UserSettings | null>(null)

  // Chat state
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // Focus time tracking - map of focus id to elapsed time string
  const [focusElapsedTimes, setFocusElapsedTimes] = useState<Record<string, string>>({})

  // Tracking enabled state (local to extension)
  const [trackingEnabled, setTrackingEnabled] = useState(true)

  // Theme state for inline styles that can't use dark: prefix
  const [isDark, setIsDark] = useState(false)

  // Helpers
  const sortSessionsByDate = (sessions: ChatSessionListItem[]) =>
    [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  const sortMessagesByDate = (messages: ChatMessage[]) =>
    [...messages].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())

  // Refs
  const unifiedEventSourceRef = useRef<EventSource | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  useEffect(() => {
    const container = messagesEndRef.current?.parentElement
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
    }
  }, [messages])

  // Theme sync: apply dark class based on storage
  useEffect(() => {
    const applyTheme = async () => {
      const theme = await storage.get<string>("themeMode")
      const dark = theme === "dark"
      setIsDark(dark)
      if (dark) {
        document.documentElement.classList.add("dark")
      } else {
        document.documentElement.classList.remove("dark")
      }
    }
    applyTheme()

    storage.watch({
      themeMode: (change) => {
        const dark = change.newValue === "dark"
        setIsDark(dark)
        if (dark) {
          document.documentElement.classList.add("dark")
        } else {
          document.documentElement.classList.remove("dark")
        }
      }
    })
  }, [])

  // Calculate elapsed time for all focuses
  useEffect(() => {
    if (focuses.length === 0) {
      setFocusElapsedTimes({})
      return
    }

    const formatElapsed = (ms: number) => {
      const hours = Math.floor(ms / 3600000)
      const minutes = Math.floor((ms % 3600000) / 60000)
      const seconds = Math.floor((ms % 60000) / 1000)
      return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
    }

    const updateAllElapsed = () => {
      const times: Record<string, string> = {}
      for (const focus of focuses) {
        const startTime = new Date(focus.startedAt).getTime()
        const elapsed = Date.now() - startTime
        times[focus.id] = formatElapsed(elapsed)
      }
      setFocusElapsedTimes(times)
    }

    updateAllElapsed()
    const interval = setInterval(updateAllElapsed, 1000)
    return () => clearInterval(interval)
  }, [focuses])


  // Handle pending chat prompts
  useEffect(() => {
    const handlePendingPrompt = async () => {
      const pending = await storage.get<{ prompt: string; action: string; timestamp: number }>("pendingChatPrompt")
      if (pending && pending.prompt) {
        await storage.remove("pendingChatPrompt")
        setActiveTab("focus")
        setActiveSessionId(null)
        setMessages([])
        setInputValue(pending.prompt)

        if (pending.action !== "add_to_chat") {
          setTimeout(async () => {
            const token = await storage.get<string>("deviceToken")
            if (!token) return

            setSending(true)
            const api = createApiClient(apiUrl, getTokenFn)

            try {
              const result = await api.chats.sendMessage({
                sessionId: undefined,
                content: pending.prompt
              })
              setInputValue("")
              if (result.isNewSession) {
                setActiveSessionId(result.sessionId)
              }
            } catch (error) {
              console.error("Failed to send message:", error)
            } finally {
              setSending(false)
            }
          }, 100)
        }
      }
    }

    handlePendingPrompt()
    storage.watch({ pendingChatPrompt: handlePendingPrompt })
  }, [])

  const handlePomodoroToggle = async () => {
    const api = createApiClient(apiUrl, getTokenFn)
    try {
      if (pomodoroStatus?.state === "running") {
        const result = await api.pomodoro.pause()
        setPomodoroStatus(result.status)
      } else {
        // Start or resume pomodoro
        const result = await api.pomodoro.resume()
        setPomodoroStatus(result.status)
      }
    } catch (e) {
      console.error("Failed to toggle pomodoro:", e)
    }
  }

  const handleUnlink = async () => {
    const token = await storage.get<string>("deviceToken")
    if (token) {
      const api = createApiClient(apiUrl)
      try {
        await api.deviceTokens.revoke(token)
      } catch { }
    }
    await storage.remove("deviceToken")
    setUser(null)
    setSettings(null)
    setFocuses([])
    setSessions([])
    setMessages([])
  }

  const handleUpdateNumericSetting = async (key: keyof UserSettings, value: number) => {
    if (!settings) return

    setSettings({ ...settings, [key]: value })

    const token = await storage.get<string>("deviceToken")
    if (token) {
      const api = createApiClient(apiUrl, getTokenFn)
      api.settings.update({ [key]: value }, token).catch((err) => {
        console.error("Failed to sync setting to server:", err)
      })
    }
  }

  const handleToggleTracking = async () => {
    const newValue = !trackingEnabled
    await storage.set("trackingEnabled", newValue)
    setTrackingEnabled(newValue)
  }

  const handleToggleDisplaySetting = async (settingsKey: keyof UserSettings, storageKey: string) => {
    if (!settings) return
    const newValue = !settings[settingsKey]
    // Update local state immediately
    setSettings((prev) => prev ? { ...prev, [settingsKey]: newValue } : null)
    // Update extension storage so content scripts pick it up
    await storage.set(storageKey, String(newValue))
    // Push to server so dashboard and SSE stay in sync
    const token = await storage.get<string>("deviceToken")
    if (token) {
      const api = createApiClient(apiUrl)
      try {
        await api.settings.update({ [settingsKey]: newValue } as any, token)
      } catch (error) {
        console.error("Failed to sync setting to server:", error)
      }
    }
  }

  const fetchMessages = async (sessionId: string) => {
    const token = await storage.get<string>("deviceToken")
    if (!token) return

    const api = createApiClient(apiUrl, getTokenFn)
    try {
      const result = await api.chats.get(sessionId)
      setMessages(result.messages)
    } catch (error) {
      console.error("Failed to fetch messages:", error)
    }
  }

  // Helper to convert File to base64 ChatAttachment
  const fileToAttachment = async (file: File): Promise<ChatAttachment> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const base64 = (reader.result as string).split(",")[1] // Remove data:...;base64, prefix
        resolve({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          data: base64
        })
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const handleSend = async () => {
    if ((!inputValue.trim() && attachments.length === 0) || sending) return

    const token = await storage.get<string>("deviceToken")
    if (!token) return

    setSending(true)
    const api = createApiClient(apiUrl, getTokenFn)

    try {
      // Convert files to base64 attachments
      const chatAttachments = await Promise.all(attachments.map(fileToAttachment))

      const result = await api.chats.sendMessage({
        sessionId: activeSessionId || undefined,
        content: inputValue.trim() || (attachments.length > 0 ? "[Attached files]" : ""),
        attachments: chatAttachments.length > 0 ? chatAttachments : undefined
      })

      setInputValue("")
      setAttachments([])

      if (result.isNewSession) {
        setActiveSessionId(result.sessionId)
      }
    } catch (error) {
      console.error("Failed to send message:", error)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = () => {
    setActiveSessionId(null)
    setMessages([])
  }

  // Connect to background script
  useEffect(() => {
    const port = chrome.runtime.connect({ name: "sidepanel" })
    return () => port.disconnect()
  }, [])

  // Setup unified SSE
  useEffect(() => {
    let cancelled = false

    const setupUnifiedSSE = async () => {
      if (unifiedEventSourceRef.current) {
        unifiedEventSourceRef.current.close()
        unifiedEventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token) {
        setUser(null)
        setSettings(null)
        setFocuses([])
        setPomodoroStatus(null)
        setLoading(false)
        return
      }

      // Load tracking enabled state (default to true)
      const trackingEnabledValue = await storage.get<boolean>("trackingEnabled")
      setTrackingEnabled(trackingEnabledValue !== false)

      const api = createApiClient(apiUrl)

      try {
        const sessions = await api.chats.list()
        setSessions(sortSessionsByDate(sessions))
      } catch (error) {
        console.error("Failed to fetch sessions:", error)
      }

      const eventSource = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          if (cancelled) return

          switch (data.type) {
            case "connected":
              setUser(data.user)
              setSettings(data.settings)
              setFocuses(data.focuses)
              setPomodoroStatus(data.pomodoro)
              setInsights(data.insights || [])
              setNudges((data as any).nudges || [])
              setNudgeStats((data as any).nudgeStats || null)
              setLoading(false)
              break

            case "settings-changed":
              setSettings((prev) => prev ? { ...prev, ...data.settings } : null)
              // Also sync debug/overlay to extension storage for content scripts
              if (data.settings.cognitiveAttentionDebugMode !== undefined) {
                storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, String(data.settings.cognitiveAttentionDebugMode))
              }
              if (data.settings.cognitiveAttentionShowOverlay !== undefined) {
                storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, String(data.settings.cognitiveAttentionShowOverlay))
              }
              break

            case "focus-changed":
              if (data.changeType === "ended") {
                setFocuses((prev) => prev.filter((f) => f.id !== data.focus?.id))
              } else if (data.changeType === "created" && data.focus) {
                setFocuses((prev) => [data.focus!, ...prev])
              } else if (data.focus) {
                setFocuses((prev) =>
                  prev.map((f) => (f.id === data.focus!.id ? data.focus! : f))
                )
              }
              break

            case "pomodoro-tick":
            case "pomodoro-status-changed":
              setPomodoroStatus(data.status)
              break

            case "chat-session-created":
              setSessions((prev) =>
                sortSessionsByDate([
                  {
                    id: data.session.id,
                    title: data.session.title,
                    attentionRange: data.session.attentionRange,
                    messageCount: 0,
                    createdAt: data.session.createdAt,
                    updatedAt: data.session.updatedAt
                  },
                  ...prev
                ])
              )
              break

            case "chat-session-updated":
              setSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId ? { ...s, ...data.updates } : s
                  )
                )
              )
              break

            case "chat-session-deleted":
              setSessions((prev) => prev.filter((s) => s.id !== data.sessionId))
              if (activeSessionIdRef.current === data.sessionId) {
                setActiveSessionId(null)
                setMessages([])
              }
              break

            case "chat-message-created":
              if (data.sessionId === activeSessionIdRef.current) {
                setMessages((prev) => sortMessagesByDate([...prev, data.message]))
              }
              setSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId
                      ? { ...s, messageCount: s.messageCount + 1, updatedAt: new Date().toISOString() }
                      : s
                  )
                )
              )
              break

            case "chat-message-updated":
              if (data.sessionId === activeSessionIdRef.current) {
                setMessages((prev) =>
                  sortMessagesByDate(
                    prev.map((m) =>
                      m.id === data.messageId
                        ? { ...m, ...data.updates, updatedAt: new Date().toISOString() }
                        : m
                    )
                  )
                )
              }
              break

            case "insight-created":
              setInsights((prev) => [data.insight, ...prev].slice(0, 10))
              break

            case "agent-nudge":
              // Add new nudge to the list (with full details for health tab)
              setNudges((prev) => [{
                id: data.nudge.id,
                type: data.nudge.type,
                message: data.nudge.message,
                confidence: 0,
                reasoning: null,
                context: {},
                response: null,
                respondedAt: null,
                createdAt: data.nudge.createdAt,
              }, ...prev].slice(0, 20))
              // Update stats
              setNudgeStats((prev) => prev ? {
                ...prev,
                totalNudges: prev.totalNudges + 1,
                nudgesByType: {
                  ...prev.nudgesByType,
                  [data.nudge.type]: (prev.nudgesByType[data.nudge.type] || 0) + 1
                }
              } : null)
              break

            case "device-token-revoked":
              storage.remove("deviceToken")
              setUser(null)
              setSettings(null)
              setFocuses([])
              setPomodoroStatus(null)
              setInsights([])
              setNudges([])
              setNudgeStats(null)
              break

            case "ping":
              break
          }
        },
        async () => {
          console.error("Unified SSE error")
          await storage.remove("deviceToken")
          if (!cancelled) {
            setUser(null)
            setLoading(false)
          }
        },
        token
      )

      unifiedEventSourceRef.current = eventSource
    }

    setupUnifiedSSE()

    return () => {
      cancelled = true
      if (unifiedEventSourceRef.current) {
        unifiedEventSourceRef.current.close()
        unifiedEventSourceRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId)
    } else {
      setMessages([])
    }
  }, [activeSessionId])

  useEffect(() => {
    const callbackMap = {
      deviceToken: async (change: { newValue?: string }) => {
        if (unifiedEventSourceRef.current) {
          unifiedEventSourceRef.current.close()
          unifiedEventSourceRef.current = null
        }

        if (change.newValue) {
          setLoading(true)
          setTimeout(() => setLoading(false), 100)
        } else {
          setUser(null)
          setSettings(null)
          setFocuses([])
          setPomodoroStatus(null)
          setSessions([])
          setMessages([])
        }
      }
    }

    storage.watch(callbackMap)

    return () => {
      storage.unwatch(callbackMap)
    }
  }, [])

  // Tree growth duration from settings (default 10 min = 600000ms)
  const treeGrowthDurationMs = settings?.treeGrowthDurationMs ?? 600000

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-950">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-gray-100 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 p-6 text-center">
        <img src="/assets/kaizen-logo.png" alt="Kaizen" className="h-10 mb-4" />
        <p className="text-gray-600 dark:text-gray-400">
          Not logged in. Please click the extension icon to link your account.
        </p>
      </div>
    )
  }

  // Sort focuses by lastActivityAt (most recent activity first)
  const sortedFocuses = [...focuses].sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
  )

  return (
    <div className="min-h-screen w-full bg-white dark:bg-gray-950 relative">
      {/* Gradient Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: isDark
            ? `radial-gradient(125% 125% at 50% 90%, #0a0a0a 50%, #065f46 100%)`
            : `radial-gradient(125% 125% at 50% 90%, #ffffff 50%, #10b981 100%)`,
          backgroundSize: "100% 100%",
          filter: "hue-rotate(60deg)"
        }}
      />

      <div className="relative h-screen overflow-hidden flex flex-col">
        {/* Rive Tree Animation */}
        <TreeAnimationSection
          elapsedSeconds={pomodoroStatus?.elapsedSeconds ?? 0}
          growthDurationMs={treeGrowthDurationMs}
        />

        {/* Content Container */}
        <div className="relative z-20 flex flex-col h-full bg-transparent">
          {/* Header */}
          <div className="shrink-0 px-3 pt-3">
            <div className="flex items-center justify-between mb-3">
              <img
                src="/assets/kaizen-logo.png"
                alt="Kaizen"
                className="h-8 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => window.open(webUrl, '_blank')}
              />
              <PomodoroTimer
                status={pomodoroStatus}
                onToggle={handlePomodoroToggle}
                compact
                className="bg-white/40 dark:bg-white/10 backdrop-blur-sm border-gray-300/50 dark:border-white/10 dark:text-gray-100"
              />
            </div>

            {/* Current Focus Display */}
            <div className="bg-white/30 dark:bg-white/[0.06] backdrop-blur-md rounded-xl p-3 border border-gray-300/50 dark:border-white/10 shadow-sm">
              {sortedFocuses.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400 font-medium mb-1">
                    {sortedFocuses.length > 1 ? "Current Focuses" : "Current Focus"}
                  </p>
                  {sortedFocuses.map((focus, index) => (
                    <div
                      key={focus.id}
                      className={cn(
                        "flex items-center justify-between",
                        index > 0 && "pt-1.5 mt-1.5 border-t border-gray-200/50 dark:border-white/10"
                      )}
                    >
                      <p className={cn(
                        "font-bold text-gray-900 dark:text-gray-100 truncate flex-1 min-w-0",
                        index === 0 ? "text-base" : "text-sm"
                      )}>
                        {focus.item}
                      </p>
                      <p className={cn(
                        "font-mono font-bold text-gray-900 dark:text-gray-100 ml-3 shrink-0",
                        index === 0 ? "text-sm" : "text-xs"
                      )}>
                        {focusElapsedTimes[focus.id] || "00:00:00"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-1 text-center font-medium">
                    No active focus session
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400 italic text-center">
                    Start browsing to track your focus
                  </p>
                </div>
              )}

              <div className="border-t border-gray-300/50 dark:border-white/10 my-2" />
              <p className="text-green-900 dark:text-green-300 text-center text-[10px]">
                Your focus grows with every moment of attention!
              </p>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="shrink-0 mx-3 pb-1 mt-4 mb-2">
            <div className="flex gap-2">
              {[
                { id: "focus" as Tab, icon: Target, label: "Focus" },
                { id: "insights" as Tab, icon: BarChart3, label: "Insights" },
                { id: "health" as Tab, icon: Heart, label: "Health" },
                { id: "explore" as Tab, icon: Settings, label: "Settings" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex-1 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-300",
                    activeTab === tab.id
                      ? "bg-white/80 dark:bg-white/15 backdrop-blur-xl text-gray-900 dark:text-gray-100 shadow-lg border border-white/40 dark:border-white/20"
                      : "bg-white/40 dark:bg-white/[0.06] backdrop-blur-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-white/20 dark:border-white/10"
                  )}
                >
                  <div className="flex flex-col items-center gap-1">
                    <tab.icon className="w-5 h-5" />
                    <span className="text-[11px]">{tab.label}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {activeTab === "focus" && (
              <FocusTab
                messages={messages}
                inputValue={inputValue}
                sending={sending}
                attachments={attachments}
                messagesEndRef={messagesEndRef}
                onInputChange={setInputValue}
                onKeyDown={handleKeyDown}
                onSend={handleSend}
                onNewChat={handleNewChat}
                onAttachmentsChange={setAttachments}
                userImageUrl={user?.imageUrl}
              />
            )}
            {activeTab === "insights" && <InsightsTab insights={insights} />}
            {activeTab === "health" && (
              <HealthTab
                settings={settings}
                nudges={nudges}
                nudgeStats={nudgeStats}
              />
            )}
            {activeTab === "explore" && (
              <ExploreTab
                settings={settings}
                onUpdateNumericSetting={handleUpdateNumericSetting}
                onUnlink={handleUnlink}
                user={user}
                trackingEnabled={trackingEnabled}
                onToggleTracking={handleToggleTracking}
                debugMode={settings?.cognitiveAttentionDebugMode ?? false}
                showOverlay={settings?.cognitiveAttentionShowOverlay ?? false}
                onToggleDebugMode={() => handleToggleDisplaySetting("cognitiveAttentionDebugMode", COGNITIVE_ATTENTION_DEBUG_MODE.key)}
                onToggleShowOverlay={() => handleToggleDisplaySetting("cognitiveAttentionShowOverlay", COGNITIVE_ATTENTION_SHOW_OVERLAY.key)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// Focus Tab (Chat)
function FocusTab({
  messages,
  inputValue,
  sending,
  attachments,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onSend,
  onNewChat,
  onAttachmentsChange,
  userImageUrl
}: {
  messages: ChatMessage[]
  inputValue: string
  sending: boolean
  attachments: File[]
  messagesEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onSend: () => void
  onNewChat: () => void
  onAttachmentsChange: (files: File[]) => void
  userImageUrl?: string | null
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      onAttachmentsChange([...attachments, ...Array.from(files)])
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const removeAttachment = (index: number) => {
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
  }

  const isImage = (file: File) => file.type.startsWith("image/")

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-end justify-center p-4">
            <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-6 border border-gray-300/50 dark:border-white/10 max-w-sm w-full text-center">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl w-fit mx-auto mb-3">
                <MessageSquare className="w-7 h-7 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 dark:text-gray-200 mb-1">Start a Conversation</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ask me anything about your browsing activity, get insights, or just chat!
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} userImageUrl={userImageUrl} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area with Floating New Chat Button */}
      <div className="relative">
        {/* Floating New Chat Button */}
        {messages.length > 0 && (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-10">
            <button
              onClick={onNewChat}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/20 rounded-full text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-white/80 dark:hover:bg-white/20 hover:text-gray-900 dark:hover:text-gray-100 transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 bg-white/30 dark:bg-white/[0.04] backdrop-blur-sm border-t border-gray-200/50 dark:border-white/10">
          {/* Attachment Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="relative group bg-white/60 dark:bg-white/10 backdrop-blur-sm rounded-lg border border-gray-300/50 dark:border-white/10 overflow-hidden"
                >
                  {isImage(file) ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-16 h-16 object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 flex flex-col items-center justify-center p-1">
                      <FileText className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                      <span className="text-[8px] text-gray-500 dark:text-gray-400 truncate w-full text-center mt-1">
                        {file.name.slice(0, 10)}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.txt"
              onChange={handleFileSelect}
              className="hidden"
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/10 rounded-lg transition-all"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5" />
            </button>

            <input
              type="text"
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a message..."
              disabled={sending}
              className="flex-1 bg-white/60 dark:bg-white/10 backdrop-blur-sm px-4 py-2.5 rounded-xl text-sm text-gray-900 dark:text-gray-100 border border-gray-300/50 dark:border-white/10 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />

            <button
              onClick={onSend}
              disabled={(!inputValue.trim() && attachments.length === 0) || sending}
              className="p-2.5 bg-gradient-to-br from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg disabled:shadow-none"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Relative time formatting
function formatRelativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffSec = Math.floor((now - then) / 1000)
  if (diffSec < 10) return "just now"
  if (diffSec < 60) return "a few seconds ago"
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin === 1) return "1 min ago"
  if (diffMin < 60) return `${diffMin} mins ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr === 1) return "1 hour ago"
  if (diffHr < 24) return `${diffHr} hours ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "yesterday"
  return `${diffDay} days ago`
}

// Message Bubble
function MessageBubble({ message, userImageUrl }: { message: ChatMessage; userImageUrl?: string | null }) {
  const isBot = message.role === "assistant"
  const isTool = message.role === "tool"
  const isUser = message.role === "user"
  const isStreaming = message.status === "streaming" || message.status === "typing"
  const hasAttachments = message.attachments && message.attachments.length > 0

  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content)
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-[8px] text-gray-400 dark:text-gray-500">●</span>
        <span className="text-[11px] text-gray-500 dark:text-gray-400 max-w-[calc(75%)]">{text}</span>
      </div>
    )
  }

  const timestamp = message.createdAt ? formatRelativeTime(message.createdAt) : null

  return (
    <div
      className={cn(
        "flex gap-2 max-w-[88%] min-w-0 flex-shrink-0",
        isUser ? "self-end flex-row-reverse" : "self-start"
      )}
    >
      {/* Avatar */}
      {isUser ? (
        userImageUrl ? (
          <img
            src={userImageUrl}
            alt="User"
            className="w-6 h-6 rounded-full flex-shrink-0 mt-2 object-cover border border-blue-500/20 shadow-sm"
          />
        ) : (
          <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-2 bg-blue-500/20 text-blue-600 dark:bg-blue-400/20 dark:text-blue-300">
            <User className="w-3 h-3" />
          </div>
        )
      ) : (
        <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-2 bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-600 dark:from-violet-400/20 dark:to-blue-400/20 dark:text-violet-300">
          <Sparkles className="w-3 h-3" />
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={cn("flex flex-col min-w-0", isUser ? "items-end" : "items-start")}>
        <div
          className={cn(
            "px-3 py-2 rounded-2xl text-sm min-w-0",
            isUser
              ? "bg-blue-600/90 text-white border border-blue-500/30 dark:bg-blue-600/80 dark:border-blue-400/30"
              : "bg-white/50 border border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_4px_16px_rgba(0,0,0,0.04)] dark:bg-white/[0.06] dark:border-white/[0.1] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_4px_16px_rgba(0,0,0,0.2)] text-gray-900 dark:text-gray-100"
          )}
          style={{ backdropFilter: "blur(16px) saturate(1.8)", WebkitBackdropFilter: "blur(16px) saturate(1.8)" }}
        >
          {message.status === "typing" ? (
            <span className="flex gap-1 py-0.5">
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
            </span>
          ) : (
            <>
              {/* Attachments */}
              {hasAttachments && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {message.attachments!.map((attachment, index) => {
                    const isImage = attachment.mimeType.startsWith("image/")
                    if (isImage) {
                      return (
                        <img
                          key={index}
                          src={`data:${attachment.mimeType};base64,${attachment.data}`}
                          alt={attachment.filename}
                          className="max-w-full rounded-lg max-h-48 object-contain"
                        />
                      )
                    }
                    return (
                      <div
                        key={index}
                        className={cn(
                          "flex items-center gap-2 px-2 py-1 rounded-lg text-xs",
                          isUser ? "bg-blue-500/50" : "bg-gray-200/50 dark:bg-gray-700/50"
                        )}
                      >
                        <FileText className="w-4 h-4" />
                        <span className="truncate max-w-[120px]">{attachment.filename}</span>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* Text content */}
              {message.content && message.content !== "[Attached files]" && (
                <div className="break-words overflow-hidden" style={{ overflowWrap: "anywhere" }}>
                  {isBot ? (
                    <ReactMarkdown
                      rehypePlugins={[rehypeRaw]}
                      components={{
                        img: ({ src, alt }) => (
                          <img src={src} alt={alt || "Image"} className="max-w-full rounded-lg mt-2" />
                        ),
                        pre: ({ children }) => (
                          <pre className="bg-slate-900/80 text-slate-200 p-3 rounded-lg overflow-x-auto text-xs my-2 max-w-full">
                            {children}
                          </pre>
                        ),
                        code: ({ children, className }) => {
                          const isBlock = className?.includes("language-")
                          if (isBlock) return <code className="font-mono">{children}</code>
                          return (
                            <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-[0.9em] font-mono break-all">
                              {children}
                            </code>
                          )
                        },
                        a: ({ href, children }) => (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline hover:no-underline break-all">
                            {children}
                          </a>
                        ),
                        p: ({ children }) => (
                          <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>
                        ),
                        ul: ({ children }) => (
                          <ul className="my-1.5 pl-5 list-disc">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="my-1.5 pl-5 list-decimal">{children}</ol>
                        ),
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-gray-300 dark:border-gray-600 my-1.5 pl-3 text-gray-600 dark:text-gray-400">
                            {children}
                          </blockquote>
                        ),
                      }}
                    >
                      {message.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                  )}
                  {isStreaming && <span className="ml-0.5 animate-blink">▊</span>}
                </div>
              )}
              {message.status === "error" && message.errorMessage && (
                <p className="text-xs text-red-300 mt-1">Error: {message.errorMessage}</p>
              )}
            </>
          )}
        </div>
        {/* Timestamp */}
        {timestamp && (
          <span className="text-[9px] text-gray-400 dark:text-gray-500 mt-0.5 px-1">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  )
}

// Insights Tab
function InsightsTab({ insights }: { insights: AttentionInsight[] }) {
  return (
    <div className="flex-1 overflow-auto p-3">
      {insights.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-4">
          <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-6 border border-gray-300/50 dark:border-white/10">
            <Lightbulb className="w-8 h-8 text-purple-500 dark:text-purple-400 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">No insights yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Insights will appear as you browse the web</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm p-3 rounded-xl border-l-2 border-purple-500 border border-gray-300/50 dark:border-white/10 flex items-center justify-between gap-2"
            >
              <span className="text-sm text-gray-700 dark:text-gray-300">{insight.message}</span>
              <span className="text-[10px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                {new Date(insight.createdAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit"
                })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Health Tab - Focus Guardian Agent visibility
function HealthTab({
  settings,
  nudges,
  nudgeStats
}: {
  settings: UserSettings | null
  nudges: AgentNudgeDetail[]
  nudgeStats: AgentNudgeStats | null
}) {
  const getNudgeIcon = (type: string) => {
    switch (type) {
      case "doomscroll": return "🌀"
      case "distraction": return "😵‍💫"
      case "break": return "☕"
      case "focus_drift": return "🎯"
      case "encouragement": return "🌟"
      case "all_clear": return "✅"
      default: return "💭"
    }
  }

  const getNudgeColor = (type: string) => {
    switch (type) {
      case "doomscroll": return "border-red-400 bg-red-50/50 dark:bg-red-950/30"
      case "distraction": return "border-amber-400 bg-amber-50/50 dark:bg-amber-950/30"
      case "break": return "border-green-400 bg-green-50/50 dark:bg-green-950/30"
      case "focus_drift": return "border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/30"
      case "encouragement": return "border-blue-400 bg-blue-50/50 dark:bg-blue-950/30"
      case "all_clear": return "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30"
      default: return "border-gray-400 bg-gray-50/50 dark:bg-gray-800/30"
    }
  }

  const getNudgeLabel = (type: string) => {
    switch (type) {
      case "doomscroll": return "Doomscroll"
      case "distraction": return "Distraction"
      case "break": return "Break Needed"
      case "focus_drift": return "Focus Drift"
      case "encouragement": return "Encouragement"
      case "all_clear": return "All Clear"
      default: return type
    }
  }

  const getResponseIcon = (response: string | null) => {
    switch (response) {
      case "acknowledged": return <CheckCircle className="w-3 h-3 text-green-500" />
      case "false_positive": return <XCircle className="w-3 h-3 text-red-500" />
      case "dismissed": return <X className="w-3 h-3 text-gray-400" />
      default: return <Clock className="w-3 h-3 text-gray-400" />
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="flex-1 overflow-auto p-3 space-y-3">
      {/* Agent Status Card */}
      <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            settings?.focusAgentEnabled ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-800"
          )}>
            <Shield className={cn(
              "w-5 h-5",
              settings?.focusAgentEnabled ? "text-green-600 dark:text-green-400" : "text-gray-400"
            )} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Focus Guardian</h3>
            <p className={cn(
              "text-[10px] font-medium",
              settings?.focusAgentEnabled ? "text-green-600 dark:text-green-400" : "text-gray-500 dark:text-gray-400"
            )}>
              {settings?.focusAgentEnabled ? "Active & Monitoring" : "Disabled"}
            </p>
          </div>
          <Brain className="w-5 h-5 text-purple-400 mr-2" />
        </div>

        {settings?.focusAgentEnabled && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-white/50 dark:bg-white/[0.08] rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{nudgeStats?.totalNudges || 0}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Total Nudges</p>
            </div>
            <div className="bg-white/50 dark:bg-white/[0.08] rounded-lg p-2">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{nudgeStats?.acknowledgedCount || 0}</p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Helpful</p>
            </div>
            <div className="bg-white/50 dark:bg-white/[0.08] rounded-lg p-2">
              <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {settings.focusAgentSensitivity !== undefined
                  ? Math.round(settings.focusAgentSensitivity * 100)
                  : 50}%
              </p>
              <p className="text-[9px] text-gray-500 dark:text-gray-400">Sensitivity</p>
            </div>
          </div>
        )}
      </div>

      {/* Recent Decisions */}
      <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Agent Decisions
        </h3>

        {nudges.length === 0 ? (
          <div className="text-center py-4">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2 opacity-50" />
            <p className="text-xs text-gray-500 dark:text-gray-400">No nudges yet</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              The agent is watching for unfocused patterns
            </p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {nudges.map((nudge) => (
              <div
                key={nudge.id}
                className={cn(
                  "rounded-lg p-3 border-l-2",
                  getNudgeColor(nudge.type)
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="text-base">{getNudgeIcon(nudge.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase">
                        {getNudgeLabel(nudge.type)}
                      </span>
                      <div className="flex items-center gap-1">
                        {getResponseIcon(nudge.response)}
                        <span className="text-[9px] text-gray-400 dark:text-gray-500">
                          {formatTime(nudge.createdAt)}
                        </span>
                      </div>
                    </div>
                    <p className="text-xs text-gray-700 dark:text-gray-300 mt-1">{nudge.message}</p>
                    {nudge.reasoning && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1 italic">
                        {nudge.reasoning}
                      </p>
                    )}
                    {nudge.confidence > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-400 rounded-full"
                            style={{ width: `${nudge.confidence * 100}%` }}
                          />
                        </div>
                        <span className="text-[9px] text-gray-400 dark:text-gray-500">
                          {Math.round(nudge.confidence * 100)}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nudge Type Breakdown */}
      {nudgeStats && nudgeStats.totalNudges > 0 && (
        <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">Pattern Breakdown</h3>
          <div className="space-y-2">
            {Object.entries(nudgeStats.nudgesByType).map(([type, count]) => (
              <div key={type} className="flex items-center gap-2">
                <span className="text-sm">{getNudgeIcon(type)}</span>
                <span className="text-xs text-gray-600 dark:text-gray-400 flex-1">
                  {getNudgeLabel(type)}
                </span>
                <span className="text-xs font-medium text-gray-900 dark:text-gray-100">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Explore Tab (Settings)
function ExploreTab({
  settings,
  onUpdateNumericSetting,
  onUnlink,
  user,
  trackingEnabled,
  onToggleTracking,
  debugMode,
  showOverlay,
  onToggleDebugMode,
  onToggleShowOverlay
}: {
  settings: UserSettings | null
  onUpdateNumericSetting: (key: keyof UserSettings, value: number) => void
  onUnlink: () => void
  user: UserInfo
  trackingEnabled: boolean
  onToggleTracking: () => void
  debugMode: boolean
  showOverlay: boolean
  onToggleDebugMode: () => void
  onToggleShowOverlay: () => void
}) {
  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="space-y-3">
        {/* User Info */}
        <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name || user.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
            <button
              onClick={onUnlink}
              className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-70 dark:hover:bg-red-500/10 transition-colors"
            >
              Unlink
            </button>
          </div>
        </div>

        {/* Tracking Toggle */}
        <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Activity Tracking
              </h3>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Track browsing activity and website visits
              </p>
            </div>
            <button
              onClick={onToggleTracking}
              className={cn(
                "text-[10px] h-6 px-3 rounded-lg font-medium transition-all",
                trackingEnabled
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
              )}
            >
              {trackingEnabled ? "ON" : "OFF"}
            </button>
          </div>
          {!trackingEnabled && (
            <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/50 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400">
                All features including focus tracking, insights, quizzes, and learning pulses are disabled when tracking is off.
              </p>
            </div>
          )}
        </div>

        {/* Pomodoro Timer Settings */}
        {settings && (
          <div className="bg-white/40 dark:bg-white/[0.06] backdrop-blur-sm rounded-xl p-4 border border-gray-300/50 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Tree of Focus
            </h3>
            <div className="space-y-2">
              <div className="p-3 bg-white/50 dark:bg-white/[0.08] rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Tree Growth Duration</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">Time for the focus tree to reach full height</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900 dark:text-gray-100">
                    {Math.round((settings.treeGrowthDurationMs ?? 600000) / 60000)}m
                  </span>
                </div>
                <input
                  type="range"
                  min={180000}
                  max={7200000}
                  step={60000}
                  value={settings.treeGrowthDurationMs ?? 600000}
                  onChange={(e) => onUpdateNumericSetting("treeGrowthDurationMs", Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-green-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[9px] text-gray-400 dark:text-gray-500">3 min</span>
                  <span className="text-[9px] text-gray-400 dark:text-gray-500">2 hrs</span>
                </div>
              </div>

              {/* Debug Mode Toggle */}
              <div className="p-3 bg-white/50 dark:bg-white/[0.08] rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Debug Mode</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Show attention tracking overlay</p>
                </div>
                <button
                  onClick={onToggleDebugMode}
                  className={cn(
                    "text-[10px] h-6 px-3 rounded-lg font-medium transition-all",
                    debugMode
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  )}
                >
                  {debugMode ? "ON" : "OFF"}
                </button>
              </div>

              {/* Show Overlay Toggle */}
              <div className="p-3 bg-white/50 dark:bg-white/[0.08] rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Show Overlay</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400">Visual attention indicators</p>
                </div>
                <button
                  onClick={onToggleShowOverlay}
                  className={cn(
                    "text-[10px] h-6 px-3 rounded-lg font-medium transition-all",
                    showOverlay
                      ? "bg-green-500 text-white"
                      : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                  )}
                >
                  {showOverlay ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export default SidePanel
