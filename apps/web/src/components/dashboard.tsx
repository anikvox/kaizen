"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useAuth, SignOutButton, useUser } from "@clerk/nextjs";
import {
  createApiClient,
  formatToolResultMessage,
  getToolDisplayInfo,
  type User,
  type Focus,
  type PomodoroStatus,
  type Pulse,
  type UnifiedSSEData,
  type UserSettings,
  type QuizWithAnswers,
  type ChatSessionListItem,
  type ChatMessage,
  type ChatMessageStatus,
  type ChatAttentionRange,
  type LLMModels,
  type LLMProviderType,
  type ModelInfo,
} from "@kaizen/api-client";
import {
  Button,
  Logo,
} from "@kaizen/ui";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  MessageSquare,
  Brain,
  Puzzle,
  Settings,
  LogOut,
  Target,
  Timer,
  Zap,
  Play,
  Pause,
  Clock,
  TrendingUp,
  Sparkles,
  Check,
  X,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Send,
  LayoutDashboard,
  History,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

type TabType = "dashboard" | "journey" | "settings" | "chat";

const ATTENTION_RANGE_LABELS: Record<ChatAttentionRange, string> = {
  "30m": "Last 30 min",
  "2h": "Last 2 hours",
  "1d": "Last 24 hours",
  "all": "All time",
};

interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  sessionId: string;
}

function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function formatDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// Seeded random for consistent shuffling per question
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function shuffleWithSeed<T>(array: T[], seed: number): { shuffled: T[]; indexMap: number[] } {
  const indices = array.map((_, i) => i);
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(seed + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return { shuffled, indexMap: indices };
}

// Helper to sort sessions by updatedAt descending
const sortSessionsByDate = (sessions: ChatSessionListItem[]) =>
  [...sessions].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

// Helper to sort messages by updatedAt ascending
const sortMessagesByDate = (messages: ChatMessage[]) =>
  [...messages].sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());

interface DashboardProps {
  initialTab?: string;
}

