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
  type AttentionInsight
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
  FileText
} from "lucide-react"
import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
} from "./cognitive-attention/default-settings"
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
}

type Tab = "focus" | "insights" | "learning" | "explore"

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

  // Settings state
  const [settings, setSettings] = useState<UserSettings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  // Chat state
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState("")
  const [sending, setSending] = useState(false)
  const [attachments, setAttachments] = useState<File[]>([])

  // Focus time tracking - map of focus id to elapsed time string
  const [focusElapsedTimes, setFocusElapsedTimes] = useState<Record<string, string>>({})

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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

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

  const handleToggleSetting = async (key: keyof UserSettings) => {
    if (!settings) return

    setSavingSettings(true)
    const newValue = !settings[key]

    try {
      if (key === "cognitiveAttentionDebugMode") {
        await storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, newValue)
      } else if (key === "cognitiveAttentionShowOverlay") {
        await storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, newValue)
      }

      setSettings({ ...settings, [key]: newValue })

      const token = await storage.get<string>("deviceToken")
      if (token) {
        const api = createApiClient(apiUrl, getTokenFn)
        api.settings.update({ [key]: newValue }, token).catch((err) => {
          console.error("Failed to sync setting to server:", err)
        })
      }
    } catch (error) {
      console.error("Failed to update setting:", error)
    } finally {
      setSavingSettings(false)
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
              setLoading(false)
              break

            case "settings-changed":
              setSettings((prev) => prev ? { ...prev, ...data.settings } : null)
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

            case "device-token-revoked":
              storage.remove("deviceToken")
              setUser(null)
              setSettings(null)
              setFocuses([])
              setPomodoroStatus(null)
              setInsights([])
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

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 mx-auto mb-4" />
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 p-6 text-center">
        <img src="/assets/kaizen-logo.png" alt="Kaizen" className="h-10 mb-4" />
        <p className="text-gray-600">
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
    <div className="min-h-screen w-full bg-white relative">
      {/* Gradient Background */}
      <div
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: `radial-gradient(125% 125% at 50% 90%, #ffffff 50%, #10b981 100%)`,
          backgroundSize: "100% 100%",
          filter: "hue-rotate(60deg)"
        }}
      />

      <div className="relative h-screen overflow-hidden flex flex-col">
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
                className="bg-white/40 backdrop-blur-sm border-gray-300/50"
              />
            </div>

            {/* Current Focus Display */}
            <div className="bg-white/30 backdrop-blur-md rounded-xl p-3 border border-gray-300/50 shadow-sm">
              {sortedFocuses.length > 0 ? (
                <div>
                  <p className="text-xs text-gray-600 font-medium mb-1">
                    {sortedFocuses.length > 1 ? "Current Focuses" : "Current Focus"}
                  </p>
                  {sortedFocuses.map((focus, index) => (
                    <div
                      key={focus.id}
                      className={cn(
                        "flex items-center justify-between",
                        index > 0 && "pt-1.5 mt-1.5 border-t border-gray-200/50"
                      )}
                    >
                      <p className={cn(
                        "font-bold text-gray-900 truncate flex-1 min-w-0",
                        index === 0 ? "text-base" : "text-sm"
                      )}>
                        {focus.item}
                      </p>
                      <p className={cn(
                        "font-mono font-bold text-gray-900 ml-3 shrink-0",
                        index === 0 ? "text-sm" : "text-xs"
                      )}>
                        {focusElapsedTimes[focus.id] || "00:00:00"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2">
                  <p className="text-sm text-gray-700 mb-1 text-center font-medium">
                    No active focus session
                  </p>
                  <p className="text-xs text-gray-600 italic text-center">
                    Start browsing to track your focus
                  </p>
                </div>
              )}

              <div className="border-t border-gray-300/50 my-2" />
              <p className="text-green-900 text-center text-[10px]">
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
                { id: "learning" as Tab, icon: Lightbulb, label: "Learning" },
                { id: "explore" as Tab, icon: Settings, label: "Settings" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative flex-1 py-2.5 rounded-2xl text-xs font-semibold transition-all duration-300",
                    activeTab === tab.id
                      ? "bg-white/80 backdrop-blur-xl text-gray-900 shadow-lg border border-white/40"
                      : "bg-white/40 backdrop-blur-md text-gray-600 hover:text-gray-900 border border-white/20"
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
              />
            )}
            {activeTab === "insights" && <InsightsTab insights={insights} />}
            {activeTab === "learning" && <LearningTab />}
            {activeTab === "explore" && (
              <ExploreTab
                settings={settings}
                savingSettings={savingSettings}
                onToggleSetting={handleToggleSetting}
                onUnlink={handleUnlink}
                user={user}
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
  onAttachmentsChange
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
            <div className="bg-white/40 backdrop-blur-sm rounded-xl p-6 border border-gray-300/50 max-w-sm w-full text-center">
              <div className="p-2 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl w-fit mx-auto mb-3">
                <MessageSquare className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-base font-semibold text-gray-700 mb-1">Start a Conversation</h3>
              <p className="text-xs text-gray-500">
                Ask me anything about your browsing activity, get insights, or just chat!
              </p>
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/60 backdrop-blur-md border border-white/40 rounded-full text-xs font-medium text-gray-700 hover:bg-white/80 hover:text-gray-900 transition-all shadow-lg hover:shadow-xl"
            >
              <Plus className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
        )}

        {/* Input Bar */}
        <div className="p-3 bg-white/30 backdrop-blur-sm border-t border-gray-200/50">
          {/* Attachment Preview */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {attachments.map((file, index) => (
                <div
                  key={index}
                  className="relative group bg-white/60 backdrop-blur-sm rounded-lg border border-gray-300/50 overflow-hidden"
                >
                  {isImage(file) ? (
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-16 h-16 object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 flex flex-col items-center justify-center p-1">
                      <FileText className="w-6 h-6 text-gray-500" />
                      <span className="text-[8px] text-gray-500 truncate w-full text-center mt-1">
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
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50/50 rounded-lg transition-all"
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
              className="flex-1 bg-white/60 backdrop-blur-sm px-4 py-2.5 rounded-xl text-sm border border-gray-300/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-gray-400"
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

// Message Bubble
function MessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.role === "assistant"
  const isTool = message.role === "tool"
  const isUser = message.role === "user"
  const isStreaming = message.status === "streaming" || message.status === "typing"
  const hasAttachments = message.attachments && message.attachments.length > 0

  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content)
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-[8px] text-gray-400">●</span>
        <span className="text-[11px] text-gray-500">{text}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "max-w-[85%] px-3 py-2 rounded-xl text-sm backdrop-blur-sm",
        isUser
          ? "self-end bg-blue-600 text-white"
          : "self-start bg-white/60 text-gray-900 border border-gray-200/50"
      )}
    >
      {message.status === "typing" ? (
        <span className="tracking-wider">● ● ●</span>
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
                      isUser ? "bg-blue-500/50" : "bg-gray-200/50"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    <span className="truncate max-w-[120px]">{attachment.filename}</span>
                  </div>
                )
              })}
            </div>
          )}
          {/* Text content - hide placeholder text for attachment-only messages */}
          {message.content && message.content !== "[Attached files]" && (
            <p className="whitespace-pre-wrap break-words">
              {message.content}
              {isStreaming && <span className="ml-0.5 animate-blink">▊</span>}
            </p>
          )}
          {message.status === "error" && message.errorMessage && (
            <p className="text-xs text-red-300 mt-1">Error: {message.errorMessage}</p>
          )}
        </>
      )}
    </div>
  )
}

