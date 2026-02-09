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
  type ChatAttachment,
  type LLMModels,
  type LLMProviderType,
  type ModelInfo,
  type JourneyResponse,
  type JourneySite,
} from "@kaizen/api-client";
import { Button, Logo, Card, ThemeToggle, ToggleSwitch } from "@kaizen/ui";
import { HealthTab } from "./health-tab";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
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
  ChevronDown,
  Send,
  LayoutDashboard,
  History,
  Plus,
  Trash2,
  Loader2,
  Globe,
  ExternalLink,
  ArrowRight,
  Paperclip,
  FileIcon,
  Download,
  Image as ImageIcon,
  RefreshCw,
  Heart,
  User as UserIcon,
} from "lucide-react";

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

type TabType = "dashboard" | "focus" | "health" | "journey" | "settings" | "chat";

const ATTENTION_RANGE_LABELS: Record<ChatAttentionRange, string> = {
  "30m": "Last 30 min",
  "2h": "Last 2 hours",
  "1d": "Last 24 hours",
  all: "All time",
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

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

// Seeded random for consistent shuffling per question
function seededRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function shuffleWithSeed<T>(
  array: T[],
  seed: number,
): { shuffled: T[]; indexMap: number[] } {
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
  [...sessions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

// Helper to sort messages by updatedAt ascending
const sortMessagesByDate = (messages: ChatMessage[]) =>
  [...messages].sort(
    (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
  );

interface DashboardProps {
  initialTab?: string;
}

export function Dashboard({ initialTab }: DashboardProps) {
  const { isSignedIn, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>(
    (initialTab as TabType) || "dashboard",
  );
  const [time, setTime] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [focuses, setFocuses] = useState<Focus[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [error, setError] = useState("");
  const [pomodoroStatus, setPomodoroStatus] = useState<PomodoroStatus | null>(
    null,
  );
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Quiz state
  const [quiz, setQuiz] = useState<QuizWithAnswers | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizCurrentIndex, setQuizCurrentIndex] = useState(0);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);

  // Pulses carousel
  const [pulseIndex, setPulseIndex] = useState(0);

  // Chat state
  const [chatSessions, setChatSessions] = useState<ChatSessionListItem[]>([]);
  const [activeChatSessionId, setActiveChatSessionId] = useState<string | null>(
    null,
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [pendingToolCalls, setPendingToolCalls] = useState<PendingToolCall[]>(
    [],
  );
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [selectedAttentionRange, setSelectedAttentionRange] =
    useState<ChatAttentionRange>("2h");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const activeChatSessionIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Settings editing state
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [ignoreListValue, setIgnoreListValue] = useState("");
  const [ignoreListDirty, setIgnoreListDirty] = useState(false);
  const [llmModels, setLlmModels] = useState<LLMModels | null>(null);
  const [providerModels, setProviderModels] = useState<
    Partial<Record<LLMProviderType, ModelInfo[]>>
  >({});
  const [loadingModels, setLoadingModels] = useState<
    Partial<Record<LLMProviderType, boolean>>
  >({});
  const [apiKeyInputs, setApiKeyInputs] = useState<
    Record<LLMProviderType, string>
  >({
    gemini: "",
    anthropic: "",
    openai: "",
  });

  // Journey state
  const [journeyData, setJourneyData] = useState<JourneyResponse | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(false);
  const [journeyDays, setJourneyDays] = useState(7);

  // Focus history state
  const [focusHistory, setFocusHistory] = useState<Focus[] | null>(null);
  const [focusHistoryLoading, setFocusHistoryLoading] = useState(false);

  // Chat sidebar state
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);

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
              const answeredIndices = new Set(
                currentQuiz.answers.map((a) => a.questionIndex),
              );
              const firstUnanswered = currentQuiz.questions.findIndex(
                (_, i) => !answeredIndices.has(i),
              );
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
          const providers: LLMProviderType[] = [
            "gemini",
            "anthropic",
            "openai",
          ];
          for (const provider of providers) {
            const hasKey =
              (provider === "gemini" && settingsResult.hasGeminiApiKey) ||
              (provider === "anthropic" && settingsResult.hasAnthropicApiKey) ||
              (provider === "openai" && settingsResult.hasOpenaiApiKey);

            if (hasKey) {
              api.settings
                .getModelsForProvider(provider)
                .then((models) =>
                  setProviderModels((prev) => ({
                    ...prev,
                    [provider]: models,
                  })),
                )
                .catch(() => {
                  setProviderModels((prev) => ({
                    ...prev,
                    [provider]: modelsResult[provider],
                  }));
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
  const fetchChatMessages = useCallback(
    async (sessionId: string) => {
      const api = createApiClient(apiUrl, getTokenFn);
      try {
        const result = await api.chats.get(sessionId);
        setChatMessages(result.messages);
      } catch (err) {
        console.error("Fetch messages error:", err);
      }
    },
    [getTokenFn],
  );

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
              // Sync server theme preference to local
              if (data.settings.themeMode) {
                const serverTheme = data.settings.themeMode;
                const localTheme = localStorage.getItem("kaizen-theme");
                if (!localTheme && serverTheme === "dark") {
                  document.documentElement.classList.add("dark");
                  localStorage.setItem("kaizen-theme", "dark");
                }
              }
              break;

            case "focus-changed":
              if (data.changeType === "ended") {
                setFocuses((prev) =>
                  prev.filter((f) => f.id !== data.focus?.id),
                );
              } else if (data.changeType === "created" && data.focus) {
                setFocuses((prev) => [data.focus!, ...prev]);
              } else if (data.focus) {
                setFocuses((prev) =>
                  prev.map((f) => (f.id === data.focus!.id ? data.focus! : f)),
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
              setSettings((prev) =>
                prev ? { ...prev, ...data.settings } : null,
              );
              if (
                !ignoreListDirty &&
                data.settings.attentionTrackingIgnoreList !== undefined
              ) {
                setIgnoreListValue(
                  data.settings.attentionTrackingIgnoreList || "",
                );
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
                    attentionRange: data.session
                      .attentionRange as ChatAttentionRange,
                    messageCount: 0,
                    createdAt: data.session.createdAt,
                    updatedAt: data.session.updatedAt,
                  },
                  ...prev,
                ]),
              );
              break;

            case "chat-session-updated":
              setChatSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId ? { ...s, ...data.updates } : s,
                  ),
                ),
              );
              break;

            case "chat-session-deleted":
              setChatSessions((prev) =>
                prev.filter((s) => s.id !== data.sessionId),
              );
              if (activeChatSessionIdRef.current === data.sessionId) {
                setActiveChatSessionId(null);
                setChatMessages([]);
              }
              break;

            case "chat-message-created":
              if (data.sessionId === activeChatSessionIdRef.current) {
                setChatMessages((prev) =>
                  sortMessagesByDate([...prev, data.message]),
                );
                if (data.message.role === "tool" && data.message.toolCallId) {
                  setPendingToolCalls((prev) =>
                    prev.filter(
                      (t) => t.toolCallId !== data.message.toolCallId,
                    ),
                  );
                }
              }
              setChatSessions((prev) =>
                sortSessionsByDate(
                  prev.map((s) =>
                    s.id === data.sessionId
                      ? {
                        ...s,
                        messageCount: s.messageCount + 1,
                        updatedAt: new Date().toISOString(),
                      }
                      : s,
                  ),
                ),
              );
              break;

            case "chat-message-updated":
              if (data.sessionId === activeChatSessionIdRef.current) {
                setChatMessages((prev) =>
                  sortMessagesByDate(
                    prev.map((m) =>
                      m.id === data.messageId
                        ? {
                          ...m,
                          ...data.updates,
                          updatedAt: new Date().toISOString(),
                        }
                        : m,
                    ),
                  ),
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
        token,
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
  const handleThemeChange = async (theme: "light" | "dark") => {
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      await api.settings.update({ themeMode: theme });
    } catch (err) {
      console.error("Update theme error:", err);
    }
  };

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
      const models = newProvider
        ? providerModels[newProvider] || llmModels?.[newProvider]
        : null;
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

  const fetchModelsForProvider = useCallback(
    async (provider: LLMProviderType) => {
      const api = createApiClient(apiUrl, getTokenFn);
      setLoadingModels((prev) => ({ ...prev, [provider]: true }));
      try {
        const models = await api.settings.getModelsForProvider(provider);
        setProviderModels((prev) => ({ ...prev, [provider]: models }));
      } catch (err) {
        console.error(`Failed to fetch models for ${provider}:`, err);
        if (llmModels?.[provider]) {
          setProviderModels((prev) => ({
            ...prev,
            [provider]: llmModels[provider],
          }));
        }
      } finally {
        setLoadingModels((prev) => ({ ...prev, [provider]: false }));
      }
    },
    [getTokenFn, llmModels],
  );

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
      case "gemini":
        return !!settings.hasGeminiApiKey;
      case "anthropic":
        return !!settings.hasAnthropicApiKey;
      case "openai":
        return !!settings.hasOpenaiApiKey;
      default:
        return false;
    }
  };

  // Journey data fetch
  const fetchJourneyData = useCallback(
    async (days: number) => {
      setJourneyLoading(true);
      const api = createApiClient(apiUrl, getTokenFn);
      try {
        const data = await api.journey.get(days);
        setJourneyData(data);
      } catch (err) {
        console.error("Failed to fetch journey data:", err);
      } finally {
        setJourneyLoading(false);
      }
    },
    [getTokenFn],
  );

  // Fetch journey data when tab changes
  useEffect(() => {
    if (activeTab === "journey" && !journeyData && !journeyLoading) {
      fetchJourneyData(journeyDays);
    }
  }, [activeTab, journeyData, journeyLoading, journeyDays, fetchJourneyData]);

  // Focus history data fetch
  const fetchFocusHistory = useCallback(async () => {
    setFocusHistoryLoading(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const focuses = await api.focus.list({ limit: 100, includeActive: true });
      setFocusHistory(focuses);
    } catch (err) {
      console.error("Failed to fetch focus history:", err);
      // Set empty array on error to prevent infinite retry
      setFocusHistory([]);
    } finally {
      setFocusHistoryLoading(false);
    }
  }, [getTokenFn]);

  // Fetch focus history when tab changes
  useEffect(() => {
    if (activeTab === "focus" && focusHistory === null && !focusHistoryLoading) {
      fetchFocusHistory();
    }
  }, [activeTab, focusHistory, focusHistoryLoading, fetchFocusHistory]);

  // Quiz handlers
  const generateQuiz = async () => {
    setQuizLoading(true);
    setQuizError(null);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const generateResult = await api.quiz.generate();

      // Check if generation failed immediately (e.g., no activity data)
      if (generateResult.status === "failed") {
        setQuizLoading(false);
        if ((generateResult as any).code === "NO_ACTIVITY_DATA") {
          setQuizError(
            "Not enough browsing activity to generate a quiz. Keep exploring!",
          );
        } else {
          setQuizError(
            (generateResult as any).error ||
            "Failed to generate quiz. Please try again.",
          );
        }
        return;
      }

      const { jobId } = generateResult;
      if (!jobId) {
        setQuizLoading(false);
        setQuizError("Failed to start quiz generation.");
        return;
      }

      const pollStatus = async () => {
        const result = await api.quiz.getJobStatus(jobId);
        if (result.status === "completed" && result.quiz) {
          setQuiz(result.quiz);
          setQuizCurrentIndex(0);
          setQuizLoading(false);
        } else if (result.status === "failed") {
          setQuizLoading(false);
          if (result.code === "NO_ACTIVITY_DATA") {
            setQuizError(
              "Not enough browsing activity to generate a quiz. Keep exploring!",
            );
          } else {
            setQuizError("Failed to generate quiz. Please try again.");
          }
        } else {
          setTimeout(pollStatus, 1000);
        }
      };
      pollStatus();
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      setQuizLoading(false);
      setQuizError("Failed to generate quiz. Please try again.");
    }
  };

  const submitQuizAnswer = async (displayIndex: number) => {
    if (!quiz || submittingAnswer) return;
    const question = quiz.questions[quizCurrentIndex];
    const seed =
      quizCurrentIndex * 1000 +
      parseInt(quiz.id.replace(/\D/g, "").slice(0, 6) || "0", 10);
    const { indexMap } = shuffleWithSeed(question.options, seed);
    const originalIndex = indexMap[displayIndex];

    setSubmittingAnswer(true);
    const api = createApiClient(apiUrl, getTokenFn);
    try {
      const result = await api.quiz.submitAnswer(
        quiz.id,
        quizCurrentIndex,
        originalIndex,
      );
      if (result.success) {
        setQuiz(result.quiz);
        setTimeout(() => {
          if (!result.quiz.completedAt) {
            const answeredIndices = new Set(
              result.quiz.answers.map((a) => a.questionIndex),
            );
            const nextIndex = result.quiz.questions.findIndex(
              (_, i) => i > quizCurrentIndex && !answeredIndices.has(i),
            );
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

  // File attachment helpers
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_FILES = 5;

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove data:*/*;base64, prefix
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles: File[] = [];

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`File "${file.name}" exceeds 5MB limit`);
        continue;
      }
      if (selectedFiles.length + validFiles.length >= MAX_FILES) {
        setError(`Maximum ${MAX_FILES} files allowed`);
        break;
      }
      validFiles.push(file);
    }

    setSelectedFiles((prev) => [...prev, ...validFiles]);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const isImageFile = (file: File) => file.type.startsWith("image/");

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  // Chat handlers
  const handleChatSend = async () => {
    if ((!chatInput.trim() && selectedFiles.length === 0) || chatSending)
      return;

    setChatSending(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      // Convert files to base64 attachments
      const attachments: ChatAttachment[] = await Promise.all(
        selectedFiles.map(async (file) => ({
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          data: await fileToBase64(file),
        })),
      );

      const result = await api.chats.sendMessage({
        sessionId: activeChatSessionId || undefined,
        content: chatInput.trim() || "(Attached files)",
        attentionRange: activeChatSessionId
          ? undefined
          : selectedAttentionRange,
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      setChatInput("");
      setSelectedFiles([]);
      // Reset textarea height
      if (chatTextareaRef.current) {
        chatTextareaRef.current.style.height = "44px";
      }

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

  const handleDeleteChatSession = async (
    sessionId: string,
    e: React.MouseEvent,
  ) => {
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
    const seed =
      quizCurrentIndex * 1000 +
      parseInt(quiz.id.replace(/\D/g, "").slice(0, 6) || "0", 10);
    return shuffleWithSeed(question.options, seed);
  }, [quiz, quizCurrentIndex]);

  const quizCurrentAnswer = useMemo(() => {
    if (!quiz) return null;
    return quiz.answers.find((a) => a.questionIndex === quizCurrentIndex);
  }, [quiz, quizCurrentIndex]);

  const quizScore = useMemo(() => {
    if (!quiz) return 0;
    return quiz.answers.filter((a) => a.isCorrect).length;
  }, [quiz]);

  const isRunning = pomodoroStatus?.state === "running";
  const isPaused = pomodoroStatus?.state === "paused";
  const isCooldown = pomodoroStatus?.state === "cooldown";
  const isPomodoroActive = isRunning || isPaused || isCooldown;
  const hasFocus = focuses.length > 0;
  const firstName = user?.name?.split(" ")[0] || "";

  const tabs = [
    { id: "dashboard" as TabType, label: "Dashboard", icon: LayoutDashboard },
    { id: "focus" as TabType, label: "Focus", icon: Target },
    { id: "health" as TabType, label: "Health", icon: Heart },
    { id: "journey" as TabType, label: "Journey", icon: History },
    { id: "settings" as TabType, label: "Settings", icon: Settings },
    { id: "chat" as TabType, label: "Chat", icon: MessageSquare },
  ];

  return (
    <div
      className={`bg-background flex flex-col ${activeTab === "chat" || activeTab === "dashboard" ? "h-screen overflow-hidden" : "min-h-screen"}`}
    >
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background/60 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <Logo size="md" />
              <nav className="hidden md:flex items-center gap-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all duration-200 ${activeTab === tab.id
                      ? "bg-secondary/10 text-secondary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle onChange={handleThemeChange} />
              <SignOutButton>
                <Button variant="ghost" size="sm" className="w-10 h-10 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors">
                  <LogOut className="w-4 h-4" />
                </Button>
              </SignOutButton>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      {activeTab === "chat" ? (
        <div className="flex-1 min-h-0 max-w-6xl mx-auto w-full px-6 pt-6 pb-14 flex flex-col overflow-hidden">
          <div className="flex flex-1 min-h-0 rounded-2xl border border-border bg-card overflow-hidden">
            {/* Chat Sidebar */}
            <aside
              className={`border-r border-white/4 flex flex-col bg-muted/20 backdrop-blur-xl flex-shrink-0 transition-all duration-300 ${chatSidebarCollapsed ? "w-14" : "w-72"
                }`}
            >
              <div className="p-3 border-b border-white/5 flex items-center gap-2 -ml-1 mt-1">
                {!chatSidebarCollapsed && (
                  <Button
                    onClick={handleNewChat}
                    className="flex-1 gap-2 rounded-xl shadow-premium"
                    size="sm"
                    variant="premium"
                  >
                    <Plus className="w-4 h-4" />
                    New Chat
                  </Button>
                )}
                <Button
                  onClick={() => setChatSidebarCollapsed(!chatSidebarCollapsed)}
                  variant="ghost"
                  size="sm"
                  className={`w-10 h-10 p-0 flex-shrink-0 rounded-xl transition-all ${chatSidebarCollapsed
                    ? "bg-black dark:bg-white rounded-full hover:bg-black/80 dark:hover:bg-white/80"
                    : "hover:bg-white/5"
                    }`}
                >
                  {chatSidebarCollapsed ? (
                    <ChevronRight className="w-5 h-5 text-white dark:text-black" />
                  ) : (
                    <ChevronLeft className="w-5 h-5 text-muted-foreground" />
                  )}
                </Button>
              </div>

              {chatSidebarCollapsed ? (
                <div className="flex-1 flex flex-col items-center pt-4 gap-4 -mt-2">
                  <Button
                    onClick={handleNewChat}
                    variant="premium"
                    size="sm"
                    className="w-10 h-10 p-0 rounded-xl shadow-premium"
                  >
                    <Plus className="w-5 h-5" />
                  </Button>
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-2 space-y-1">
                  {chatSessions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center px-4">
                      <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mb-3">
                        <MessageSquare className="w-6 h-6 text-muted-foreground/40" />
                      </div>
                      <p className="text-xs text-muted-foreground font-medium">
                        No conversations yet
                      </p>
                    </div>
                  ) : (
                    chatSessions.map((session) => (
                      <div
                        key={session.id}
                        onClick={() => setActiveChatSessionId(session.id)}
                        className={`group p-3 cursor-pointer flex flex-col gap-1 rounded-xl transition-all duration-200 ${activeChatSessionId === session.id
                          ? "bg-secondary/10 shadow-sm border border-secondary/20"
                          : "hover:bg-white/5 border border-transparent"
                          }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm font-semibold truncate ${activeChatSessionId === session.id ? "text-secondary" : "text-foreground/80"
                            }`}>
                            {session.title || "Untitled Chat"}
                          </p>
                          <button
                            onClick={(e) =>
                              handleDeleteChatSession(session.id, e)
                            }
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground/60">
                            {session.messageCount} messages
                            <br />
                            {new Date(session.createdAt).toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })} - {new Date(session.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </aside>

            {/* Chat Main Area */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0">
              {error && (
                <div className="p-3 px-4 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
                  <span>{error}</span>
                  {error.toLowerCase().includes("sse") && (
                    <button
                      onClick={() => window.location.reload()}
                      className="ml-4 flex items-center gap-1.5 px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-medium rounded-lg transition-colors"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Reload
                    </button>
                  )}
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
                      {(["30m", "2h", "1d", "all"] as ChatAttentionRange[]).map(
                        (range) => (
                          <Button
                            key={range}
                            onClick={() => setSelectedAttentionRange(range)}
                            variant={
                              selectedAttentionRange === range
                                ? "default"
                                : "outline"
                            }
                            size="sm"
                          >
                            {ATTENTION_RANGE_LABELS[range]}
                          </Button>
                        ),
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((message) => (
                      <MessageBubble key={message.id} message={message} userImageUrl={clerkUser?.imageUrl} />
                    ))}
                    {pendingToolCalls.map((tool) => (
                      <PendingToolLine
                        key={tool.toolCallId}
                        toolName={tool.toolName}
                      />
                    ))}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div className="border-t border-border bg-background">
                {/* File preview area */}
                {selectedFiles.length > 0 && (
                  <div className="px-4 pt-3 flex flex-wrap gap-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted text-sm"
                      >
                        {isImageFile(file) ? (
                          <ImageIcon className="w-4 h-4 text-secondary" />
                        ) : (
                          <FileIcon className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span className="max-w-[120px] truncate">
                          {file.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({formatFileSize(file.size)})
                        </span>
                        <button
                          onClick={() => removeFile(index)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-4 flex gap-2">
                  {/* Hidden file input */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    className="hidden"
                    accept="image/*,.pdf,.txt,.md,.json,.csv"
                  />

                  {/* Attachment button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={chatSending || selectedFiles.length >= MAX_FILES}
                    className="w-9 h-9 p-0 flex-shrink-0 mt-1"
                  >
                    <Paperclip className="w-4 h-4" />
                  </Button>

                  <textarea
                    ref={chatTextareaRef}
                    value={chatInput}
                    onChange={(e) => {
                      setChatInput(e.target.value);
                      // Auto-resize textarea
                      const textarea = chatTextareaRef.current;
                      if (textarea) {
                        textarea.style.height = "auto";
                        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
                      }
                    }}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Type a message..."
                    disabled={chatSending}
                    className="flex-1 p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring overflow-y-auto"
                    rows={1}
                    style={{ minHeight: "50px", maxHeight: "120px" }}
                  />
                  <Button
                    onClick={handleChatSend}
                    className="mt-1"
                    disabled={
                      (!chatInput.trim() && selectedFiles.length === 0) ||
                      chatSending
                    }
                  >
                    {chatSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className={`flex-1 min-h-0 max-w-6xl mx-auto w-full px-6 ${activeTab === "dashboard" ? "pt-3 pb-10 overflow-auto" : "py-6 pb-12"}`}>
          {error && (
            <div className="mb-4 p-4 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center justify-between">
              <span>{error}</span>
              {error.toLowerCase().includes("sse") && (
                <button
                  onClick={() => window.location.reload()}
                  className="ml-4 flex items-center gap-1.5 px-3 py-1.5 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-xs font-medium rounded-lg transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reload
                </button>
              )}
            </div>
          )}

          {activeTab === "dashboard" && (
            <div className="space-y-3">
              {/* Greeting */}
              <div>
                <h1 className="text-2xl font-semibold font-grotesk">
                  Good {getTimeOfDay()}, {firstName + " 👋" || "there" + " 👋"}
                </h1>
                <p className="text-sm text-muted-foreground">{formatDate()}</p>
              </div>

              <div className="grid lg:grid-cols-2 gap-3">
                {/* Left Column */}
                <div className="space-y-3">
                  {/* Focus Card */}
                  <Card
                    className={`p-4 overflow-hidden ${hasFocus
                      ? "bg-focus/5 border-focus/20"
                      : ""
                      }`}
                  >
                    {hasFocus ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-7 h-7 rounded-lg bg-focus/10 flex items-center justify-center">
                            <Target className="w-3.5 h-3.5 text-focus" />
                          </div>
                          <span className="text-xs font-semibold font-grotesk uppercase tracking-wider text-muted-foreground">
                            Active Focus
                          </span>
                        </div>
                        {focuses.slice(0, 2).map((focus) => (
                          <div key={focus.id} className="mb-3 last:mb-0 relative pl-4">
                            <div className="absolute left-0 top-1 bottom-1 w-1 bg-focus rounded-full" />
                            <p className="font-bold font-grotesk text-lg tracking-tight">
                              {focus.item}
                            </p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1 bg-muted/50 px-2 py-0.5 rounded-md">
                                <Clock className="w-3 h-3" />
                                <span>
                                  {new Date(focus.startedAt).toLocaleTimeString(
                                    [],
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
                                </span>
                              </div>
                              {focus.keywords.length > 0 && (
                                <div className="flex gap-1.5">
                                  {focus.keywords.slice(0, 2).map(k => (
                                    <span key={k} className="bg-secondary/10 text-secondary px-2 py-0.5 rounded-md">
                                      {k}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </>
                    ) : (
                      <div className="text-center py-4 relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-transparent pointer-events-none" />
                        <div className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center mx-auto mb-2 border border-white/10 shadow-inner">
                          <Target className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                        <h3 className="font-bold font-grotesk text-sm">No Active Focus</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Start a focus session to track your progress
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Attention Progress / Pomodoro */}
                  <Card
                    className={`p-4 ${isPomodoroActive
                      ? "bg-pomodoro/5 border-pomodoro/20"
                      : ""
                      }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                          <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <span className="text-xs font-semibold font-grotesk uppercase tracking-wider text-muted-foreground">
                          Attention Progress
                        </span>
                      </div>
                      {isPomodoroActive && (
                        <div
                          className={`text-[10px] font-bold font-grotesk uppercase tracking-widest px-2 py-0.5 rounded-md ${isRunning
                            ? "bg-pomodoro/20 text-pomodoro"
                            : isPaused
                              ? "bg-amber-500/20 text-amber-600"
                              : "bg-cyan-500/20 text-cyan-600"
                            }`}
                        >
                          {pomodoroStatus?.state}
                        </div>
                      )}
                    </div>

                    {isPomodoroActive ? (
                      <div className="flex items-end justify-between">
                        <div>
                          <p
                            className={`text-4xl font-black font-grotesk tracking-tighter ${isRunning
                              ? "text-pomodoro"
                              : isPaused
                                ? "text-amber-500"
                                : "text-cyan-500"
                              }`}
                          >
                            {formatTime(pomodoroStatus?.elapsedSeconds || 0)}
                          </p>
                          <p className="text-xs font-medium text-muted-foreground mt-2 uppercase tracking-wide">
                            Focus time today
                          </p>
                        </div>
                        {(isRunning || isPaused) && (
                          <Button
                            onClick={handlePomodoroToggle}
                            variant="secondary"
                            size="sm"
                            className="gap-2 rounded-full shadow-smooth"
                          >
                            {isPaused ? (
                              <Play className="w-3.5 h-3.5" />
                            ) : (
                              <Pause className="w-3.5 h-3.5" />
                            )}
                            {isPaused ? "Resume" : "Pause"}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-4 relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-transparent pointer-events-none" />
                        <div className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center mx-auto mb-2 border border-white/10 shadow-inner">
                          <TrendingUp className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                        <p className="font-bold font-grotesk text-sm">No attention data yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Start focusing to see your progress
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Activity Pulse */}
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <Zap className="w-3.5 h-3.5 text-amber-500" />
                        </div>
                        <span className="text-xs font-semibold font-grotesk uppercase tracking-wider text-muted-foreground">
                          Activity Pulse
                        </span>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                        {pulses.length} total
                      </span>
                    </div>

                    {pulses.length > 0 ? (
                      <>
                        <div className="min-h-[60px] flex flex-col justify-center">
                          <div className="flex items-start gap-3">
                            <Sparkles className="w-4 h-4 text-amber-500 mt-1 flex-shrink-0 animate-pulse" />
                            <div>
                              <p className="text-sm font-medium leading-relaxed">
                                {pulses[pulseIndex]?.message}
                              </p>
                              <p className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1.5 font-bold font-grotesk">
                                {pulses[pulseIndex] &&
                                  new Date(
                                    pulses[pulseIndex].createdAt,
                                  ).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                              </p>
                            </div>
                          </div>
                        </div>
                        {pulses.length > 1 && (
                          <div className="flex items-center justify-center gap-2 mt-3">
                            <button
                              onClick={() =>
                                setPulseIndex(
                                  (i) =>
                                    (i - 1 + pulses.length) % pulses.length,
                                )
                              }
                              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <div className="flex gap-1.5">
                              {pulses.slice(0, 5).map((_, i) => (
                                <button
                                  key={i}
                                  onClick={() => setPulseIndex(i)}
                                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${i === pulseIndex
                                    ? "bg-amber-500 w-4"
                                    : "bg-muted hover:bg-muted-foreground/30"
                                    }`}
                                />
                              ))}
                            </div>
                            <button
                              onClick={() =>
                                setPulseIndex((i) => (i + 1) % pulses.length)
                              }
                              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground transition-colors"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4 relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-transparent pointer-events-none" />
                        <div className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center mx-auto mb-2 border border-white/10 shadow-inner">
                          <Zap className="w-5 h-5 text-muted-foreground/50" />
                        </div>
                        <p className="font-bold font-grotesk text-sm">No pulses yet</p>
                      </div>
                    )}
                  </Card>
                </div>

                {/* Right Column */}
                <div className="space-y-3">
                  {/* Knowledge Check */}
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-pulse/10 flex items-center justify-center">
                          <Brain className="w-3.5 h-3.5 text-pulse" />
                        </div>
                        <span className="text-xs font-semibold font-grotesk uppercase tracking-wider text-muted-foreground">
                          Knowledge Check
                        </span>
                      </div>
                      {quiz && !quiz.completedAt && (
                        <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-0.5 rounded-md">
                          {quiz.answers.length}/{quiz.questions.length}
                        </span>
                      )}
                    </div>

                    {quizLoading ? (
                      <div className="text-center py-4">
                        <div className="w-11 h-11 rounded-xl bg-pulse/5 flex items-center justify-center mx-auto mb-2 animate-pulse border border-pulse/20">
                          <Brain className="w-5 h-5 text-pulse/40" />
                        </div>
                        <p className="text-sm text-muted-foreground animate-pulse">
                          Generating your personalized quiz...
                        </p>
                      </div>
                    ) : quiz && !quiz.completedAt && shuffledQuizOptions ? (
                      <div className="space-y-3">
                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-pulse rounded-full transition-all duration-500 ease-out"
                            style={{
                              width: `${(quiz.answers.length / quiz.questions.length) * 100}%`,
                            }}
                          />
                        </div>
                        <p className="font-bold font-grotesk text-base leading-snug">
                          {quiz.questions[quizCurrentIndex].question}
                        </p>
                        <div className="grid gap-2">
                          {shuffledQuizOptions.shuffled.map(
                            (option, displayIndex) => {
                              const originalIndex =
                                shuffledQuizOptions.indexMap[displayIndex];
                              const hasAnswered = quizCurrentAnswer != null;
                              const isSelected =
                                hasAnswered &&
                                quizCurrentAnswer!.selectedIndex ===
                                originalIndex;
                              const isCorrect =
                                originalIndex ===
                                quiz.questions[quizCurrentIndex].correctIndex;
                              const showCorrect = hasAnswered && isCorrect;
                              const showWrong =
                                hasAnswered && isSelected && !isCorrect;

                              return (
                                <button
                                  key={displayIndex}
                                  onClick={() => submitQuizAnswer(displayIndex)}
                                  disabled={hasAnswered || submittingAnswer}
                                  className={`w-full p-3 text-left text-sm rounded-lg border transition-all duration-200 group relative overflow-hidden ${showCorrect
                                    ? "bg-accent/10 border-accent shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]"
                                    : showWrong
                                      ? "bg-destructive/10 border-destructive shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]"
                                      : hasAnswered
                                        ? "bg-muted/30 border-transparent opacity-60"
                                        : "bg-muted/50 border-white/5 hover:bg-muted hover:border-white/20 shadow-sm"
                                    }`}
                                >
                                  <div className="flex items-center justify-between relative z-10">
                                    <span className="font-medium">{option}</span>
                                    {showCorrect && (
                                      <div className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center shadow-lg animate-in zoom-in">
                                        <Check className="w-3 h-3" strokeWidth={3} />
                                      </div>
                                    )}
                                    {showWrong && (
                                      <div className="w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center shadow-lg animate-in zoom-in">
                                        <X className="w-3 h-3" strokeWidth={3} />
                                      </div>
                                    )}
                                  </div>
                                </button>
                              );
                            },
                          )}
                        </div>
                      </div>
                    ) : quiz?.completedAt ? (
                      <div className="text-center py-4">
                        <div className="w-12 h-12 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-3 border border-accent/20 shadow-lg shadow-accent/5">
                          <Check className="w-6 h-6 text-accent" />
                        </div>
                        <h3 className="text-lg font-bold font-grotesk mb-1">All Caught Up!</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Great job! Your score: <span className="font-bold font-grotesk text-foreground">{quizScore}/{quiz.questions.length}</span>
                        </p>
                        <Button
                          onClick={generateQuiz}
                          variant="secondary"
                          size="sm"
                          className="gap-2 rounded-full px-6 shadow-premium"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          New Quiz
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-4">
                        <div className="w-12 h-12 rounded-2xl bg-muted/30 flex items-center justify-center mx-auto mb-3 border border-white/10 shadow-inner">
                          <Brain className="w-6 h-6 text-muted-foreground/30" />
                        </div>
                        <h3 className="text-base font-bold font-grotesk mb-1">
                          No Quiz Available
                        </h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-[200px] mx-auto">
                          {quizError ||
                            "Generate a personalized quiz based on your focus activity"}
                        </p>
                        <Button
                          onClick={generateQuiz}
                          size="sm"
                          className="gap-2 rounded-full px-8 shadow-premium"
                          disabled={quizLoading}
                        >
                          {quizLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )}
                          {quizLoading ? "Analyzing..." : "Generate Quiz"}
                        </Button>
                      </div>
                    )}
                  </Card>

                  {/* Today's Stats */}
                  <Card className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-7 h-7 rounded-lg bg-muted/50 flex items-center justify-center">
                        <Timer className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <span className="text-xs font-semibold font-grotesk uppercase tracking-wider text-muted-foreground">
                        Today&apos;s Stats
                      </span>
                    </div>

                    {isPomodoroActive || focuses.length > 0 ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-white/5">
                          <span className="text-sm font-medium text-muted-foreground">
                            Focus sessions
                          </span>
                          <span className="font-bold font-grotesk text-base">
                            {focuses.length}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-white/5">
                          <span className="text-sm font-medium text-muted-foreground">
                            Time focused
                          </span>
                          <span className="font-bold font-grotesk text-base tracking-tight">
                            {formatTime(pomodoroStatus?.elapsedSeconds || 0)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 border border-white/5">
                          <span className="text-sm font-medium text-muted-foreground">
                            Learning pulses
                          </span>
                          <span className="font-bold font-grotesk text-base">{pulses.length}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-4 relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-muted/5 to-transparent pointer-events-none" />
                        <div className="w-11 h-11 rounded-xl bg-muted/30 flex items-center justify-center mx-auto mb-2 border border-white/10 shadow-inner">
                          <Clock className="w-5 h-5 text-muted-foreground/30" />
                        </div>
                        <p className="font-bold font-grotesk text-sm">No data yet</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Focus sessions will appear here
                        </p>
                      </div>
                    )}
                  </Card>
                </div>
              </div>
            </div>
          )}

          {
            activeTab === "focus" && (
              <div className="space-y-6">
                {/* Focus Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Focus History</h2>
                    <p className="text-sm text-muted-foreground">
                      Your detected focus sessions and learning activities
                    </p>
                  </div>
                  <Button
                    onClick={fetchFocusHistory}
                    variant="ghost"
                    size="sm"
                    disabled={focusHistoryLoading}
                    className="w-9 h-9 p-0"
                  >
                    {focusHistoryLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* Loading State */}
                {focusHistoryLoading && (focusHistory === null || focusHistory.length === 0) && (
                  <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                )}

                {/* Active Focus Sessions */}
                {focusHistory && focusHistory.filter((f) => f.isActive).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-focus animate-pulse" />
                      Active Sessions
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {focusHistory
                        .filter((f) => f.isActive)
                        .map((focus) => (
                          <FocusCard key={focus.id} focus={focus} />
                        ))}
                    </div>
                  </div>
                )}

                {/* Past Focus Sessions */}
                {focusHistory && focusHistory.filter((f) => !f.isActive).length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground">
                      Past Sessions
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {focusHistory
                        .filter((f) => !f.isActive)
                        .map((focus) => (
                          <FocusCard key={focus.id} focus={focus} />
                        ))}
                    </div>
                  </div>
                )}

                {/* Empty State */}
                {!focusHistoryLoading && focusHistory !== null && focusHistory.length === 0 && (
                  <div className="rounded-2xl border bg-card border-border p-12 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                      <Target className="w-8 h-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">
                      No Focus Sessions Yet
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      Start browsing with the extension enabled to see your
                      detected focus sessions here.
                    </p>
                  </div>
                )}
              </div>
            )
          }

          {
            activeTab === "health" && (
              <HealthTab apiUrl={apiUrl} getToken={getToken} />
            )
          }

          {
            activeTab === "journey" && (
              <div className="flex gap-6">
                {/* Main Content */}
                <div className="flex-1 min-w-0 space-y-4">
                  {/* Journey Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold">Journey Graph</h2>
                      <p className="text-sm text-muted-foreground">
                        Visualize your browsing patterns and navigation flow
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => fetchJourneyData(journeyDays)}
                        variant="ghost"
                        size="sm"
                        disabled={journeyLoading}
                        className="w-9 h-9 p-0"
                      >
                        {journeyLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <RotateCcw className="w-4 h-4" />
                        )}
                      </Button>
                      <div className="relative">
                        <select
                          value={journeyDays}
                          onChange={(e) => {
                            const days = Number(e.target.value);
                            setJourneyDays(days);
                            setJourneyData(null);
                            fetchJourneyData(days);
                          }}
                          className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer transition-all hover:bg-muted/50"
                        >
                          <option value={1}>Last 24 hours</option>
                          <option value={3}>Last 3 days</option>
                          <option value={7}>Last 7 days</option>
                          <option value={14}>Last 14 days</option>
                          <option value={30}>Last 30 days</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Loading State */}
                  {journeyLoading && !journeyData && (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                    </div>
                  )}

                  {/* Journey Cards Grid */}
                  {journeyData && journeyData.sites.length > 0 && (
                    <div className="grid md:grid-cols-2 gap-4">
                      {journeyData.sites.map((site) => {
                        const minutes = site.totalActiveTimeMs / 60000;
                        const timeColor =
                          minutes < 1
                            ? "bg-blue-500"
                            : minutes < 5
                              ? "bg-purple-500"
                              : minutes < 15
                                ? "bg-amber-500"
                                : "bg-red-500";
                        const timeColorLight =
                          minutes < 1
                            ? "bg-blue-500/20"
                            : minutes < 5
                              ? "bg-purple-500/20"
                              : minutes < 15
                                ? "bg-amber-500/20"
                                : "bg-red-500/20";

                        const keywords = site.titles
                          .flatMap((t) => t.split(/[\s\-|:,]+/))
                          .filter((w) => w.length > 3 && w.length < 15)
                          .map((w) => w.toLowerCase())
                          .filter((w, i, arr) => arr.indexOf(w) === i)
                          .slice(0, 4);

                        return (
                          <div
                            key={site.domain}
                            className="rounded-2xl border bg-card border-border p-4 hover:border-secondary/50 transition-colors group"
                          >
                            {/* Card Header */}
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-lg bg-secondary/10 flex items-center justify-center overflow-hidden">
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                                    alt=""
                                    className="w-5 h-5"
                                    onError={(e) => {
                                      (
                                        e.target as HTMLImageElement
                                      ).style.display = "none";
                                      (
                                        e.target as HTMLImageElement
                                      ).parentElement!.innerHTML =
                                        '<svg class="w-4 h-4 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>';
                                    }}
                                  />
                                </div>
                                <div>
                                  <a
                                    href={`https://${site.domain}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-medium hover:text-secondary transition-colors"
                                  >
                                    {site.domain}
                                  </a>
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {new Date(site.lastVisitedAt).toLocaleTimeString(
                                  [],
                                  { hour: "2-digit", minute: "2-digit" },
                                )}
                              </span>
                            </div>

                            {/* Keywords Tags */}
                            {keywords.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {keywords.map((keyword) => (
                                  <span
                                    key={keyword}
                                    className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground"
                                  >
                                    {keyword}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Journey Info */}
                            <div className={`rounded-xl p-3 ${timeColorLight}`}>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-2 h-2 rounded-full ${timeColor}`}
                                  />
                                  <span className="text-xs font-medium">
                                    {site.totalVisits} visit
                                    {site.totalVisits !== 1 ? "s" : ""}
                                  </span>
                                  {site.topReferrers.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      from {site.topReferrers[0].domain}
                                    </span>
                                  )}
                                </div>
                                <span className="text-xs text-muted-foreground">
                                  {site.uniquePages} page
                                  {site.uniquePages !== 1 ? "s" : ""}
                                </span>
                              </div>

                              {/* Site Favicon Row */}
                              <div className="flex items-center gap-1">
                                <div
                                  className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center cursor-help relative group/tip"
                                  title={site.titles[0] || site.domain}
                                >
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                                    alt=""
                                    className="w-4 h-4"
                                  />
                                </div>
                                {site.topReferrers.slice(0, 3).map((ref) => (
                                  <div
                                    key={ref.domain}
                                    className="w-7 h-7 rounded-lg bg-background border border-border flex items-center justify-center cursor-help opacity-60 hover:opacity-100 transition-opacity"
                                    title={`From: ${ref.domain} (${ref.count}x)`}
                                  >
                                    <img
                                      src={`https://www.google.com/s2/favicons?domain=${ref.domain}&sz=32`}
                                      alt=""
                                      className="w-4 h-4"
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Footer Stats */}
                            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                              <span>
                                {site.topReferrers.length} referrer
                                {site.topReferrers.length !== 1 ? "s" : ""}
                              </span>
                              <span>
                                {formatDuration(site.totalActiveTimeMs)} total
                              </span>
                            </div>

                            {/* Hover Summary Tooltip */}
                            {site.titles[0] && (
                              <div className="mt-2 pt-2 border-t border-border/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {site.titles[0]}
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Navigation Flows */}
                  {journeyData && journeyData.referrerFlows.length > 0 && (
                    <div className="rounded-2xl border bg-card border-border p-4">
                      <h3 className="text-sm font-medium mb-3">
                        Navigation Patterns
                      </h3>
                      <div className="grid gap-2">
                        {journeyData.referrerFlows
                          .slice(0, 8)
                          .map((flow, idx) => (
                            <div
                              key={`${flow.from}-${flow.to}-${idx}`}
                              className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 text-sm"
                            >
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${flow.from}&sz=32`}
                                alt=""
                                className="w-4 h-4"
                              />
                              <span className="truncate max-w-[100px]">
                                {flow.from}
                              </span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${flow.to}&sz=32`}
                                alt=""
                                className="w-4 h-4"
                              />
                              <span className="truncate max-w-[100px]">
                                {flow.to}
                              </span>
                              <span className="text-muted-foreground ml-auto flex-shrink-0">
                                {flow.count}×
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Empty State */}
                  {journeyData && journeyData.sites.length === 0 && (
                    <div className="rounded-2xl border bg-card border-border p-12 text-center">
                      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                        <Globe className="w-8 h-8 text-muted-foreground" />
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        No Activity Yet
                      </h3>
                      <p className="text-muted-foreground text-sm">
                        Start browsing with the extension enabled to see your
                        learning journey here.
                      </p>
                    </div>
                  )}
                </div>

                {/* Right Sidebar */}
                <aside className="w-56 flex-shrink-0 space-y-4 hidden lg:block">
                  {/* Legend */}
                  <div className="rounded-2xl border bg-card border-border p-4">
                    <h4 className="text-sm font-medium mb-3">Legend</h4>
                    <p className="text-xs text-muted-foreground mb-2">
                      Time Spent
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-blue-500" />
                        <span className="text-muted-foreground">&lt; 1 min</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-purple-500" />
                        <span className="text-muted-foreground">1-5 min</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span className="text-muted-foreground">5-15 min</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-3 h-3 rounded-full bg-red-500" />
                        <span className="text-muted-foreground">&gt; 15 min</span>
                      </div>
                    </div>
                  </div>

                  {/* Statistics */}
                  {journeyData && (
                    <div className="rounded-2xl border bg-card border-border p-4">
                      <h4 className="text-sm font-medium mb-3">Statistics</h4>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Sites</span>
                          <span className="font-medium">
                            {journeyData.summary.totalSites}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Total Visits
                          </span>
                          <span className="font-medium">
                            {journeyData.summary.totalVisits}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Active Time
                          </span>
                          <span className="font-medium">
                            {formatDuration(
                              journeyData.summary.totalActiveTimeMs,
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Avg/Site</span>
                          <span className="font-medium">
                            {journeyData.summary.avgVisitsPerSite}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Sites */}
                  {journeyData && journeyData.sites.length > 0 && (
                    <div className="rounded-2xl border bg-card border-border p-4">
                      <h4 className="text-sm font-medium mb-3">Top Sites</h4>
                      <div className="space-y-2">
                        {journeyData.sites.slice(0, 5).map((site) => (
                          <div
                            key={site.domain}
                            className="p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-center gap-2">
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${site.domain}&sz=32`}
                                alt=""
                                className="w-4 h-4"
                              />
                              <span className="text-sm font-medium truncate">
                                {site.domain}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {site.totalVisits} visits · {site.uniquePages} pages
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </aside>
              </div>
            )
          }

          {
            activeTab === "settings" && (
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
                          <p className="text-sm text-muted-foreground">
                            Show attention tracking overlay
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.cognitiveAttentionDebugMode ?? false}
                          onCheckedChange={() =>
                            handleSettingsToggle("cognitiveAttentionDebugMode")
                          }
                          disabled={settingsSaving}
                          size="sm"
                        />
                      </div>

                      {/* Show Overlay */}
                      <div className="flex items-center justify-between py-3 border-b border-border">
                        <div>
                          <p className="font-medium">Show Overlay</p>
                          <p className="text-sm text-muted-foreground">
                            Visual attention indicators
                          </p>
                        </div>
                        <ToggleSwitch
                          checked={settings.cognitiveAttentionShowOverlay ?? false}
                          onCheckedChange={() =>
                            handleSettingsToggle("cognitiveAttentionShowOverlay")
                          }
                          disabled={settingsSaving}
                          size="sm"
                        />
                      </div>

                      {/* AI Provider */}
                      <div className="flex items-center justify-between py-3">
                        <div>
                          <p className="font-medium">AI Provider</p>
                          <p className="text-sm text-muted-foreground">
                            Current LLM configuration
                          </p>
                        </div>
                        <span className="text-sm font-medium">
                          {settings.llmProvider
                            ? PROVIDER_LABELS[
                            settings.llmProvider as LLMProviderType
                            ]
                            : "System Default"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Linked Extensions */}
                <div className="rounded-2xl border bg-card border-border p-6 border-teal-300">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold mb-1">
                        Linked Extensions
                      </h2>
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
            )
          }
        </div >
      )}

      {/* Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-8 bg-muted/50 border-t border-border/40 z-40">
        <div className="max-w-6xl mx-auto px-6 h-full flex items-center">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div
              className={`w-1.5 h-1.5 rounded-full ${time ? "bg-accent" : "bg-muted-foreground"}`}
            />
            <span>{time ? "Connected" : "Connecting..."}</span>
            <span className="text-muted-foreground/50">·</span>
            <span className="font-medium">
              {time
                ? new Date(time).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
                : "--:--:--"}
            </span>
            <span className="text-muted-foreground/50">Server Time</span>
          </div>
        </div>
      </footer>
    </div >
  );
}

// Chat message components
function PendingToolLine({ toolName }: { toolName: string }) {
  const { loadingText } = getToolDisplayInfo(toolName);
  return (
    <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground self-start flex-shrink-0">
      <span className="text-[8px]">○</span>
      <span className="opacity-70">{loadingText}...</span>
      <Loader2 className="w-3 h-3 animate-spin" />
    </div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return "just now";
  if (diffSec < 60) return "a few seconds ago";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} mins ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return "yesterday";
  return `${diffDay} days ago`;
}

function MessageBubble({ message, userImageUrl }: { message: ChatMessage; userImageUrl?: string }) {
  const isAssistant = message.role === "assistant";
  const isTool = message.role === "tool";
  const isUser = message.role === "user";
  const isStreaming =
    message.status === "streaming" || message.status === "typing";
  const isError = message.status === "error";

  if (isTool) {
    const text = formatToolResultMessage(message.toolName, message.content);
    return (
      <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground self-start flex-shrink-0">
        <span className="text-[8px]">●</span>
        <span>{text}</span>
      </div>
    );
  }

  const attachments = message.attachments || [];
  const imageAttachments = attachments.filter((a) =>
    a.mimeType.startsWith("image/"),
  );
  const otherAttachments = attachments.filter(
    (a) => !a.mimeType.startsWith("image/"),
  );

  const handleDownload = (attachment: ChatAttachment) => {
    const link = document.createElement("a");
    link.href = `data:${attachment.mimeType};base64,${attachment.data}`;
    link.download = attachment.filename;
    link.click();
  };

  const timestamp = message.createdAt ? formatRelativeTime(message.createdAt) : null;

  return (
    <div
      className={`flex gap-2.5 max-w-[85%] flex-shrink-0 min-w-0 ${isUser ? "self-end flex-row-reverse" : "self-start"}`}
    >
      {/* Avatar */}
      {isUser ? (
        userImageUrl ? (
          <img
            src={userImageUrl}
            alt="You"
            className="w-7 h-7 rounded-full flex-shrink-0 mt-1 object-cover"
          />
        ) : (
          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 bg-primary/20 text-primary dark:bg-primary/30">
            <UserIcon className="w-3.5 h-3.5" />
          </div>
        )
      ) : (
        <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-3 bg-gradient-to-br from-violet-500/20 to-blue-500/20 text-violet-600 dark:from-violet-400/20 dark:to-blue-400/20 dark:text-violet-300">
          <Sparkles className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Bubble + timestamp */}
      <div className={`flex flex-col min-w-0 ${isUser ? "items-end" : "items-start"}`}>
        <div
          className={`px-4 py-3 rounded-2xl relative backdrop-blur-md border min-w-0 ${isUser
            ? "bg-primary/85 text-primary-foreground border-primary/30 dark:bg-primary/75 dark:border-primary/40"
            : "bg-white/50 border-white/40 shadow-[inset_0_1px_1px_rgba(255,255,255,0.6),0_4px_20px_rgba(0,0,0,0.04)] dark:bg-white/[0.06] dark:border-white/[0.1] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05),0_4px_20px_rgba(0,0,0,0.2)]"
            }`}
          style={{ backdropFilter: "blur(16px) saturate(1.8)", WebkitBackdropFilter: "blur(16px) saturate(1.8)" }}
        >
          {message.status === "typing" ? (
            <span className="flex gap-1 py-1">
              <span
                className="w-2 h-2 bg-current rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-2 h-2 bg-current rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-2 h-2 bg-current rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </span>
          ) : (
            <>
              {/* Image attachments */}
              {imageAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {imageAttachments.map((img, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={`data:${img.mimeType};base64,${img.data}`}
                        alt={img.filename}
                        className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                      />
                      <button
                        onClick={() => handleDownload(img)}
                        className="absolute bottom-1 right-1 p-1 rounded bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Download"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Other file attachments */}
              {otherAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {otherAttachments.map((file, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleDownload(file)}
                      className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${isUser
                        ? "bg-white/20 hover:bg-white/30"
                        : "bg-background hover:bg-background/80"
                        } transition-colors`}
                    >
                      <FileIcon className="w-3 h-3" />
                      <span className="max-w-[100px] truncate">{file.filename}</span>
                      <Download className="w-3 h-3" />
                    </button>
                  ))}
                </div>
              )}

              <div className="text-sm leading-relaxed break-words overflow-hidden" style={{ overflowWrap: "anywhere" }}>
                {isAssistant ? (
                  <ReactMarkdown
                    rehypePlugins={[rehypeRaw]}
                    urlTransform={(url) => {
                      if (url.startsWith("data:")) return url;
                      if (url.startsWith("http://") || url.startsWith("https://"))
                        return url;
                      return "";
                    }}
                    components={{
                      img: ({ src, alt }) => (
                        <img
                          src={src}
                          alt={alt || "Generated image"}
                          className="max-w-full rounded-lg mt-2"
                        />
                      ),
                      pre: ({ children }) => (
                        <pre className="bg-slate-900/80 text-slate-200 p-4 rounded-lg overflow-x-auto text-xs my-2 max-w-full">
                          {children}
                        </pre>
                      ),
                      code: ({ children, className }) => {
                        const isBlock = className?.includes("language-");
                        if (isBlock)
                          return <code className="font-mono">{children}</code>;
                        return (
                          <code className="bg-black/10 dark:bg-white/10 px-1.5 py-0.5 rounded text-[0.9em] font-mono break-all">
                            {children}
                          </code>
                        );
                      },
                      a: ({ href, children }) => (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-secondary underline hover:no-underline break-all"
                        >
                          {children}
                        </a>
                      ),
                      p: ({ children }) => (
                        <p className="my-2 first:mt-0 last:mb-0">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="my-2 pl-6 list-disc">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="my-2 pl-6 list-decimal">{children}</ol>
                      ),
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
        {/* Timestamp */}
        {timestamp && (
          <span className="text-[10px] text-muted-foreground/70 mt-1 px-1 ml-3">
            {timestamp}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusIndicator({
  status,
  isAssistant,
}: {
  status: ChatMessageStatus;
  isAssistant: boolean;
}) {
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
      className={`block mt-1 text-[10px] ${status === "error" ? "text-destructive" : "text-muted-foreground"}`}
    >
      {statusText}
    </span>
  );
}

function FocusCard({ focus }: { focus: Focus }) {
  const startedAt = new Date(focus.startedAt);
  const endedAt = focus.endedAt ? new Date(focus.endedAt) : null;
  const lastActivity = new Date(focus.lastActivityAt);

  const duration = endedAt
    ? endedAt.getTime() - startedAt.getTime()
    : Date.now() - startedAt.getTime();

  const formatFocusDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    if (minutes > 0) {
      return `${minutes}m`;
    }
    return `${seconds}s`;
  };

  const formatTimeAgo = (date: Date): string => {
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return "just now";
  };

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${focus.isActive
        ? "bg-focus/5 border-focus/30"
        : "bg-card border-border hover:border-border/80"
        }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {focus.isActive ? (
            <div className="w-8 h-8 rounded-lg bg-focus/20 flex items-center justify-center">
              <Target className="w-4 h-4 text-focus" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <Target className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div>
            {focus.isActive && (
              <span className="text-[10px] font-medium uppercase tracking-wider text-focus">
                Active
              </span>
            )}
            <p className="font-semibold text-sm leading-tight">{focus.item}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">
          {formatFocusDuration(duration)}
        </span>
      </div>

      {/* Keywords */}
      {focus.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {focus.keywords.slice(0, 5).map((keyword) => (
            <span
              key={keyword}
              className={`px-2 py-0.5 text-xs rounded-full ${focus.isActive
                ? "bg-focus/20 text-focus"
                : "bg-muted text-muted-foreground"
                }`}
            >
              {keyword}
            </span>
          ))}
          {focus.keywords.length > 5 && (
            <span className="px-2 py-0.5 text-xs rounded-full bg-muted text-muted-foreground">
              +{focus.keywords.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Timeline */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>
            Started{" "}
            {startedAt.toLocaleDateString([], {
              month: "short",
              day: "numeric",
            })}{" "}
            at{" "}
            {startedAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        {focus.isActive ? (
          <span className="flex items-center gap-1">
            <Zap className="w-3 h-3 text-focus" />
            Last active {formatTimeAgo(lastActivity)}
          </span>
        ) : (
          <span>
            Ended{" "}
            {endedAt?.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </div>
    </div>
  );
}