export function Dashboard({ initialTab }: DashboardProps) {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>(
    (initialTab as TabType) || "dashboard"
  );
  const [time, setTime] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [error, setError] = useState("");
  const [pomodoroStatus, setPomodoroStatus] = useState<PomodoroStatus | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Quiz state
  const [quiz, setQuiz] = useState<QuizWithAnswers | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);

  // Pulses carousel
  const [pulseIndex, setPulseIndex] = useState(0);

  // Chat state
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [selectedAttentionRange, setSelectedAttentionRange] = useState<ChatAttentionRange>("2h");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeChatSessionIdRef = useRef<string | null>(null);

  // Settings editing state
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ignoreListValue, setIgnoreListValue] = useState("");
  const [ignoreListDirty, setIgnoreListDirty] = useState(false);
  const [llmModels, setLlmModels] = useState<LLMModels | null>(null);
  const [providerModels, setProviderModels] = useState<Partial<Record<LLMProviderType, ModelInfo[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<LLMProviderType, boolean>>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<LLMProviderType, string>>({
    gemini: "",
    anthropic: "",
    openai: "",
  });

  // Keep ref in sync with state
  useEffect(() => {
    activeChatSessionIdRef.current = activeChatSessionId;
  }, [activeChatSessionId]);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, pendingToolCalls, activeTab]);

  // Sync user and fetch authenticated data
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const syncUser = async () => {
      const api = createApiClient(apiUrl, getTokenFn);
      const email = clerkUser.emailAddresses[0]?.emailAddress;
      if (!email) return;

      try {
        const syncedUser = await api.users.sync({
          email,
          name: clerkUser.fullName || undefined,
        });
        setUser(syncedUser);

        // Also fetch current quiz
        try {
          const { quiz: currentQuiz } = await api.quiz.getCurrent();
          if (currentQuiz) {
            setQuiz(currentQuiz);
            if (!currentQuiz.completedAt) {
              const answeredIndices = new Set(currentQuiz.answers.map(a => a.questionIndex));
              const firstUnanswered = currentQuiz.questions.findIndex((_, i) => !answeredIndices.has(i));
              setQuizCurrentIndex(firstUnanswered >= 0 ? firstUnanswered : 0);
            }
          }
        } catch (err) {
          console.error("Failed to load quiz:", err);
        }

        // Fetch chat sessions
        try {
          const sessions = await api.chats.list();
          setChatSessions(sortSessionsByDate(sessions));
        } catch (err) {
          console.error("Failed to load chat sessions:", err);
        }

        // Fetch LLM models and settings for settings tab
        try {
          const [settingsResult, modelsResult] = await Promise.all([
            api.settings.get(),
            api.settings.getLLMModels(),
          ]);
          setSettings(settingsResult);
          setIgnoreListValue(settingsResult.attentionTrackingIgnoreList || "");
          setIgnoreListDirty(false);
          setLlmModels(modelsResult);

          // Fetch dynamic models for providers with API keys
          const providers: LLMProviderType[] = ["gemini", "anthropic", "openai"];
          for (const provider of providers) {
            const hasKey =
              (provider === "gemini" && settingsResult.hasGeminiApiKey) ||
              (provider === "anthropic" && settingsResult.hasAnthropicApiKey) ||
              (provider === "openai" && settingsResult.hasOpenaiApiKey);

            if (hasKey) {
              api.settings.getModelsForProvider(provider)
                .then((models) => setProviderModels((prev) => ({ ...prev, [provider]: models })))
                .catch(() => {
                  setProviderModels((prev) => ({ ...prev, [provider]: modelsResult[provider] }));
                });
            }
          }
        } catch (err) {
          console.error("Failed to load settings:", err);
        }
      } catch (err) {
        console.error("Sync error:", err);
        setError("Failed to sync user");
      }
    };

    syncUser();
  }, [isSignedIn, clerkUser, getTokenFn]);

  // Fetch messages when active chat session changes
  const fetchChatMessages = useCallback(async (sessionId: string) => {
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.chats.get(sessionId);
      setChatMessages(result.messages);
    } catch (err) {
      console.error("Fetch messages error:", err);
    }
  }, [getTokenFn]);

  useEffect(() => {
    setPendingToolCalls([]);
    if (activeChatSessionId) {
      fetchChatMessages(activeChatSessionId);
    } else {
      setChatMessages([]);
    }
  }, [activeChatSessionId, fetchChatMessages]);

  // Unified SSE connection
  useEffect(() => {
    if (!isSignedIn) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) {
        setError("No token available");
        return;
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      const api = createApiClient(apiUrl);
      eventSourceRef.current = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          setError("");

          switch (data.type) {
            case "connected":
              setFocuses(data.focuses);
              setPomodoroStatus(data.pomodoro);
              setPulses(data.pulses);
              setSettings(data.settings);
              break;

            case "focus-changed":
              if (data.changeType === "ended") {
                setFocuses((prev) => prev.filter((f) => f.id !== data.focus?.id));
              } else if (data.changeType === "created" && data.focus) {
                setFocuses((prev) => [data.focus!, ...prev]);
              } else if (data.focus) {
                setFocuses((prev) =>
                  prev.map((f) => (f.id === data.focus!.id ? data.focus! : f))
                );
              }
              break;

            case "pomodoro-tick":
            case "pomodoro-status-changed":
              setPomodoroStatus(data.status);
              break;

            case "pulses-updated":
              setPulses(data.pulses);
              break;

            case "settings-changed":
              setSettings((prev) => prev ? { ...prev, ...data.settings } : null);
              if (!ignoreListDirty && data.settings.attentionTrackingIgnoreList !== undefined) {
                setIgnoreListValue(data.settings.attentionTrackingIgnoreList || "");
              }
              break;

            case "ping":
              setTime(data.time);
              break;

            // Chat events
            case "chat-session-created":
              setChatSessions((prev) =>
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
              setChatSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId ? { ...s, ...data.updates } : s
                  )
                )
              );
              break;

            case "chat-session-deleted":
              setChatSessions((prev) => prev.filter((s) => s.id !== data.sessionId));
              if (activeChatSessionIdRef.current === data.sessionId) {
                setActiveChatSessionId(null);
                setChatMessages([]);
              }
              break;

            case "chat-message-created":
              if (data.sessionId === activeChatSessionIdRef.current) {
                setChatMessages((prev) => sortMessagesByDate([...prev, data.message]));
                if (data.message.role === "tool" && data.message.toolCallId) {
                  setPendingToolCalls((prev) =>
                    prev.filter((t) => t.toolCallId !== data.message.toolCallId)
                  );
                }
              }
              setChatSessions((prev) =>
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
              if (data.sessionId === activeChatSessionIdRef.current) {
                setChatMessages((prev) =>
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
              if (data.sessionId === activeChatSessionIdRef.current) {
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
        () => setError("SSE connection error"),
        token
      );
    };

    setupSSE();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, getToken]);

  const handlePomodoroToggle = async () => {
    const api = createApiClient(apiUrl, getTokenFn);
    if (pomodoroStatus?.state === "paused") {
      const result = await api.pomodoro.resume();
      setPomodoroStatus(result.status);
    } else if (pomodoroStatus?.state === "running") {
      const result = await api.pomodoro.pause();
      setPomodoroStatus(result.status);
    }
  };

  // Settings handlers
  const handleSettingsToggle = async (key: keyof UserSettings) => {
    if (!settings) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.settings.update({ [key]: !settings[key] });
      setSettings(result);
    } catch (err) {
      console.error("Update settings error:", err);
      setError("Failed to update settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveIgnoreList = async () => {
    if (!settings) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.settings.update({
        attentionTrackingIgnoreList: ignoreListValue.trim() || null,
      });
      setSettings(result);
      setIgnoreListDirty(false);
    } catch (err) {
      console.error("Update ignore list error:", err);
      setError("Failed to update ignore list");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSettingsUpdate = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.settings.update(updates);
      setSettings(result);
    } catch (err) {
      console.error("Update settings error:", err);
      setError("Failed to update settings");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleProviderChange = async (provider: LLMProviderType | "") => {
    if (!settings) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const newProvider = provider || null;
      const models = newProvider ? (providerModels[newProvider] || llmModels?.[newProvider]) : null;
      const newModel = models?.[0]?.id || null;
      const result = await api.settings.update({
        llmProvider: newProvider,
        llmModel: newModel,
      });
      setSettings(result);
    } catch (err) {
      console.error("Update provider error:", err);
      setError("Failed to update provider");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleModelChange = async (model: string) => {
    if (!settings) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.settings.update({ llmModel: model || null });
      setSettings(result);
    } catch (err) {
      console.error("Update model error:", err);
      setError("Failed to update model");
    } finally {
      setSettingsSaving(false);
    }
  };

  const fetchModelsForProvider = useCallback(async (provider: LLMProviderType) => {
    const api = createApiClient(apiUrl, getTokenFn);
    setLoadingModels((prev) => ({ ...prev, [provider]: true }));
    try {
      const models = await api.settings.getModelsForProvider(provider);
      setProviderModels((prev) => ({ ...prev, [provider]: models }));
    } catch (err) {
      console.error(`Failed to fetch models for ${provider}:`, err);
      if (llmModels?.[provider]) {
        setProviderModels((prev) => ({ ...prev, [provider]: llmModels[provider] }));
      }
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, [getTokenFn, llmModels]);

  const handleApiKeySave = async (provider: LLMProviderType) => {
    const key = apiKeyInputs[provider];
    if (!key.trim()) return;
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const keyField = `${provider}ApiKey` as const;
      const result = await api.settings.update({ [keyField]: key });
      setSettings(result);
      setApiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      fetchModelsForProvider(provider);
    } catch (err) {
      console.error("Save API key error:", err);
      setError("Failed to save API key");
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleApiKeyClear = async (provider: LLMProviderType) => {
    setSettingsSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const keyField = `${provider}ApiKey` as const;
      const updates: Record<string, unknown> = { [keyField]: null };
      if (settings?.llmProvider === provider) {
        updates.llmProvider = null;
        updates.llmModel = null;
      }
      const result = await api.settings.update(updates);
      setSettings(result);
      setProviderModels((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
    } catch (err) {
      console.error("Clear API key error:", err);
      setError("Failed to clear API key");
    } finally {
      setSettingsSaving(false);
    }
  };

  const hasApiKey = (provider: LLMProviderType): boolean => {
    if (!settings) return false;
    switch (provider) {
      case "gemini": return !!settings.hasGeminiApiKey;
      case "anthropic": return !!settings.hasAnthropicApiKey;
      case "openai": return !!settings.hasOpenaiApiKey;
      default: return false;
    }
  };

  // Quiz handlers
  const generateQuiz = async () => {
    setQuizLoading(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const { jobId } = await api.quiz.generate();
      const pollStatus = async () => {
        const result = await api.quiz.getJobStatus(jobId);
        if (result.status === "completed" && result.quiz) {
          setQuiz(result.quiz);
          setQuizCurrentIndex(0);
          setQuizLoading(false);
        } else if (result.status === "failed") {
          setQuizLoading(false);
        } else {
          setTimeout(pollStatus, 1000);
        }
      };
      pollStatus();
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      setQuizLoading(false);
    }
  };

  const submitQuizAnswer = async (displayIndex: number) => {
    if (!quiz || submittingAnswer) return;
    const question = quiz.questions[quizCurrentIndex];
    const seed = quizCurrentIndex * 1000 + parseInt(quiz.id.replace(/\D/g, "").slice(0, 6) || "0", 10);
    const { indexMap } = shuffleWithSeed(question.options, seed);
    const originalIndex = indexMap[displayIndex];

    setSubmittingAnswer(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.quiz.submitAnswer(quiz.id, quizCurrentIndex, originalIndex);
      if (result.success) {
        setQuiz(result.quiz);
        setTimeout(() => {
          if (!result.quiz.completedAt) {
            const answeredIndices = new Set(result.quiz.answers.map(a => a.questionIndex));
            const nextIndex = result.quiz.questions.findIndex((_, i) => i > quizCurrentIndex && !answeredIndices.has(i));
            if (nextIndex >= 0) {
              setQuizCurrentIndex(nextIndex);
            }
          }
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to submit answer:", err);
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // Chat handlers
  const handleChatSend = async () => {
    if (!chatInput.trim() || chatSending) return;

    setChatSending(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.chats.sendMessage({
        sessionId: activeChatSessionId || undefined,
        content: chatInput.trim(),
        attentionRange: activeChatSessionId ? undefined : selectedAttentionRange,
      });

      setChatInput("");

      if (result.isNewSession) {
        setActiveChatSessionId(result.sessionId);
      }
    } catch (err) {
      console.error("Send message error:", err);
      setError("Failed to send message");
    } finally {
      setChatSending(false);
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleChatSend();
    }
  };

  const handleDeleteChatSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this chat?")) return;

    const api = createApiClient(apiUrl, getTokenFn);
    try {
      await api.chats.delete(sessionId);
    } catch (err) {
      console.error("Delete session error:", err);
    }
  };

  const handleNewChat = () => {
    setActiveChatSessionId(null);
    setChatMessages([]);
  };

  const shuffledQuizOptions = useMemo(() => {
    if (!quiz || quizCurrentIndex >= quiz.questions.length) return null;
    const question = quiz.questions[quizCurrentIndex];
    const seed = quizCurrentIndex * 1000 + parseInt(quiz.id.replace(/\D/g, "").slice(0, 6) || "0", 10);
    return shuffleWithSeed(question.options, seed);
  }, [quiz, quizCurrentIndex]);

  const quizCurrentAnswer = useMemo(() => {
    if (!quiz) return null;
    return quiz.answers.find(a => a.questionIndex === quizCurrentIndex);
  }, [quiz, quizCurrentIndex]);

  const quizScore = useMemo(() => {
    if (!quiz) return 0;
    return quiz.answers.filter(a => a.isCorrect).length;
  }, [quiz]);

  const isRunning = pomodoroStatus?.state === "running";
  const isPaused = pomodoroStatus?.state === "paused";
  const isCooldown = pomodoroStatus?.state === "cooldown";
  const isPomodoroActive = isRunning || isPaused || isCooldown;
  const hasFocus = focuses.length > 0;
  const firstName = user?.name?.split(" ")[0] || "";

  const tabs = [
    { id: "dashboard" as TabType, label: "Dashboard", icon: LayoutDashboard },
    { id: "journey" as TabType, label: "Journey", icon: History },
    { id: "settings" as TabType, label: "Settings", icon: Settings },
    { id: "chat" as TabType, label: "Chat", icon: MessageSquare },
  ];

  return (
    <div className={`bg-background flex flex-col ${activeTab === "chat" ? "h-screen overflow-hidden" : "min-h-screen"}`}>
      {/* Header */}
      <header className="border-b border-border/40 bg-background flex-shrink-0 z-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size="md" />
              <div>
                <h1 className="text-lg font-semibold text-secondary">
                  Good {getTimeOfDay()}, {firstName || "there"}
                </h1>
                <p className="text-xs text-muted-foreground">{formatDate()}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xl font-mono font-medium">
                {time ? new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "--:--"}
              </span>
              <div className="flex items-center gap-2">
                <SignOutButton>
                  <Button variant="ghost" size="sm" className="w-9 h-9 p-0">
                    <LogOut className="w-4 h-4" />
                  </Button>
                </SignOutButton>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav className="flex gap-6 -mb-px">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-secondary text-secondary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* Main content */}
      {activeTab === "chat" ? (
        <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full px-6 py-6">
          <div className="flex h-full rounded-2xl border border-border bg-card overflow-hidden">
            {/* Chat Sidebar */}
            <aside className="w-64 border-r border-border flex flex-col bg-muted/30 flex-shrink-0">
              <div className="p-3 border-b border-border">
              <Button onClick={handleNewChat} className="w-full gap-2" size="sm">
                <Plus className="w-4 h-4" />
                New Chat
              </Button>
            </div>

            <div className="flex-1 overflow-auto">
              {chatSessions.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground text-center">No chats yet</p>
              ) : (
                chatSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => setActiveChatSessionId(session.id)}
                    className={`p-3 cursor-pointer flex items-center justify-between border-b border-border/50 hover:bg-muted/50 transition-colors ${
                      activeChatSessionId === session.id ? "bg-secondary/10" : ""
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {session.title || "New Chat"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.messageCount} msgs
                      </p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteChatSession(session.id, e)}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          {/* Chat Main Area */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0">
            {error && (
              <div className="p-3 px-4 bg-destructive/10 text-destructive text-sm">
                {error}
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-auto p-4 flex flex-col gap-3">
              {chatMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center">
                  <MessageSquare className="w-12 h-12 text-muted-foreground/50 mb-4" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm text-muted-foreground mb-6">
                    Select the time range of activity context
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
                </div>
              ) : (
                <>
                  {chatMessages.map((message) => (
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
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleChatKeyDown}
                placeholder="Type a message..."
                disabled={chatSending}
                className="flex-1 p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                rows={1}
              />
              <Button
                onClick={handleChatSend}
                disabled={!chatInput.trim() || chatSending}
              >
                {chatSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
          </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full px-6 py-6">
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Left Column */}
              <div className="space-y-4">
                {/* Focus Card */}
                <div className={`rounded-2xl border p-6 ${
                  hasFocus ? "bg-focus/5 border-focus/20" : "bg-card border-border"
                }`}>
                  {hasFocus ? (
                    <>
                      <div className="flex items-center gap-2 mb-4">
                        <Target className="w-4 h-4 text-focus" />
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Active Focus
                        </span>
                      </div>
                      {focuses.slice(0, 2).map((focus) => (
                        <div key={focus.id} className="mb-3 last:mb-0">
                          <p className="font-semibold text-lg">{focus.item}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>Since {new Date(focus.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {focus.keywords.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{focus.keywords.slice(0, 2).join(", ")}</span>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Target className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold mb-1">No Active Focus</h3>
                      <p className="text-sm text-muted-foreground">
                        Start a focus session to track your progress
                      </p>
                    </div>
                  )}
                </div>

                {/* Attention Progress / Pomodoro */}
                <div className={`rounded-2xl border p-6 ${
                  isPomodoroActive ? "bg-pomodoro/5 border-pomodoro/20" : "bg-card border-border"
                }`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Attention Progress
                      </span>
                    </div>
                    {isPomodoroActive && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        isRunning ? "bg-pomodoro/20 text-pomodoro" :
                        isPaused ? "bg-amber-500/20 text-amber-600" :
                        "bg-cyan-500/20 text-cyan-600"
                      }`}>
                        {pomodoroStatus?.state}
                      </span>
                    )}
                  </div>

                  {isPomodoroActive ? (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`text-4xl font-bold font-mono ${
                          isRunning ? "text-pomodoro" :
                          isPaused ? "text-amber-500" :
                          "text-cyan-500"
                        }`}>
                          {formatTime(pomodoroStatus?.elapsedSeconds || 0)}
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">Focus time today</p>
                      </div>
                      {(isRunning || isPaused) && (
                        <Button
                          onClick={handlePomodoroToggle}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                          {isPaused ? "Resume" : "Pause"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <TrendingUp className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No attention data yet</p>
                      <p className="text-xs text-muted-foreground mt-1">Start focusing to see your progress</p>
                    </div>
                  )}
                </div>

                {/* Activity Pulse */}
                <div className="rounded-2xl border bg-card border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Activity Pulse
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{pulses.length} total</span>
                  </div>

                  {pulses.length > 0 ? (
                    <>
                      <div className="min-h-[80px]">
                        <div className="flex items-start gap-3">
                          <Sparkles className="w-4 h-4 text-amber-500 mt-1 flex-shrink-0" />
                          <div>
                            <p className="text-sm">{pulses[pulseIndex]?.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {pulses[pulseIndex] && new Date(pulses[pulseIndex].createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      </div>
                      {pulses.length > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-4">
                          <button
                            onClick={() => setPulseIndex((i) => (i - 1 + pulses.length) % pulses.length)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <div className="flex gap-1">
                            {pulses.slice(0, 5).map((_, i) => (
                              <span
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                                  i === pulseIndex ? "bg-amber-500" : "bg-muted"
                                }`}
                              />
                            ))}
                          </div>
                          <button
                            onClick={() => setPulseIndex((i) => (i + 1) % pulses.length)}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-muted-foreground">No pulses yet</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-4">
                {/* Knowledge Check */}
                <div className="rounded-2xl border bg-card border-border p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Brain className="w-4 h-4 text-pulse" />
                      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Knowledge Check
                      </span>
                    </div>
                    {quiz && !quiz.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        {quiz.answers.length}/{quiz.questions.length}
                      </span>
                    )}
                  </div>

                  {quizLoading ? (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 rounded-full bg-pulse/10 flex items-center justify-center mx-auto mb-3 animate-pulse">
                        <Brain className="w-5 h-5 text-pulse" />
                      </div>
                      <p className="text-sm text-muted-foreground">Generating quiz...</p>
                    </div>
                  ) : quiz && !quiz.completedAt && shuffledQuizOptions ? (
                    <div>
                      <div className="w-full h-1 bg-muted rounded-full mb-4">
                        <div
                          className="h-1 bg-pulse rounded-full transition-all"
                          style={{ width: `${(quiz.answers.length / quiz.questions.length) * 100}%` }}
                        />
                      </div>
                      <p className="font-medium mb-4">{quiz.questions[quizCurrentIndex].question}</p>
                      <div className="space-y-2">
                        {shuffledQuizOptions.shuffled.map((option, displayIndex) => {
                          const originalIndex = shuffledQuizOptions.indexMap[displayIndex];
                          const hasAnswered = quizCurrentAnswer != null;
                          const isSelected = hasAnswered && quizCurrentAnswer!.selectedIndex === originalIndex;
                          const isCorrect = originalIndex === quiz.questions[quizCurrentIndex].correctIndex;
                          const showCorrect = hasAnswered && isCorrect;
                          const showWrong = hasAnswered && isSelected && !isCorrect;

                          return (
                            <button
                              key={displayIndex}
                              onClick={() => submitQuizAnswer(displayIndex)}
                              disabled={hasAnswered || submittingAnswer}
                              className={`w-full p-3 text-left text-sm rounded-lg border transition-all ${
                                showCorrect
                                  ? "bg-accent/20 border-accent"
                                  : showWrong
                                    ? "bg-destructive/20 border-destructive"
                                    : hasAnswered
                                      ? "bg-muted border-border"
                                      : "bg-muted/50 border-border hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span>{option}</span>
                                {showCorrect && <Check className="w-4 h-4 text-accent" />}
                                {showWrong && <X className="w-4 h-4 text-destructive" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : quiz?.completedAt ? (
                    <div className="text-center py-6">
                      <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-4">
                        <Check className="w-6 h-6 text-accent" />
                      </div>
                      <h3 className="font-semibold mb-1">All Caught Up!</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Score: {quizScore}/{quiz.questions.length}
                      </p>
                      <Button onClick={generateQuiz} variant="outline" size="sm" className="gap-2">
                        <RotateCcw className="w-3 h-3" />
                        New Quiz
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Brain className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h3 className="font-semibold mb-1">No Quiz Available</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Generate a quiz based on your browsing
                      </p>
                      <Button onClick={generateQuiz} size="sm" className="gap-2">
                        <Brain className="w-3 h-3" />
                        Generate Quiz
                      </Button>
                    </div>
                  )}
                </div>

                {/* Today's Stats */}
                <div className="rounded-2xl border bg-card border-border p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Timer className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Today&apos;s Stats
                    </span>
                  </div>

                  {isPomodoroActive || focuses.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Focus sessions</span>
                        <span className="font-semibold">{focuses.length}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Time focused</span>
                        <span className="font-semibold font-mono">
                          {formatTime(pomodoroStatus?.elapsedSeconds || 0)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Learning pulses</span>
                        <span className="font-semibold">{pulses.length}</span>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                        <Clock className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm text-muted-foreground">No data yet - start focusing to see stats</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "journey" && (
            <div className="rounded-2xl border bg-card border-border p-8 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <History className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Learning Journey</h2>
              <p className="text-muted-foreground mb-4">
                Your learning history and progress will appear here.
              </p>
              <p className="text-sm text-muted-foreground">Coming soon...</p>
            </div>
          )}

          {activeTab === "settings" && (
            <div className="space-y-4">
              {/* Quick Settings Card */}
              <div className="rounded-2xl border bg-card border-border p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Quick Settings</h2>
                  <Link href="/settings">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Settings className="w-4 h-4" />
                      All Settings
                    </Button>
                  </Link>
                </div>

                {settings && (
                  <div className="space-y-4">
                    {/* Debug Mode */}
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div>
                        <p className="font-medium">Debug Mode</p>
                        <p className="text-sm text-muted-foreground">Show attention tracking overlay</p>
                      </div>
                      <Button
                        onClick={() => handleSettingsToggle("cognitiveAttentionDebugMode")}
                        disabled={settingsSaving}
                        variant={settings.cognitiveAttentionDebugMode ? "default" : "outline"}
                        size="sm"
                      >
                        {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
                      </Button>
                    </div>

                    {/* Show Overlay */}
                    <div className="flex items-center justify-between py-3 border-b border-border">
                      <div>
                        <p className="font-medium">Show Overlay</p>
                        <p className="text-sm text-muted-foreground">Visual attention indicators</p>
                      </div>
                      <Button
                        onClick={() => handleSettingsToggle("cognitiveAttentionShowOverlay")}
                        disabled={settingsSaving}
                        variant={settings.cognitiveAttentionShowOverlay ? "default" : "outline"}
                        size="sm"
                      >
                        {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
                      </Button>
                    </div>

                    {/* AI Provider */}
                    <div className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">AI Provider</p>
                        <p className="text-sm text-muted-foreground">Current LLM configuration</p>
                      </div>
                      <span className="text-sm font-medium">
                        {settings.llmProvider ? PROVIDER_LABELS[settings.llmProvider as LLMProviderType] : "System Default"}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Linked Extensions */}
              <div className="rounded-2xl border bg-card border-border p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold mb-1">Linked Extensions</h2>
                    <p className="text-sm text-muted-foreground">
                      Manage browser extensions connected to your account
                    </p>
                  </div>
                  <Link href="/extensions">
                    <Button variant="outline" size="sm" className="gap-2">
                      <Puzzle className="w-4 h-4" />
                      Manage
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Chat message components
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
                  if (url.startsWith("data:")) return url;
                  if (url.startsWith("http://") || url.startsWith("https://")) return url;
                  return "";
                }}
                components={{
                  img: ({ src, alt }) => (
                    <img src={src} alt={alt || "Generated image"} className="max-w-full rounded-lg mt-2" />
                  ),
                  pre: ({ children }) => (
                    <pre className="bg-slate-900 text-slate-200 p-4 rounded-lg overflow-auto text-xs my-2">
                      {children}
                    </pre>
                  ),
                  code: ({ children, className }) => {
                    const isBlock = className?.includes("language-");
                    if (isBlock) return <code className="font-mono">{children}</code>;
                    return <code className="bg-black/10 px-1.5 py-0.5 rounded text-[0.9em] font-mono">{children}</code>;
                  },
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-secondary underline hover:no-underline">
                      {children}
                    </a>
                  ),
                  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="my-2 pl-6 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="my-2 pl-6 list-decimal">{children}</ol>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-3 border-border my-2 pl-4 text-muted-foreground">{children}</blockquote>
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            ) : (
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            )}
            {isStreaming && <span className="animate-pulse ml-0.5">▊</span>}
          </div>
          {isError && message.errorMessage && (
            <p className="mt-2 text-xs text-destructive">Error: {message.errorMessage}</p>
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
    <span className={`block mt-1 text-[10px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
      {statusText}
    </span>
  );
}
