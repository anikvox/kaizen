import { useEffect, useState, useRef } from "react"
import { Storage } from "@plasmohq/storage"
import { sendToBackground } from "@plasmohq/messaging"
import {
  createApiClient,
  formatToolResultMessage,
  type UserSettings,
  type ChatSessionListItem,
  type ChatMessage,
  type ChatMessageStatus,
  type Focus
} from "@kaizen/api-client"
import {
  COGNITIVE_ATTENTION_DEBUG_MODE,
  COGNITIVE_ATTENTION_SHOW_OVERLAY
} from "./cognitive-attention/default-settings"

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

type Tab = "chat" | "settings"

function SidePanel() {
  const [user, setUser] = useState<UserInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("chat")

  // Focus state (multiple active focuses)
  const [focuses, setFocuses] = useState<Focus[]>([])

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
  const eventSourceRef = useRef<EventSource | null>(null)
  const settingsEventSourceRef = useRef<EventSource | null>(null)
  const chatEventSourceRef = useRef<EventSource | null>(null)
  const focusEventSourceRef = useRef<EventSource | null>(null)
  const messagesEndRef = useRef<EventSource | null>(null)

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
      await sendToBackground({
        name: "update-settings",
        body: { [key]: newValue }
      })
      setSettings({ ...settings, [key]: newValue })
    } catch (error) {
      console.error("Failed to update setting:", error)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleUpdateIgnoreList = async (value: string | null) => {
    if (!settings) return

    setSavingSettings(true)

    try {
      await sendToBackground({
        name: "update-settings",
        body: { attentionTrackingIgnoreList: value }
      })
      setSettings({ ...settings, attentionTrackingIgnoreList: value })
    } catch (error) {
      console.error("Failed to update ignore list:", error)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleUpdateSetting = async (updates: Partial<UserSettings>) => {
    if (!settings) return

    setSavingSettings(true)

    try {
      await sendToBackground({
        name: "update-settings",
        body: updates
      })
      setSettings({ ...settings, ...updates })
    } catch (error) {
      console.error("Failed to update setting:", error)
    } finally {
      setSavingSettings(false)
    }
  }

  // Fetch chat sessions
  const fetchSessions = async () => {
    const token = await storage.get<string>("deviceToken")
    if (!token) return

    const api = createApiClient(apiUrl, getTokenFn)
    try {
      const result = await api.chats.list()
      setSessions(sortSessionsByDate(result))
    } catch (error) {
      console.error("Failed to fetch sessions:", error)
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

  // Setup auth SSE
  useEffect(() => {
    let cancelled = false

    const setupSSE = async () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token) {
        setUser(null)
        setLoading(false)
        return
      }

      const api = createApiClient(apiUrl)
      const eventSource = api.sse.subscribeDeviceToken(
        (data) => {
          if (!cancelled) {
            setUser(data.user)
            setLoading(false)
          }
        },
        async (data) => {
          if (data.token === token) {
            await storage.remove("deviceToken")
            if (!cancelled) {
              setUser(null)
            }
          }
        },
        async () => {
          await storage.remove("deviceToken")
          if (!cancelled) {
            setUser(null)
            setLoading(false)
          }
        },
        token
      )

      eventSourceRef.current = eventSource
    }

    setupSSE()

    return () => {
      cancelled = true
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Setup settings SSE
  useEffect(() => {
    let cancelled = false

    const setupSettingsSSE = async () => {
      if (settingsEventSourceRef.current) {
        settingsEventSourceRef.current.close()
        settingsEventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token) {
        setSettings(null)
        return
      }

      const api = createApiClient(apiUrl)
      const eventSource = api.settings.subscribeSettings(
        (data) => {
          if (!cancelled && data.settings) {
            setSettings(data.settings)
          }
        },
        (newSettings) => {
          if (!cancelled) {
            setSettings(newSettings)
          }
        },
        () => {
          console.error("Settings SSE error")
        },
        token
      )

      settingsEventSourceRef.current = eventSource
    }

    setupSettingsSSE()

    return () => {
      cancelled = true
      if (settingsEventSourceRef.current) {
        settingsEventSourceRef.current.close()
        settingsEventSourceRef.current = null
      }
    }
  }, [user])

  // Setup focus SSE
  useEffect(() => {
    let cancelled = false

    const setupFocusSSE = async () => {
      if (focusEventSourceRef.current) {
        focusEventSourceRef.current.close()
        focusEventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token || !user) {
        setFocuses([])
        return
      }

      const api = createApiClient(apiUrl)
      const eventSource = api.focus.subscribeFocus(
        (data) => {
          if (!cancelled) {
            setFocuses(data.focuses)
          }
        },
        (data) => {
          if (!cancelled) {
            if (data.changeType === "ended") {
              // Remove the ended focus from the list
              setFocuses((prev) => prev.filter((f) => f.id !== data.focus?.id))
            } else if (data.changeType === "created") {
              // Add new focus to the list
              if (data.focus) {
                setFocuses((prev) => [data.focus!, ...prev])
              }
            } else {
              // Update existing focus
              if (data.focus) {
                setFocuses((prev) =>
                  prev.map((f) => (f.id === data.focus!.id ? data.focus! : f))
                )
              }
            }
          }
        },
        () => {
          console.error("Focus SSE error")
        },
        token
      )

      focusEventSourceRef.current = eventSource
    }

    setupFocusSSE()

    return () => {
      cancelled = true
      if (focusEventSourceRef.current) {
        focusEventSourceRef.current.close()
        focusEventSourceRef.current = null
      }
    }
  }, [user])


  // Setup chat SSE
  useEffect(() => {
    let cancelled = false

    const setupChatSSE = async () => {
      if (chatEventSourceRef.current) {
        chatEventSourceRef.current.close()
        chatEventSourceRef.current = null
      }

      const token = await storage.get<string>("deviceToken")
      if (!token || !user) return

      // Fetch initial sessions
      await fetchSessions()

      const api = createApiClient(apiUrl)
      chatEventSourceRef.current = api.chats.subscribeToAllChats(
        {
          onConnected: () => {
            console.log("Chat SSE connected")
          },
          onSessionCreated: (data) => {
            if (!cancelled) {
              setSessions((prev) =>
                sortSessionsByDate([
                  {
                    id: data.session.id,
                    title: data.session.title,
                    messageCount: 0,
                    createdAt: data.session.createdAt,
                    updatedAt: data.session.updatedAt
                  },
                  ...prev
                ])
              )
            }
          },
          onSessionUpdated: (data) => {
            if (!cancelled) {
              setSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId ? { ...s, ...data.updates } : s
                  )
                )
              )
            }
          },
          onSessionDeleted: (data) => {
            if (!cancelled) {
              setSessions((prev) => prev.filter((s) => s.id !== data.sessionId))
              if (activeSessionId === data.sessionId) {
                setActiveSessionId(null)
                setMessages([])
                setShowSessionList(true)
              }
            }
          },
          onMessageCreated: (data) => {
            if (!cancelled && data.sessionId === activeSessionId) {
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
          },
          onMessageUpdated: (data) => {
            if (!cancelled && data.sessionId === activeSessionId) {
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
          },
          onError: () => {
            console.error("Chat SSE error")
          }
        },
        token
      )
    }

    setupChatSSE()

    return () => {
      cancelled = true
      if (chatEventSourceRef.current) {
        chatEventSourceRef.current.close()
        chatEventSourceRef.current = null
      }
    }
  }, [user, activeSessionId])

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId)
    } else {
      setMessages([])
    }
  }, [activeSessionId])

  // Storage changes
  useEffect(() => {
    const callbackMap = {
      deviceToken: async (change: { newValue?: string }) => {
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        if (settingsEventSourceRef.current) {
          settingsEventSourceRef.current.close()
          settingsEventSourceRef.current = null
        }
        if (chatEventSourceRef.current) {
          chatEventSourceRef.current.close()
          chatEventSourceRef.current = null
        }
        if (focusEventSourceRef.current) {
          focusEventSourceRef.current.close()
          focusEventSourceRef.current = null
        }

        if (change.newValue) {
          const api = createApiClient(apiUrl)
          const eventSource = api.sse.subscribeDeviceToken(
            (data) => {
              setUser(data.user)
            },
            async (data) => {
              if (data.token === change.newValue) {
                await storage.remove("deviceToken")
                setUser(null)
                setSettings(null)
                setFocuses([])
                setSessions([])
                setMessages([])
              }
            },
            async () => {
              await storage.remove("deviceToken")
              setUser(null)
              setSettings(null)
              setFocuses([])
              setSessions([])
              setMessages([])
            },
            change.newValue
          )
          eventSourceRef.current = eventSource
        } else {
          setUser(null)
          setSettings(null)
          setFocuses([])
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
      <div style={styles.container}>
        <p>Loading...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.centered}>
          <h2 style={styles.title}>Kaizen</h2>
          <p style={styles.text}>Not logged in. Please click the extension icon to link your account.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerTop}>
          <h2 style={styles.title}>Kaizen</h2>
          <button onClick={handleUnlink} style={styles.unlinkButton}>
            Unlink
          </button>
        </div>
        <div style={styles.userInfo}>
          <span style={styles.userName}>{user.name || user.email}</span>
        </div>
      </div>

      {/* Focus Display */}
      <div style={styles.focusContainer}>
        <div style={styles.focusHeader}>
          <span style={{
            ...styles.focusIndicator,
            background: focuses.length > 0 ? "#28a745" : "#6c757d"
          }} />
          <span style={styles.focusLabel}>
            Active Focuses {focuses.length > 0 && `(${focuses.length})`}
          </span>
        </div>
        {focuses.length > 0 ? (
          <div style={styles.focusList}>
            {focuses.map((focus) => (
              <div key={focus.id} style={styles.focusContent}>
                <span style={styles.focusItem}>{focus.item}</span>
                <span style={styles.focusMeta}>
                  Since {new Date(focus.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {focus.keywords.length > 0 && ` · ${focus.keywords.slice(0, 2).join(", ")}`}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <span style={styles.focusEmpty}>No active focus</span>
        )}
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        <button
          onClick={() => setActiveTab("chat")}
          style={{
            ...styles.tab,
            borderBottom: activeTab === "chat" ? "2px solid #007bff" : "2px solid transparent",
            color: activeTab === "chat" ? "#007bff" : "#666"
          }}
        >
          Chat
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          style={{
            ...styles.tab,
            borderBottom: activeTab === "settings" ? "2px solid #007bff" : "2px solid transparent",
            color: activeTab === "settings" ? "#007bff" : "#666"
          }}
        >
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
      <div style={styles.chatContainer}>
        <button onClick={onNewChat} style={styles.newChatButton}>
          + New Chat
        </button>

        <div style={styles.sessionList}>
          {sessions.length === 0 ? (
            <p style={styles.emptyText}>No chats yet. Start a new conversation!</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                style={styles.sessionItem}
              >
                <div style={styles.sessionInfo}>
                  <span style={styles.sessionTitle}>{session.title || "New Chat"}</span>
                  <span style={styles.sessionMeta}>{session.messageCount} messages</span>
                </div>
                <button
                  onClick={(e) => onDeleteSession(session.id, e)}
                  style={styles.deleteButton}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  // Chat View
  return (
    <div style={styles.chatContainer}>
      {/* Back button */}
      <button onClick={onBackToList} style={styles.backButton}>
        ← Back to chats
      </button>

      {/* Messages */}
      <div style={styles.messagesContainer}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyTitle}>Start a conversation</p>
            <p style={styles.emptySubtitle}>Send a message to begin</p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={styles.inputContainer}>
        <textarea
          value={inputValue}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message..."
          disabled={sending}
          style={styles.input}
          rows={2}
        />
        <button
          onClick={onSend}
          disabled={!inputValue.trim() || sending}
          style={{
            ...styles.sendButton,
            opacity: !inputValue.trim() || sending ? 0.5 : 1
          }}
        >
          {sending ? "..." : "Send"}
        </button>
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
  const isError = message.status === "error"

  // Render tool messages as compact agentic lines
  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content)
    return (
      <div style={styles.agentLine}>
        <span style={styles.agentIcon}>●</span>
        <span style={styles.agentText}>{text}</span>
      </div>
    )
  }

  return (
    <div
      style={{
        ...styles.messageBubble,
        alignSelf: isUser ? "flex-end" : "flex-start",
        background: isUser ? "#007bff" : "#f0f0f0",
        color: isUser ? "#fff" : "#333"
      }}
    >
      {message.status === "typing" ? (
        <span style={styles.typingIndicator}>● ● ●</span>
      ) : (
        <>
          <p style={styles.messageContent}>
            {message.content}
            {isStreaming && <span style={styles.cursor}>▊</span>}
          </p>
          {isError && message.errorMessage && (
            <p style={styles.errorMessage}>Error: {message.errorMessage}</p>
          )}
        </>
      )}
      {isBot && message.status !== "finished" && message.status !== "sent" && (
        <span style={styles.statusText}>
          {message.status === "typing" ? "Typing..." : message.status === "streaming" ? "Streaming..." : ""}
        </span>
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
})

  return (
    <div style={styles.settingsContainer}>
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Attention Tracking</h3>
        {settings ? (
          <div style={styles.settingsList}>
            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingName}>Debug Mode</span>
                <span style={styles.settingDesc}>Show debug overlay</span>
              </div>
              <button
                onClick={() => onToggleSetting("cognitiveAttentionDebugMode")}
                disabled={savingSettings}
                style={{
                  ...styles.toggleButton,
                  background: settings.cognitiveAttentionDebugMode ? "#28a745" : "#6c757d",
                  opacity: savingSettings ? 0.6 : 1,
                  cursor: savingSettings ? "not-allowed" : "pointer"
                }}
              >
                {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
              </button>
            </div>
            <div style={styles.settingItem}>
              <div style={styles.settingInfo}>
                <span style={styles.settingName}>Show Overlay</span>
                <span style={styles.settingDesc}>Highlight tracked elements</span>
              </div>
              <button
                onClick={() => onToggleSetting("cognitiveAttentionShowOverlay")}
                disabled={savingSettings}
                style={{
                  ...styles.toggleButton,
                  background: settings.cognitiveAttentionShowOverlay ? "#28a745" : "#6c757d",
                  opacity: savingSettings ? 0.6 : 1,
                  cursor: savingSettings ? "not-allowed" : "pointer"
                }}
              >
                {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        ) : (
          <p style={styles.text}>Loading settings...</p>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    backgroundColor: "#fff"
  },
  centered: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    textAlign: "center"
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #eee"
  },
  headerTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  title: {
    margin: 0,
    fontSize: 16,
    fontWeight: 600
  },
  unlinkButton: {
    padding: "4px 10px",
    background: "transparent",
    color: "#dc3545",
    border: "1px solid #dc3545",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11
  },
  userInfo: {
    marginTop: 4
  },
  userName: {
    fontSize: 12,
    color: "#666"
  },
  tabs: {
    display: "flex",
    borderBottom: "1px solid #eee"
  },
  tab: {
    flex: 1,
    padding: "10px 0",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500
  },
  // Chat styles
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  newChatButton: {
    margin: 12,
    padding: "10px",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500
  },
  sessionList: {
    flex: 1,
    overflow: "auto"
  },
  sessionItem: {
    padding: "10px 12px",
    borderBottom: "1px solid #eee",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0
  },
  sessionTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },
  sessionMeta: {
    display: "block",
    fontSize: 11,
    color: "#666",
    marginTop: 2
  },
  deleteButton: {
    background: "transparent",
    border: "none",
    fontSize: 18,
    color: "#999",
    cursor: "pointer",
    padding: "2px 6px",
    lineHeight: 1
  },
  backButton: {
    padding: "8px 12px",
    background: "none",
    border: "none",
    borderBottom: "1px solid #eee",
    cursor: "pointer",
    fontSize: 12,
    color: "#007bff",
    textAlign: "left"
  },
  messagesContainer: {
    flex: 1,
    overflow: "auto",
    padding: 12,
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#666"
  },
  emptyTitle: {
    margin: 0,
    fontSize: 14,
    fontWeight: 500
  },
  emptySubtitle: {
    margin: "4px 0 0",
    fontSize: 12
  },
  emptyText: {
    padding: 16,
    textAlign: "center",
    color: "#666",
    fontSize: 13
  },
  messageBubble: {
    maxWidth: "85%",
    padding: "8px 12px",
    borderRadius: 12,
    position: "relative"
  },
  messageContent: {
    margin: 0,
    fontSize: 13,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  cursor: {
    marginLeft: 2,
    animation: "blink 1s infinite"
  },
  typingIndicator: {
    letterSpacing: 2
  },
  errorMessage: {
    margin: "4px 0 0",
    fontSize: 11,
    color: "#dc3545"
  },
  statusText: {
    display: "block",
    marginTop: 4,
    fontSize: 10,
    color: "#666"
  },
  // Agent/tool message styles
  agentLine: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 0",
    alignSelf: "flex-start"
  },
  agentIcon: {
    fontSize: 8,
    color: "#999"
  },
  agentText: {
    fontSize: 11,
    color: "#666"
  },
  inputContainer: {
    padding: 12,
    borderTop: "1px solid #eee",
    display: "flex",
    gap: 8
  },
  input: {
    flex: 1,
    padding: 8,
    border: "1px solid #ddd",
    borderRadius: 6,
    fontSize: 13,
    resize: "none",
    outline: "none",
    fontFamily: "inherit"
  },
  sendButton: {
    padding: "8px 14px",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    alignSelf: "flex-end"
  },
  // Settings styles
  settingsContainer: {
    flex: 1,
    padding: 16,
    overflow: "auto"
  },
  section: {
    marginBottom: 24
  },
  sectionTitle: {
    margin: "0 0 12px 0",
    fontSize: 13,
    fontWeight: 600,
    color: "#333"
  },
  settingsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8
  },
  settingItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    background: "#f8f9fa",
    borderRadius: 6
  },
  settingInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 2
  },
  settingName: {
    fontSize: 12,
    fontWeight: 500,
    color: "#333"
  },
  settingDesc: {
    fontSize: 10,
    color: "#666"
  },
  toggleButton: {
    padding: "4px 10px",
    border: "none",
    borderRadius: 4,
    color: "#fff",
    fontSize: 10,
    fontWeight: 500,
    minWidth: 36
  },
  text: {
    margin: 0,
    fontSize: 13,
    color: "#666"
  },
  ignoreListSection: {
    marginTop: 12,
    padding: 10,
    background: "#f8f9fa",
    borderRadius: 6
  },
  ignoreListTextarea: {
    width: "100%",
    marginTop: 8,
    padding: 8,
    border: "1px solid #ddd",
    borderRadius: 4,
    fontSize: 11,
    fontFamily: "monospace",
    resize: "vertical",
    boxSizing: "border-box" as const
  },
  saveButton: {
    marginTop: 8,
    padding: "6px 12px",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 500
  },
  selectSection: {
    padding: 10,
    background: "#f8f9fa",
    borderRadius: 6
  },
  selectInput: {
    width: "100%",
    marginTop: 6,
    padding: 6,
    border: "1px solid #ddd",
    borderRadius: 4,
    fontSize: 11,
    background: "#fff",
    boxSizing: "border-box" as const
  },
  // Focus styles
  focusContainer: {
    padding: "10px 16px",
    background: "#f8f9fa",
    borderBottom: "1px solid #eee"
  },
  focusHeader: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 4
  },
  focusIndicator: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    display: "inline-block"
  },
  focusLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "#666",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px"
  },
  focusList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6
  },
  focusContent: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 2,
    padding: "4px 8px",
    background: "#fff",
    borderRadius: 4,
    borderLeft: "2px solid #007bff"
  },
  focusItem: {
    fontSize: 14,
    fontWeight: 600,
    color: "#007bff"
  },
  focusMeta: {
    fontSize: 10,
    color: "#666"
  },
  focusEmpty: {
    fontSize: 12,
    color: "#999",
    fontStyle: "italic" as const
  },
}

export default SidePanel
