"use client";

import { useEffect, useState, useCallback, useRef, Suspense } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { useSearchParams, useRouter } from "next/navigation";
import {
  createApiClient,
  formatToolResultMessage,
  getToolDisplayInfo,
  type ChatSessionListItem,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatAttentionRange,
  type UnifiedSSEData,
} from "@kaizen/api-client";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  Button,
  Card,
  CardContent,
  Logo,
} from "@kaizen/ui";
import { ArrowLeft, Loader2, Plus, Trash2, Send, MessageSquare } from "lucide-react";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

const ATTENTION_RANGE_LABELS: Record<ChatAttentionRange, string> = {
  "30m": "Last 30 min",
  "2h": "Last 2 hours",
  "1d": "Last 24 hours",
  "all": "All time",
};

// Pending tool call (shown while tool is executing)
interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  sessionId: string;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<main className="p-8 max-w-3xl mx-auto"><Loader2 className="w-6 h-6 animate-spin" /></main>}>
      <ChatPageContent />
    </Suspense>
  );
}

function ChatPageContent() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [sessions, setSessions] = useState<ChatSessionListItem[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [selectedAttentionRange, setSelectedAttentionRange] = useState<ChatAttentionRange>("2h");

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const hasHandledUrlParams = useRef(false);
  const activeSessionIdRef = useRef<string | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
  }, [activeSessionId]);

  // Helper to sort sessions by updatedAt descending
  const sortSessionsByDate = (sessions: ChatSessionListItem[]) =>
    [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // Helper to sort messages by updatedAt ascending
  const sortMessagesByDate = (messages: ChatMessage[]) =>
    [...messages].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Scroll to bottom when messages or pending tool calls change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingToolCalls]);

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
      setSessions(sortSessionsByDate(result));
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

  // Handle URL parameters (new chat with pre-filled prompt)
  useEffect(() => {
    if (!isSignedIn || !sessions.length || hasHandledUrlParams.current) return;

    const isNewChat = searchParams.get("new") === "true";
    const promptParam = searchParams.get("prompt");

    if (isNewChat && promptParam) {
      hasHandledUrlParams.current = true;

      // Set up for new chat with the prompt - session will be created when message is sent
      setActiveSessionId(null);
      setInputValue(promptParam);

      // Clear URL parameters
      router.replace("/chat");
    }
  }, [isSignedIn, sessions, searchParams, router]);

  // Load messages when active session changes
  useEffect(() => {
    setPendingToolCalls([]); // Clear pending tool calls
    if (activeSessionId) {
      fetchMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, fetchMessages]);

  // Setup unified SSE for real-time updates
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

      const api = createApiClient(apiUrl);
      eventSourceRef.current = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          switch (data.type) {
            case "connected":
              console.log("Chat SSE connected");
              break;

            case "chat-session-created":
              setSessions((prev) =>
                sortSessionsByDate([
                  {
                    id: data.session.id,
                    title: data.session.title,
                    attentionRange: data.session.attentionRange as ChatAttentionRange,
                    messageCount: 0,
                    createdAt: data.session.createdAt,
                    updatedAt: data.session.updatedAt,
                  },
                  ...prev,
                ])
              );
              break;

            case "chat-session-updated":
              setSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId
                      ? { ...s, ...data.updates }
                      : s
                  )
                )
              );
              break;

            case "chat-session-deleted":
              setSessions((prev) => prev.filter((s) => s.id !== data.sessionId));
              if (activeSessionIdRef.current === data.sessionId) {
                setActiveSessionId(null);
                setMessages([]);
              }
              break;

            case "chat-message-created":
              if (data.sessionId === activeSessionIdRef.current) {
                setMessages((prev) => sortMessagesByDate([...prev, data.message]));
                // If this is a tool result, remove from pending tool calls
                if (data.message.role === "tool" && data.message.toolCallId) {
                  setPendingToolCalls((prev) =>
                    prev.filter((t) => t.toolCallId !== data.message.toolCallId)
                  );
                }
              }
              // Update message count in session list and re-sort
              setSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId
                      ? { ...s, messageCount: s.messageCount + 1, updatedAt: new Date().toISOString() }
                      : s
                  )
                )
              );
              break;

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
                );
              }
              break;

            case "tool-call-started":
              if (data.sessionId === activeSessionIdRef.current) {
                setPendingToolCalls((prev) => [
                  ...prev,
                  {
                    toolCallId: data.toolCallId,
                    toolName: data.toolName,
                    sessionId: data.sessionId,
                  },
                ]);
              }
              break;
          }
        },
        () => {
          console.error("Chat SSE error");
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
  }, [isSignedIn, clerkUser, getToken]);

  // Get the current session's attention range (or selected range for new chats)
  const getCurrentAttentionRange = (): ChatAttentionRange => {
    if (activeSessionId) {
      const session = sessions.find((s) => s.id === activeSessionId);
      return (session?.attentionRange as ChatAttentionRange) || selectedAttentionRange;
    }
    return selectedAttentionRange;
  };

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
      <main className="min-h-screen bg-background p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading...</span>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-background p-8 max-w-3xl mx-auto">
        <Logo size="md" className="mb-6" />
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare className="w-5 h-5 text-secondary" />
              <h1 className="text-xl font-semibold">Chat</h1>
            </div>
            <p className="text-muted-foreground mb-4">Sign in to start chatting.</p>
            <SignInButton mode="modal">
              <Button>Sign In</Button>
            </SignInButton>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside className="w-72 border-r border-border flex flex-col bg-muted/30">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">Chats</h2>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" />
            Home
          </Link>
        </div>

        <Button onClick={handleNewChat} className="m-4 gap-2">
          <Plus className="w-4 h-4" />
          New Chat
        </Button>

        <div className="flex-1 overflow-auto">
          {sessions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground text-center">No chats yet</p>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={`p-3 cursor-pointer flex items-center justify-between border-b border-border/50 hover:bg-muted/50 transition-colors ${
                  activeSessionId === session.id ? "bg-secondary/10" : ""
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {session.title || "New Chat"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {session.messageCount} messages · {ATTENTION_RANGE_LABELS[session.attentionRange as ChatAttentionRange] || session.attentionRange}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDeleteSession(session.id, e)}
                  className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Chat Header - shows context info for active session */}
        {activeSessionId && (
          <div className="p-2 px-4 border-b border-border bg-muted/30">
            <span className="text-xs text-muted-foreground">
              Context: {ATTENTION_RANGE_LABELS[getCurrentAttentionRange()]}
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 px-4 bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
          {messages.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <MessageSquare className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <p className="text-lg font-medium">Start a conversation</p>
              <p className="text-sm text-muted-foreground mb-6">
                Select the time range of activity context for your chat
              </p>
              <div className="flex gap-2 flex-wrap justify-center">
                {(["30m", "2h", "1d", "all"] as ChatAttentionRange[]).map((range) => (
                  <Button
                    key={range}
                    onClick={() => setSelectedAttentionRange(range)}
                    variant={selectedAttentionRange === range ? "default" : "outline"}
                    size="sm"
                  >
                    {ATTENTION_RANGE_LABELS[range]}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                The AI will have context about your recent browsing activity
              </p>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
              {pendingToolCalls.map((tool) => (
                <PendingToolLine key={tool.toolCallId} toolName={tool.toolName} />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border flex gap-2 bg-background">
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={sending}
            className="flex-1 p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            rows={1}
          />
          <Button
            onClick={handleSend}
            disabled={!inputValue.trim() || sending}
            className="gap-2"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </Button>
        </div>
      </main>
    </div>
  );
}

/**
 * Pending tool call line (shown while tool is executing)
 */
function PendingToolLine({ toolName }: { toolName: string }) {
  const { loadingText } = getToolDisplayInfo(toolName);
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground self-start">
      <span className="text-[8px]">○</span>
      <span className="opacity-70">{loadingText}...</span>
      <Loader2 className="w-3 h-3 animate-spin" />
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const isUser = message.role === "user";
  const isStreaming = message.status === "streaming" || message.status === "typing";
  const isError = message.status === "error";

  // Render tool messages as compact agentic status lines
  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content);
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground self-start">
        <span className="text-[8px]">●</span>
        <span>{text}</span>
      </div>
    );
  }

  return (
    <div
      className={`max-w-[80%] px-4 py-3 rounded-xl relative overflow-hidden ${
        isUser
          ? "self-end bg-primary text-primary-foreground"
          : "self-start bg-muted"
      }`}
    >
      {message.status === "typing" ? (
        <span className="flex gap-1 py-1">
          <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
          <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
          <span className="w-2 h-2 bg-current rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
        </span>
      ) : (
        <>
          <div className="text-sm leading-relaxed break-words">
            {isAssistant ? (
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
                      className="max-w-full rounded-lg mt-2"
                    />
                  ),
                  // Custom rendering for code blocks
                  pre: ({ children }) => (
                    <pre className="bg-slate-900 text-slate-200 p-4 rounded-lg overflow-auto text-xs my-2">
                      {children}
                    </pre>
                  ),
                  // Inline code
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) {
                      return <code className="font-mono">{children}</code>;
                    }
                    return (
                      <code className="bg-black/10 px-1.5 py-0.5 rounded text-[0.9em] font-mono">
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
                      className="text-secondary underline hover:no-underline"
                    >
                      {children}
                    </a>
                  ),
                  // Paragraphs
                  p: ({ children }) => (
                    <p className="my-2 first:mt-0 last:mb-0">{children}</p>
                  ),
                  // Lists
                  ul: ({ children }) => (
                    <ul className="my-2 pl-6 list-disc">{children}</ul>
                  ),
                  ol: ({ children }) => (
                    <ol className="my-2 pl-6 list-decimal">{children}</ol>
                  ),
                  // Blockquotes
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-border my-2 pl-4 text-muted-foreground">
                      {children}
                    </blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap break-words">
                {message.content}
              </p>
            )}
            {isStreaming && <span className="animate-pulse ml-0.5">▊</span>}
          </div>
          {isError && message.errorMessage && (
            <p className="mt-2 text-xs text-destructive">
              Error: {message.errorMessage}
            </p>
          )}
        </>
      )}
      <StatusIndicator status={message.status} isAssistant={isAssistant} />
    </div>
  );
}

function StatusIndicator({ status, isAssistant }: { status: ChatMessageStatus; isAssistant: boolean }) {
  if (!isAssistant) return null;

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
      className={`block mt-1 text-[10px] ${
        status === "error" ? "text-destructive" : "text-muted-foreground"
      }`}
    >
      {statusText}
    </span>
  );
}