// Insights Tab
function InsightsTab({ insights }: { insights: AttentionInsight[] }) {
  return (
    <div className="flex-1 overflow-auto p-3">
      {insights.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center p-4">
          <div className="bg-white/40 backdrop-blur-sm rounded-xl p-6 border border-gray-300/50">
            <Lightbulb className="w-8 h-8 text-purple-500 mx-auto mb-3 opacity-50" />
            <p className="text-sm font-medium text-gray-700">No insights yet</p>
            <p className="text-xs text-gray-500">Insights will appear as you browse the web</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="bg-white/40 backdrop-blur-sm p-3 rounded-xl border-l-2 border-purple-500 border border-gray-300/50 flex items-center justify-between gap-2"
            >
              <span className="text-sm text-gray-700">{insight.message}</span>
              <span className="text-[10px] text-gray-500 whitespace-nowrap">
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

// Learning Tab (placeholder for future features)
function LearningTab() {
  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="h-full flex flex-col items-center justify-center text-center p-4">
        <div className="bg-white/40 backdrop-blur-sm rounded-xl p-6 border border-gray-300/50">
          <Lightbulb className="w-8 h-8 text-yellow-500 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-700">Learning Features</p>
          <p className="text-xs text-gray-500 mt-1">
            Coming soon: Quiz yourself on your browsing activity!
          </p>
        </div>
      </div>
    </div>
  )
}

// Explore Tab (Settings)
function ExploreTab({
  settings,
  savingSettings,
  onToggleSetting,
  onUnlink,
  user
}: {
  settings: UserSettings | null
  savingSettings: boolean
  onToggleSetting: (key: keyof UserSettings) => void
  onUnlink: () => void
  user: UserInfo
}) {
  return (
    <div className="flex-1 overflow-auto p-3">
      <div className="space-y-3">
        {/* User Info */}
        <div className="bg-white/40 backdrop-blur-sm rounded-xl p-4 border border-gray-300/50">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">{user.name || user.email}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <button
              onClick={onUnlink}
              className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              Unlink
            </button>
          </div>
        </div>

        {/* Settings */}
        <div className="bg-white/40 backdrop-blur-sm rounded-xl p-4 border border-gray-300/50">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4" />
            Attention Tracking
          </h3>
          {settings ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-gray-900">Debug Mode</p>
                  <p className="text-[10px] text-gray-500">Show debug overlay</p>
                </div>
                <button
                  onClick={() => onToggleSetting("cognitiveAttentionDebugMode")}
                  disabled={savingSettings}
                  className={cn(
                    "text-[10px] h-6 px-3 rounded-lg font-medium transition-all",
                    settings.cognitiveAttentionDebugMode
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  )}
                >
                  {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/50 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-gray-900">Show Overlay</p>
                  <p className="text-[10px] text-gray-500">Highlight tracked elements</p>
                </div>
                <button
                  onClick={() => onToggleSetting("cognitiveAttentionShowOverlay")}
                  disabled={savingSettings}
                  className={cn(
                    "text-[10px] h-6 px-3 rounded-lg font-medium transition-all",
                    settings.cognitiveAttentionShowOverlay
                      ? "bg-blue-500 text-white"
                      : "bg-gray-200 text-gray-600 hover:bg-gray-300"
                  )}
                >
                  {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">Loading settings...</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default SidePanel
