"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import {
  createApiClient,
  type ChatSessionListItem,
  type ChatMessage,
  type ChatMessageStatus,
} from "@kaizen/api-client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

export default function ChatPage() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Fetch sessions list
  const fetchSessions = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;

    const api = createApiClient(apiUrl, getTokenFn);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return;

    try {
      await api.users.sync({
        email,
        name: clerkUser.fullName || undefined,
      });

      const result = await api.chats.list();
      setSessions(result);
      setError("");
    } catch (err) {
      console.error("Fetch sessions error:", err);
      setError("Failed to fetch chat sessions");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getTokenFn]);

  // Fetch messages for active session
  const fetchMessages = useCallback(async (sessionId: string) => {
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.chats.get(sessionId);
      setMessages(result.messages);
    } catch (err) {
      console.error("Fetch messages error:", err);
      setError("Failed to fetch messages");
    }
  }, [getTokenFn]);

  // Initial load
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchSessions();
  }, [isLoaded, isSignedIn, fetchSessions]);

  // Load messages when active session changes
  useEffect(() => {
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, fetchMessages]);

  // Setup SSE for real-time updates
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    let cancelled = false;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token || cancelled) return;

      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const api = createApiClient(apiUrl, getTokenFn);
      eventSourceRef.current = api.chats.subscribeToAllChats(
        {
          onConnected: () => {
            console.log("Chat SSE connected");
          },
          onSessionCreated: (data) => {
            setSessions((prev) => [
              {
                id: data.session.id,
                title: data.session.title,
                messageCount: 0,
                createdAt: data.session.createdAt,
                updatedAt: data.session.updatedAt,
              },
              ...prev,
            ]);
          },
          onSessionUpdated: (data) => {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId
                  ? { ...s, ...data.updates }
                  : s
              )
            );
          },
          onSessionDeleted: (data) => {
            setSessions((prev) => prev.filter((s) => s.id !== data.sessionId));
            if (activeSessionId === data.sessionId) {
              setActiveSessionId(null);
              setMessages([]);
            }
          },
          onMessageCreated: (data) => {
            if (data.sessionId === activeSessionId) {
              setMessages((prev) => [...prev, data.message]);
            }
            // Update message count in session list
            setSessions((prev) =>
              prev.map((s) =>
                s.id === data.sessionId
                  ? { ...s, messageCount: s.messageCount + 1 }
                  : s
              )
            );
          },
          onMessageUpdated: (data) => {
            if (data.sessionId === activeSessionId) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === data.messageId
                    ? { ...m, ...data.updates }
                    : m
                )
              );
            }
          },
          onError: () => {
            console.error("Chat SSE error");
          },
        },
        token
      );
    };

    setupSSE();

    return () => {
      cancelled = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isSignedIn, clerkUser, getToken, getTokenFn, activeSessionId]);

  // Send message
  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;

    setSending(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.chats.sendMessage({
        sessionId: activeSessionId || undefined,
        content: inputValue.trim(),
      });

      setInputValue("");

      // If new session, set it as active
      if (result.isNewSession) {
        setActiveSessionId(result.sessionId);
      }
    } catch (err) {
      console.error("Send message error:", err);
      setError("Failed to send message");
    } finally {
      setSending(false);
    }
  };

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    const api = createApiClient(apiUrl, getTokenFn);
    try {
      await api.chats.delete(sessionId);
    } catch (err) {
      console.error("Delete session error:", err);
      setError("Failed to delete chat");
    }
  };

  // Start new chat
  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
  };

  if (!isLoaded || loading) {
    return (
      <main style={styles.container}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={styles.container}>
        <h1>Chat</h1>
        <p>Sign in to start chatting.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  return (
    <div style={styles.wrapper}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h2 style={styles.sidebarTitle}>Chats</h2>
          <Link href="/" style={styles.backLink}>Home</Link>
        </div>

        <button onClick={handleNewChat} style={styles.newChatButton}>
          + New Chat
        </button>

        <div style={styles.sessionList}>
          {sessions.length === 0 ? (
            <p style={styles.noSessions}>No chats yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                style={{
                  ...styles.sessionItem,
                  background: activeSessionId === session.id ? "#e3f2fd" : "transparent",
                }}
              >
                <div style={styles.sessionInfo}>
                  <p style={styles.sessionTitle}>
                    {session.title || "New Chat"}
                  </p>
                  <p style={styles.sessionMeta}>
                    {session.messageCount} messages
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  style={styles.deleteButton}
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main style={styles.main}>
        {error && (
          <div style={styles.error}>{error}</div>
        )}

        {/* Messages */}
        <div style={styles.messagesContainer}>
          {messages.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyTitle}>Start a conversation</p>
              <p style={styles.emptySubtitle}>
                Send a message to begin chatting
              </p>
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
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sending}
            style={styles.input}
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            style={{
              ...styles.sendButton,
              opacity: !inputValue.trim() || sending ? 0.5 : 1,
            }}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
      </main>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isBot = message.role === "bot";
  const isStreaming = message.status === "streaming" || message.status === "typing";
  const isError = message.status === "error";

  return (
    <div
      style={{
        ...styles.messageBubble,
        alignSelf: isBot ? "flex-start" : "flex-end",
        background: isBot ? "#f0f0f0" : "#007bff",
        color: isBot ? "#333" : "#fff",
      }}
    >
      {message.status === "typing" ? (
        <span className="typing-indicator" style={styles.typingIndicator}>
          <span>●</span>
          <span>●</span>
          <span>●</span>
        </span>
      ) : (
        <>
          <div style={styles.messageContent}>
            {isBot ? (
              <ReactMarkdown
                urlTransform={(url) => {
                  // Allow data: URLs for base64 images
                  if (url.startsWith("data:")) {
                    return url;
                  }
                  // Allow http/https URLs
                  if (url.startsWith("http://") || url.startsWith("https://")) {
                    return url;
                  }
                  // Block other protocols
                  return "";
                }}
                components={{
                  // Custom rendering for images
                  img: ({ src, alt }) => (
                    <img
                      src={src}
                      alt={alt || "Generated image"}
                      style={{
                        maxWidth: "100%",
                        borderRadius: "8px",
                        marginTop: "0.5rem",
                      }}
                    />
                  ),
                  // Custom rendering for code blocks
                  pre: ({ children }) => (
                    <pre
                      style={{
                        background: "#1e1e1e",
                        color: "#d4d4d4",
                        padding: "1rem",
                        borderRadius: "8px",
                        overflow: "auto",
                        fontSize: "0.85rem",
                        margin: "0.5rem 0",
                      }}
                    >
                      {children}
                    </pre>
                  ),
                  // Inline code
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return <code style={{ fontFamily: "monospace" }}>{children}</code>;
                    }
                    return (
                      <code
                        style={{
                          background: "rgba(0,0,0,0.1)",
                          padding: "0.15rem 0.4rem",
                          borderRadius: "4px",
                          fontSize: "0.9em",
                          fontFamily: "monospace",
                        }}
                      >
                        {children}
                      </code>
                    );
                  },
                  // Links
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#007bff", textDecoration: "underline" }}
                    >
                      {children}
                    </a>
                  ),
                  // Paragraphs
                  p: ({ children }) => (
                    <p style={{ margin: "0.5rem 0" }}>{children}</p>
                  ),
                  // Lists
                  ul: ({ children }) => (
                    <ul style={{ margin: "0.5rem 0", paddingLeft: "1.5rem" }}>{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol style={{ margin: "0.5rem 0", paddingLeft: "1.5rem" }}>{children}</ol>
                  ),
                  // Blockquotes
                  blockquote: ({ children }) => (
                    <blockquote
                      style={{
                        borderLeft: "3px solid #ccc",
                        margin: "0.5rem 0",
                        paddingLeft: "1rem",
                        color: "#666",
                      }}
                    >
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {message.content}
              </p>
            )}
            {isStreaming && <span style={styles.cursor}>▊</span>}
          </div>
          {isError && message.errorMessage && (
            <p style={styles.errorMessage}>
              Error: {message.errorMessage}
            </p>
          )}
        </>
      )}
      <StatusIndicator status={message.status} isBot={isBot} />
    </div>
  );
}

function StatusIndicator({ status, isBot }: { status: ChatMessageStatus; isBot: boolean }) {
  if (!isBot) return null;

  const statusText = {
    typing: "Typing...",
    streaming: "Streaming...",
    finished: "",
    error: "Failed",
    sent: "",
    sending: "",
  }[status];

  if (!statusText) return null;

  return (
    <span
      style={{
        ...styles.statusIndicator,
        color: status === "error" ? "#dc3545" : "#666",
      }}
    >
      {statusText}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: "flex",
    height: "100vh",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  container: {
    padding: "2rem",
    maxWidth: "800px",
    margin: "0 auto",
  },
  sidebar: {
    width: "280px",
    borderRight: "1px solid #e0e0e0",
    display: "flex",
    flexDirection: "column",
    background: "#fafafa",
  },
  sidebarHeader: {
    padding: "1rem",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sidebarTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 600,
  },
  backLink: {
    fontSize: "0.85rem",
    color: "#666",
    textDecoration: "none",
  },
  newChatButton: {
    margin: "1rem",
    padding: "0.75rem",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
  sessionList: {
    flex: 1,
    overflow: "auto",
  },
  noSessions: {
    padding: "1rem",
    color: "#666",
    fontSize: "0.9rem",
    textAlign: "center",
  },
  sessionItem: {
    padding: "0.75rem 1rem",
    cursor: "pointer",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #eee",
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  sessionTitle: {
    margin: 0,
    fontSize: "0.9rem",
    fontWeight: 500,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  sessionMeta: {
    margin: "0.25rem 0 0",
    fontSize: "0.75rem",
    color: "#666",
  },
  deleteButton: {
    background: "transparent",
    border: "none",
    fontSize: "1.25rem",
    color: "#999",
    cursor: "pointer",
    padding: "0.25rem 0.5rem",
    lineHeight: 1,
  },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  error: {
    padding: "0.75rem 1rem",
    background: "#fee",
    color: "#c00",
    fontSize: "0.9rem",
  },
  messagesContainer: {
    flex: 1,
    overflow: "auto",
    padding: "1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.75rem",
  },
  emptyState: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#666",
  },
  emptyTitle: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: 500,
  },
  emptySubtitle: {
    margin: "0.5rem 0 0",
    fontSize: "0.9rem",
  },
  messageBubble: {
    maxWidth: "80%",
    padding: "0.75rem 1rem",
    borderRadius: "12px",
    position: "relative",
    overflow: "hidden",
  },
  messageContent: {
    margin: 0,
    wordBreak: "break-word",
    lineHeight: 1.5,
    fontSize: "0.95rem",
  },
  cursor: {
    animation: "blink 1s infinite",
    marginLeft: "2px",
  },
  typingIndicator: {
    display: "flex",
    gap: "4px",
    padding: "0.25rem 0",
  },
  errorMessage: {
    margin: "0.5rem 0 0",
    fontSize: "0.8rem",
    color: "#dc3545",
  },
  statusIndicator: {
    display: "block",
    marginTop: "0.25rem",
    fontSize: "0.7rem",
  },
  inputContainer: {
    padding: "1rem",
    borderTop: "1px solid #e0e0e0",
    display: "flex",
    gap: "0.5rem",
    background: "#fff",
  },
  input: {
    flex: 1,
    padding: "0.75rem",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "0.95rem",
    resize: "none",
    outline: "none",
    fontFamily: "inherit",
  },
  sendButton: {
    padding: "0.75rem 1.5rem",
    background: "#007bff",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "0.9rem",
    fontWeight: 500,
  },
};
