import { useEffect, useState, useRef } from "react"
import { Storage } from "@plasmohq/storage"
import {
  createApiClient,
  formatToolResultMessage,
  type UserSettings,
  type ChatSessionListItem,
  type ChatMessage,
  type Focus,
  type PomodoroStatus,
  type UnifiedSSEData,
  type AttentionInsight
} from "@kaizen/api-client"
import {
  Button,
  Logo,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FocusCard,
  PomodoroTimer,
  Badge,
  Separator,
  cn
} from "@kaizen/ui"
import { MessageSquare, Lightbulb, Settings, Plus, ArrowLeft, Trash2, Send } from "lucide-react"
import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY,
  ATTENTION_TRACKING_IGNORE_LIST
} from "./cognitive-attention/default-settings"
import "./styles.css"

const apiUrl = process.env.PLASMO_PUBLIC_KAIZEN_API_URL || "http://localhost:60092"

const storage = new Storage()

// Token getter function for authenticated API calls
const getTokenFn = async () => {
  return await storage.get<string>("deviceToken") || null
}

interface UserInfo {
  id: string
  email: string
  name: string | null
}

type Tab = "chat" | "insights" | "settings"

function SidePanel() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("chat")

  // Focus state (multiple active focuses)
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
  const [showSessionList, setShowSessionList] = useState(true)

  // Helper to sort sessions by updatedAt descending
  const sortSessionsByDate = (sessions: ChatSessionListItem[]) =>
    [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())

  // Helper to sort messages by updatedAt ascending
  const sortMessagesByDate = (messages: ChatMessage[]) =>
    [...messages].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())


  // Refs
  const unifiedEventSourceRef = useRef<EventSource | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const activeSessionIdRef = useRef<string | null>(null)

  // Keep activeSessionIdRef in sync for SSE handler
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId
  }, [activeSessionId])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Handle pending chat prompts from text selection
  useEffect(() => {
    const handlePendingPrompt = async () => {
      const pending = await storage.get<{ prompt: string; action: string; timestamp: number }>("pendingChatPrompt")
      if (pending && pending.prompt) {
        console.log("[Sidepanel] Received pending prompt:", pending.action)

        // Clear the pending prompt immediately to prevent re-processing
        await storage.remove("pendingChatPrompt")

        // Switch to chat tab
        setActiveTab("chat")

        // Start a new chat
        setActiveSessionId(null)
        setMessages([])
        setShowSessionList(false)

        // Set the input value
        setInputValue(pending.prompt)

        // Only auto-submit if action is not "add_to_chat"
        if (pending.action !== "add_to_chat") {
          // Auto-submit after state updates
          setTimeout(async () => {
            const token = await storage.get<string>("deviceToken")
            if (!token) return

            setSending(true)
            const api = createApiClient(apiUrl, getTokenFn)

            try {
              const result = await api.chats.sendMessage({
                sessionId: undefined, // New session
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

    // Check on mount
    handlePendingPrompt()

    // Watch for changes
    storage.watch({
      pendingChatPrompt: handlePendingPrompt
    })
  }, [])

  // Handle Pomodoro pause/resume
  const handlePomodoroToggle = async () => {
    const api = createApiClient(apiUrl, getTokenFn)
    if (pomodoroStatus?.state === "paused") {
      const result = await api.pomodoro.resume()
      setPomodoroStatus(result.status)
    } else if (pomodoroStatus?.state === "running") {
      const result = await api.pomodoro.pause()
      setPomodoroStatus(result.status)
    }
  }

  const handleUnlink = async () => {
    const token = await storage.get<string>("deviceToken")
    if (token) {
      const api = createApiClient(apiUrl)
      try {
        await api.deviceTokens.revoke(token)
      } catch {
        // Ignore errors
      }
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
      // Update local storage immediately for UI feedback
      if (key === "cognitiveAttentionDebugMode") {
        await storage.set(COGNITIVE_ATTENTION_DEBUG_MODE.key, newValue)
      } else if (key === "cognitiveAttentionShowOverlay") {
        await storage.set(COGNITIVE_ATTENTION_SHOW_OVERLAY.key, newValue)
      }

      // Update local state
      setSettings({ ...settings, [key]: newValue })

      // Push to server in background (don't await to keep UI responsive)
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

  // Fetch messages for active session
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

  // Send message
  const handleSend = async () => {
    if (!inputValue.trim() || sending) return

    const token = await storage.get<string>("deviceToken")
    if (!token) return

    setSending(true)
    const api = createApiClient(apiUrl, getTokenFn)

    try {
      const result = await api.chats.sendMessage({
        sessionId: activeSessionId || undefined,
        content: inputValue.trim()
      })

      setInputValue("")

      if (result.isNewSession) {
        setActiveSessionId(result.sessionId)
        setShowSessionList(false)
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
    setShowSessionList(false)
  }

  const handleSelectSession = (sessionId: string) => {
    setActiveSessionId(sessionId)
    setShowSessionList(false)
  }

  const handleBackToList = () => {
    setShowSessionList(true)
  }

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation()

    const token = await storage.get<string>("deviceToken")
    if (!token) return

    const api = createApiClient(apiUrl, getTokenFn)
    try {
      await api.chats.delete(sessionId)
    } catch (error) {
      console.error("Failed to delete session:", error)
    }
  }

  // Connect to background script
  useEffect(() => {
    const port = chrome.runtime.connect({ name: "sidepanel" })
    return () => port.disconnect()
  }, [])

  // Setup unified SSE - single connection for all real-time events
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

      // Fetch initial chat sessions
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
                setShowSessionList(true)
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
              // Keep-alive, no action needed
              break
          }
        },
        async () => {
          console.error("Unified SSE error")
          // On error, clear auth state
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

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId)
    } else {
      setMessages([])
    }
  }, [activeSessionId])

  // Storage changes - reconnect unified SSE when token changes
  useEffect(() => {
    const callbackMap = {
      deviceToken: async (change: { newValue?: string }) => {
        // Close existing SSE connection
        if (unifiedEventSourceRef.current) {
          unifiedEventSourceRef.current.close()
          unifiedEventSourceRef.current = null
        }

        if (change.newValue) {
          // Token was set - the main useEffect will handle reconnection
          // Just trigger a re-render by updating loading state briefly
          setLoading(true)
          // Small delay to allow useEffect to pick up the new token
          setTimeout(() => setLoading(false), 100)
        } else {
          // Token was removed - clear all state
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
      <div className="h-screen flex items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6 text-center">
        <Logo size="lg" showText className="mb-4" />
        <p className="text-muted-foreground">
          Not logged in. Please click the extension icon to link your account.
        </p>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <Logo size="sm" showText />
          <Button variant="outline" size="sm" onClick={handleUnlink} className="text-destructive border-destructive hover:bg-destructive/10">
            Unlink
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{user.name || user.email}</p>
      </div>

      {/* Focus Display */}
      <div className="px-3 py-2">
        <FocusCard focuses={focuses} className="text-xs" />
      </div>

      {/* Pomodoro Timer */}
      <div className="px-3 pb-2">
        <PomodoroTimer status={pomodoroStatus} onToggle={handlePomodoroToggle} className="text-xs" />
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab("chat")}
          className={cn(
            "flex-1 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "chat"
              ? "border-secondary text-secondary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <MessageSquare className="w-3 h-3 inline mr-1" />
          Chat
        </button>
        <button
          onClick={() => setActiveTab("insights")}
          className={cn(
            "flex-1 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "insights"
              ? "border-pulse text-pulse"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Lightbulb className="w-3 h-3 inline mr-1" />
          Insights
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={cn(
            "flex-1 py-2 text-xs font-medium border-b-2 transition-colors",
            activeTab === "settings"
              ? "border-secondary text-secondary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          <Settings className="w-3 h-3 inline mr-1" />
          Settings
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "chat" ? (
        <ChatTab
          sessions={sessions}
          activeSessionId={activeSessionId}
          messages={messages}
          inputValue={inputValue}
          sending={sending}
          showSessionList={showSessionList}
          messagesEndRef={messagesEndRef}
          onInputChange={setInputValue}
          onKeyDown={handleKeyDown}
          onSend={handleSend}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onBackToList={handleBackToList}
          onDeleteSession={handleDeleteSession}
        />
      ) : activeTab === "insights" ? (
        <InsightsTab insights={insights} />
      ) : (
        <SettingsTab
          settings={settings}
          savingSettings={savingSettings}
          onToggleSetting={handleToggleSetting}
        />
      )}
    </div>
  )
}

// Chat Tab Component
function ChatTab({
  sessions,
  activeSessionId,
  messages,
  inputValue,
  sending,
  showSessionList,
  messagesEndRef,
  onInputChange,
  onKeyDown,
  onSend,
  onNewChat,
  onSelectSession,
  onBackToList,
  onDeleteSession
}: {
  sessions: ChatSessionListItem[]
  activeSessionId: string | null
  messages: ChatMessage[]
  inputValue: string
  sending: boolean
  showSessionList: boolean
  messagesEndRef: React.RefObject<HTMLDivElement>
  onInputChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onSend: () => void
  onNewChat: () => void
  onSelectSession: (id: string) => void
  onBackToList: () => void
  onDeleteSession: (id: string, e: React.MouseEvent) => void
}) {
  if (showSessionList) {
    // Session List View
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-3">
          <Button onClick={onNewChat} className="w-full gap-2">
            <Plus className="w-4 h-4" />
            New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-auto">
          {sessions.length === 0 ? (
            <p className="p-4 text-center text-sm text-muted-foreground">
              No chats yet. Start a new conversation!
            </p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                className="px-3 py-2 border-b cursor-pointer hover:bg-muted/50 flex items-center justify-between"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{session.title || "New Chat"}</p>
                  <p className="text-xs text-muted-foreground">{session.messageCount} messages</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => onDeleteSession(session.id, e)}
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Chat View
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Back button */}
      <Button variant="ghost" onClick={onBackToList} className="justify-start text-xs border-b rounded-none">
        <ArrowLeft className="w-3 h-3 mr-1" />
        Back to chats
      </Button>

      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
        {messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
            <p className="text-sm font-medium">Start a conversation</p>
            <p className="text-xs">Send a message to begin</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t flex gap-2">
        <textarea
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message..."
          disabled={sending}
          className="flex-1 p-2 border rounded-md text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
          rows={2}
        />
        <Button
          onClick={onSend}
          disabled={!inputValue.trim() || sending}
          size="icon"
          className="self-end"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

// Message Bubble Component
function MessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.role === "assistant"
  const isTool = message.role === "tool"
  const isUser = message.role === "user"
  const isStreaming = message.status === "streaming" || message.status === "typing"

  // Render tool messages as compact agentic lines
  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content)
    return (
      <div className="flex items-center gap-1.5 py-1">
        <span className="text-[8px] text-muted-foreground">●</span>
        <span className="text-[11px] text-muted-foreground">{text}</span>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "max-w-[85%] px-3 py-2 rounded-xl text-sm",
        isUser
          ? "self-end bg-secondary text-secondary-foreground"
          : "self-start bg-muted"
      )}
    >
      {message.status === "typing" ? (
        <span className="tracking-wider">● ● ●</span>
      ) : (
        <>
          <p className="whitespace-pre-wrap break-words">
            {message.content}
            {isStreaming && <span className="ml-0.5 animate-blink">▊</span>}
          </p>
          {message.status === "error" && message.errorMessage && (
            <p className="text-xs text-destructive mt-1">Error: {message.errorMessage}</p>
          )}
        </>
      )}
    </div>
  )
}

// Insights Tab Component
function InsightsTab({ insights }: { insights: AttentionInsight[] }) {
  return (
    <div className="flex-1 overflow-auto p-4">
      {insights.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
          <Lightbulb className="w-8 h-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">No insights yet</p>
          <p className="text-xs">Insights will appear as you browse the web</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className="p-3 bg-pulse/5 rounded-lg border-l-2 border-pulse flex items-center justify-between gap-2"
            >
              <span className="text-sm">{insight.message}</span>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
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

// Settings Tab Component
function SettingsTab({
  settings,
  savingSettings,
  onToggleSetting
}: {
  settings: UserSettings | null
  savingSettings: boolean
  onToggleSetting: (key: keyof UserSettings) => void
}) {
  return (
    <div className="flex-1 overflow-auto p-4">
      <h3 className="text-sm font-semibold mb-3">Attention Tracking</h3>
      {settings ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="text-xs font-medium">Debug Mode</p>
              <p className="text-[10px] text-muted-foreground">Show debug overlay</p>
            </div>
            <Button
              variant={settings.cognitiveAttentionDebugMode ? "default" : "secondary"}
              size="sm"
              onClick={() => onToggleSetting("cognitiveAttentionDebugMode")}
              disabled={savingSettings}
              className="text-[10px] h-6 px-2"
            >
              {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
            </Button>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <div>
              <p className="text-xs font-medium">Show Overlay</p>
              <p className="text-[10px] text-muted-foreground">Highlight tracked elements</p>
            </div>
            <Button
              variant={settings.cognitiveAttentionShowOverlay ? "default" : "secondary"}
              size="sm"
              onClick={() => onToggleSetting("cognitiveAttentionShowOverlay")}
              disabled={savingSettings}
              className="text-[10px] h-6 px-2"
            >
              {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Loading settings...</p>
      )}
    </div>
  )
}

export default SidePanel
