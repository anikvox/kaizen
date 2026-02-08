"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type UserSettings, type LLMModels, type LLMProviderType, type ModelInfo, type UserTaskQueueStatus, type TaskQueueItem, type TaskHistoryItem, type SSETaskQueueChangedData } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

const TASK_TYPE_LABELS: Record<string, string> = {
  focus_calculation: "Focus Calculation",
  quiz_generation: "Quiz Generation",
  summarization: "Summarization",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  pending: "#ffc107",
  processing: "#17a2b8",
  completed: "#28a745",
  failed: "#dc3545",
  cancelled: "#6c757d",
};

function formatTaskDuration(ms: number | undefined): string {
  if (!ms) return "-";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimeAgo(dateStr: string | undefined): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function Settings() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const taskEventSourceRef = useRef<EventSource | null>(null);

  // Ignore list state
  const [ignoreListValue, setIgnoreListValue] = useState("");
  const [ignoreListDirty, setIgnoreListDirty] = useState(false);

  // LLM settings state - models are fetched dynamically per provider
  const [providerModels, setProviderModels] = useState<Partial<Record<LLMProviderType, ModelInfo[]>>>({});
  const [loadingModels, setLoadingModels] = useState<Partial<Record<LLMProviderType, boolean>>>({});
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<LLMProviderType, string>>({
    gemini: "",
    anthropic: "",
    openai: "",
  });

  // Keep llmModels for backward compatibility (static fallback)
  const [llmModels, setLlmModels] = useState<LLMModels | null>(null);

  // Task queue state
  const [taskQueueStatus, setTaskQueueStatus] = useState<UserTaskQueueStatus | null>(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskSSEConnected, setTaskSSEConnected] = useState(false);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Fetch models for a specific provider dynamically
  const fetchModelsForProvider = useCallback(async (provider: LLMProviderType) => {
    const api = createApiClient(apiUrl, getTokenFn);

    setLoadingModels((prev) => ({ ...prev, [provider]: true }));

    try {
      const models = await api.settings.getModelsForProvider(provider);
      setProviderModels((prev) => ({ ...prev, [provider]: models }));
    } catch (err) {
      console.error(`Failed to fetch models for ${provider}:`, err);
      // Fall back to static models if available
      if (llmModels?.[provider]) {
        setProviderModels((prev) => ({ ...prev, [provider]: llmModels[provider] }));
      }
    } finally {
      setLoadingModels((prev) => ({ ...prev, [provider]: false }));
    }
  }, [getTokenFn, llmModels]);

  const fetchSettings = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;

    const api = createApiClient(apiUrl, getTokenFn);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return;

    try {
      // Sync user first
      await api.users.sync({
        email,
        name: clerkUser.fullName || undefined,
      });

      // Fetch settings and static models (fallback)
      const [settingsResult, modelsResult] = await Promise.all([
        api.settings.get(),
        api.settings.getLLMModels(),
      ]);
      setSettings(settingsResult);
      setIgnoreListValue(settingsResult.attentionTrackingIgnoreList || "");
      setIgnoreListDirty(false);
      setLlmModels(modelsResult);
      setError("");

      // Fetch dynamic models for providers with API keys
      const providers: LLMProviderType[] = ["gemini", "anthropic", "openai"];
      for (const provider of providers) {
        const hasKey =
          (provider === "gemini" && settingsResult.hasGeminiApiKey) ||
          (provider === "anthropic" && settingsResult.hasAnthropicApiKey) ||
          (provider === "openai" && settingsResult.hasOpenaiApiKey);

        if (hasKey) {
          // Fetch in background, don't block
          api.settings.getModelsForProvider(provider)
            .then((models) => setProviderModels((prev) => ({ ...prev, [provider]: models })))
            .catch(() => {
              // Use static fallback
              setProviderModels((prev) => ({ ...prev, [provider]: modelsResult[provider] }));
            });
        }
      }

      // Fetch task queue status
      fetchTaskQueue();
    } catch (err) {
      console.error("Fetch settings error:", err);
      setError("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getTokenFn]);

  const fetchTaskQueue = useCallback(async () => {
    if (!isSignedIn) return;

    const api = createApiClient(apiUrl, getTokenFn);
    setLoadingTasks(true);

    try {
      const status = await api.tasks.getStatus();
      setTaskQueueStatus(status);
    } catch (err) {
      console.error("Fetch task queue error:", err);
    } finally {
      setLoadingTasks(false);
    }
  }, [isSignedIn, getTokenFn]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetchSettings();
  }, [isLoaded, isSignedIn, fetchSettings]);

  // Subscribe to settings changes via SSE (for real-time sync from extensions)
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) return;

      const api = createApiClient(apiUrl, getTokenFn);
      eventSourceRef.current = api.settings.subscribeSettings(
        (data) => {
          // Initial connection with settings
          if (data.settings) {
            setSettings(data.settings);
            setIgnoreListValue(data.settings.attentionTrackingIgnoreList || "");
            setIgnoreListDirty(false);
          }
        },
        (newSettings) => {
          // Settings changed from another source (e.g., extension)
          setSettings(newSettings);
          if (!ignoreListDirty) {
            setIgnoreListValue(newSettings.attentionTrackingIgnoreList || "");
          }
        },
        (error) => {
          console.error("Settings SSE error:", error);
        },
        token
      );
    };

    setupSSE();

    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, clerkUser, getToken, getTokenFn]);

  // Subscribe to task queue changes via SSE
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const setupTaskSSE = async () => {
      const token = await getToken();
      if (!token) return;

      const api = createApiClient(apiUrl, getTokenFn);
      taskEventSourceRef.current = api.tasks.subscribeTasks(
        (data) => {
          // Initial connection with task status
          setTaskQueueStatus((prev) => ({
            pending: data.pending,
            processing: data.processing,
            history: prev?.history || [],
            stats: data.stats,
          }));
          setLoadingTasks(false);
          setTaskSSEConnected(true);
        },
        (event) => {
          // Task changed - update state based on change type
          setTaskQueueStatus((prev) => {
            if (!prev) return prev;

            const { taskId, type, status, changeType } = event;

            // Create a new task item for adding to lists
            const newTask: TaskQueueItem = {
              id: taskId,
              type: type as any,
              status: status as any,
              priority: 0,
              payload: {},
              attempts: 0,
              maxAttempts: 3,
              createdAt: new Date().toISOString(),
            };

            let pending = [...prev.pending];
            let processing = [...prev.processing];
            let stats = { ...prev.stats };

            switch (changeType) {
              case "created":
                // Add to pending
                pending = [newTask, ...pending];
                stats.pendingCount++;
                break;

              case "started":
                // Move from pending to processing
                pending = pending.filter((t) => t.id !== taskId);
                processing = [{ ...newTask, startedAt: new Date().toISOString() }, ...processing];
                stats.pendingCount = Math.max(0, stats.pendingCount - 1);
                stats.processingCount++;
                break;

              case "completed":
                // Remove from processing, increment completed
                processing = processing.filter((t) => t.id !== taskId);
                stats.processingCount = Math.max(0, stats.processingCount - 1);
                stats.completedToday++;
                // Refetch to get updated history
                fetchTaskQueue();
                break;

              case "failed":
                // Remove from processing, increment failed
                processing = processing.filter((t) => t.id !== taskId);
                stats.processingCount = Math.max(0, stats.processingCount - 1);
                stats.failedToday++;
                // Refetch to get updated history
                fetchTaskQueue();
                break;

              case "cancelled":
                // Remove from pending
                pending = pending.filter((t) => t.id !== taskId);
                stats.pendingCount = Math.max(0, stats.pendingCount - 1);
                break;
            }

            return { ...prev, pending, processing, stats };
          });
        },
        (error) => {
          console.error("Tasks SSE error:", error);
        },
        token
      );
    };

    setupTaskSSE();

    return () => {
      taskEventSourceRef.current?.close();
      taskEventSourceRef.current = null;
      setTaskSSEConnected(false);
    };
  }, [isSignedIn, clerkUser, getToken, getTokenFn, fetchTaskQueue]);

  const handleToggle = async (key: keyof UserSettings) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    const newValue = !settings[key];
    const update = { [key]: newValue };

    try {
      const result = await api.settings.update(update);
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update settings error:", err);
      setError("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveIgnoreList = async () => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        attentionTrackingIgnoreList: ignoreListValue.trim() || null,
      });
      setSettings(result);
      setIgnoreListDirty(false);
      setError("");
    } catch (err) {
      console.error("Update ignore list error:", err);
      setError("Failed to update ignore list");
    } finally {
      setSaving(false);
    }
  };

  const handleSummarizationToggle = async () => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const currentValue = settings.attentionSummarizationEnabled ?? true;
      const result = await api.settings.update({
        attentionSummarizationEnabled: !currentValue,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update summarization setting error:", err);
      setError("Failed to update summarization setting");
    } finally {
      setSaving(false);
    }
  };

  const handleSummarizationIntervalChange = async (intervalMs: number) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        attentionSummarizationIntervalMs: intervalMs,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update summarization interval error:", err);
      setError("Failed to update summarization interval");
    } finally {
      setSaving(false);
    }
  };

  // Focus calculation handlers
  const handleFocusToggle = async () => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const currentValue = settings.focusCalculationEnabled ?? true;
      const result = await api.settings.update({
        focusCalculationEnabled: !currentValue,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update focus setting error:", err);
      setError("Failed to update focus setting");
    } finally {
      setSaving(false);
    }
  };

  const handleFocusIntervalChange = async (intervalMs: number) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        focusCalculationIntervalMs: intervalMs,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update focus interval error:", err);
      setError("Failed to update focus interval");
    } finally {
      setSaving(false);
    }
  };

  const handleFocusInactivityChange = async (thresholdMs: number) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        focusInactivityThresholdMs: thresholdMs,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update focus inactivity error:", err);
      setError("Failed to update focus inactivity threshold");
    } finally {
      setSaving(false);
    }
  };

  const handleFocusMinDurationChange = async (durationMs: number) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        focusMinDurationMs: durationMs,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update focus min duration error:", err);
      setError("Failed to update focus minimum duration");
    } finally {
      setSaving(false);
    }
  };

  const handleProviderChange = async (provider: LLMProviderType | "") => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      // When changing provider, also reset model to the first available for that provider
      const newProvider = provider || null;
      const models = newProvider ? (providerModels[newProvider] || llmModels?.[newProvider]) : null;
      const newModel = models?.[0]?.id || null;

      const result = await api.settings.update({
        llmProvider: newProvider,
        llmModel: newModel,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update provider error:", err);
      setError("Failed to update provider");
    } finally {
      setSaving(false);
    }
  };

  const handleModelChange = async (model: string) => {
    if (!settings) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({
        llmModel: model || null,
      });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update model error:", err);
      setError("Failed to update model");
    } finally {
      setSaving(false);
    }
  };

  const handleApiKeySave = async (provider: LLMProviderType) => {
    const key = apiKeyInputs[provider];
    if (!key.trim()) return;

    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const keyField = `${provider}ApiKey` as const;
      const result = await api.settings.update({
        [keyField]: key,
      });
      setSettings(result);
      setApiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      setError("");

      // Fetch models for this provider now that we have an API key
      fetchModelsForProvider(provider);
    } catch (err) {
      console.error("Save API key error:", err);
      setError("Failed to save API key");
    } finally {
      setSaving(false);
    }
  };

  const handleApiKeyClear = async (provider: LLMProviderType) => {
    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const keyField = `${provider}ApiKey` as const;
      // If clearing the key for the currently selected provider, reset to system default
      const updates: Record<string, unknown> = { [keyField]: null };
      if (settings?.llmProvider === provider) {
        updates.llmProvider = null;
        updates.llmModel = null;
      }
      const result = await api.settings.update(updates);
      setSettings(result);
      // Clear the cached models for this provider
      setProviderModels((prev) => {
        const next = { ...prev };
        delete next[provider];
        return next;
      });
      setError("");
    } catch (err) {
      console.error("Clear API key error:", err);
      setError("Failed to clear API key");
    } finally {
      setSaving(false);
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

  if (!isLoaded || loading) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Settings</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main style={{ padding: "2rem" }}>
        <h1>Settings</h1>
        <p>Sign in to manage your settings.</p>
        <div style={{ marginTop: "1rem" }}>
          <SignInButton mode="modal" />
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: "2rem", maxWidth: "600px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0 }}>Settings</h1>
        <Link href="/" style={{ color: "#666" }}>Back to Home</Link>
      </div>

      {error && <p style={{ color: "red", marginBottom: "1rem" }}>{error}</p>}

      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Cognitive Attention Tracking</h2>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
          These settings control the attention tracking behavior in the browser extension.
          Changes will sync to all linked extensions in real-time.
        </p>

        {settings && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: "bold" }}>Debug Mode</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Shows a debug overlay with real-time attention tracking data including
                  reading progress, top candidates, and scroll velocity.
                </p>
              </div>
              <button
                onClick={() => handleToggle("cognitiveAttentionDebugMode")}
                disabled={saving}
                style={{
                  background: settings.cognitiveAttentionDebugMode ? "#28a745" : "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  minWidth: "60px",
                }}
              >
                {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
              </button>
            </div>

            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: "bold" }}>Show Overlay</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Displays visual overlays around text, images, and audio elements
                  being tracked to show reading progress and attention focus.
                </p>
              </div>
              <button
                onClick={() => handleToggle("cognitiveAttentionShowOverlay")}
                disabled={saving}
                style={{
                  background: settings.cognitiveAttentionShowOverlay ? "#28a745" : "#6c757d",
                  color: "white",
                  border: "none",
                  padding: "0.5rem 1rem",
                  borderRadius: "4px",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                  minWidth: "60px",
                }}
              >
                {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
              </button>
            </div>

            {/* Ignore List */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: 0, fontWeight: "bold" }}>Ignore List</p>
              <p style={{ margin: "0.25rem 0 0.75rem", fontSize: "0.85rem", color: "#666" }}>
                URLs to skip from attention tracking. Enter one pattern per line.
                Supports plain text (substring match), glob patterns (*.example.com),
                and regex (/pattern/).
              </p>
              <textarea
                value={ignoreListValue}
                onChange={(e) => {
                  setIgnoreListValue(e.target.value);
                  setIgnoreListDirty(true);
                }}
                placeholder={"Example patterns:\nexample.com\n*.internal.company.com\n/^https:\\/\\/mail\\.google\\.com/"}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "0.9rem",
                  fontFamily: "monospace",
                  resize: "vertical",
                  minHeight: "100px",
                  boxSizing: "border-box",
                }}
                rows={5}
              />
              {ignoreListDirty && (
                <button
                  onClick={handleSaveIgnoreList}
                  disabled={saving}
                  style={{
                    marginTop: "0.5rem",
                    background: "#007bff",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving..." : "Save Ignore List"}
                </button>
              )}
            </div>

            {/* Summarization Settings */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Auto-Summarization</p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                    Automatically generate summaries of web pages based on the text you read.
                    Summaries are generated using your configured AI provider.
                  </p>
                </div>
                <button
                  onClick={handleSummarizationToggle}
                  disabled={saving}
                  style={{
                    background: (settings.attentionSummarizationEnabled ?? true) ? "#28a745" : "#6c757d",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                    minWidth: "60px",
                  }}
                >
                  {(settings.attentionSummarizationEnabled ?? true) ? "ON" : "OFF"}
                </button>
              </div>

              {(settings.attentionSummarizationEnabled ?? true) && (
                <div>
                  <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                    Summarization Interval
                  </label>
                  <select
                    value={settings.attentionSummarizationIntervalMs ?? 60000}
                    onChange={(e) => handleSummarizationIntervalChange(Number(e.target.value))}
                    disabled={saving}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      fontSize: "0.9rem",
                      cursor: saving ? "not-allowed" : "pointer",
                    }}
                  >
                    <option value={30000}>30 seconds</option>
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                    <option value={600000}>10 minutes</option>
                  </select>
                  <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                    How often to check for new content to summarize.
                  </p>
                </div>
              )}
            </div>

            {/* Focus Calculation Settings */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <p style={{ margin: 0, fontWeight: "bold" }}>Focus Detection</p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                    Automatically detect what you&apos;re focused on based on your browsing activity.
                    Uses AI to analyze patterns and identify your current area of focus.
                  </p>
                </div>
                <button
                  onClick={handleFocusToggle}
                  disabled={saving}
                  style={{
                    background: (settings.focusCalculationEnabled ?? true) ? "#28a745" : "#6c757d",
                    color: "white",
                    border: "none",
                    padding: "0.5rem 1rem",
                    borderRadius: "4px",
                    cursor: saving ? "not-allowed" : "pointer",
                    opacity: saving ? 0.6 : 1,
                    minWidth: "60px",
                  }}
                >
                  {(settings.focusCalculationEnabled ?? true) ? "ON" : "OFF"}
                </button>
              </div>

              {(settings.focusCalculationEnabled ?? true) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                      Calculation Interval
                    </label>
                    <select
                      value={settings.focusCalculationIntervalMs ?? 30000}
                      onChange={(e) => handleFocusIntervalChange(Number(e.target.value))}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "0.9rem",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value={30000}>30 seconds</option>
                      <option value={60000}>1 minute</option>
                      <option value={120000}>2 minutes</option>
                      <option value={300000}>5 minutes</option>
                    </select>
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                      How often to analyze your activity and update focus.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                      Inactivity Threshold
                    </label>
                    <select
                      value={settings.focusInactivityThresholdMs ?? 60000}
                      onChange={(e) => handleFocusInactivityChange(Number(e.target.value))}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "0.9rem",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value={60000}>1 minute</option>
                      <option value={120000}>2 minutes</option>
                      <option value={300000}>5 minutes</option>
                      <option value={600000}>10 minutes</option>
                      <option value={900000}>15 minutes</option>
                    </select>
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                      End focus after this period of inactivity.
                    </p>
                  </div>

                  <div>
                    <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                      Minimum Focus Duration
                    </label>
                    <select
                      value={settings.focusMinDurationMs ?? 30000}
                      onChange={(e) => handleFocusMinDurationChange(Number(e.target.value))}
                      disabled={saving}
                      style={{
                        width: "100%",
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "0.9rem",
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      <option value={30000}>30 seconds</option>
                      <option value={60000}>1 minute</option>
                      <option value={120000}>2 minutes</option>
                      <option value={300000}>5 minutes</option>
                    </select>
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                      Minimum time before detecting a new focus area.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* LLM Settings Section */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>AI Chat Settings</h2>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Configure which AI provider and model to use for chat. Add your API keys first,
          then select a provider and model.
        </p>

        {settings && llmModels && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* API Keys Section - First */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>API Keys</p>
              <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#666" }}>
                Add your API keys to enable different providers. Keys are encrypted and stored securely.
              </p>

              {(Object.keys(PROVIDER_LABELS) as LLMProviderType[]).map((provider) => (
                <div key={provider} style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", marginBottom: "0.25rem", fontWeight: "500", fontSize: "0.9rem" }}>
                    {PROVIDER_LABELS[provider]}
                    {hasApiKey(provider) && (
                      <span style={{ color: "#28a745", marginLeft: "0.5rem", fontWeight: "normal" }}>
                        (configured)
                      </span>
                    )}
                  </label>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <input
                      type="password"
                      placeholder={hasApiKey(provider) ? "••••••••••••••••" : `Enter ${PROVIDER_LABELS[provider]} API key`}
                      value={apiKeyInputs[provider]}
                      onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                      disabled={saving}
                      style={{
                        flex: 1,
                        padding: "0.5rem",
                        borderRadius: "4px",
                        border: "1px solid #ccc",
                        fontSize: "0.9rem",
                      }}
                    />
                    <button
                      onClick={() => handleApiKeySave(provider)}
                      disabled={saving || !apiKeyInputs[provider].trim()}
                      style={{
                        background: "#007bff",
                        color: "white",
                        border: "none",
                        padding: "0.5rem 1rem",
                        borderRadius: "4px",
                        cursor: saving || !apiKeyInputs[provider].trim() ? "not-allowed" : "pointer",
                        opacity: saving || !apiKeyInputs[provider].trim() ? 0.6 : 1,
                      }}
                    >
                      Save
                    </button>
                    {hasApiKey(provider) && (
                      <button
                        onClick={() => handleApiKeyClear(provider)}
                        disabled={saving}
                        style={{
                          background: "#dc3545",
                          color: "white",
                          border: "none",
                          padding: "0.5rem 1rem",
                          borderRadius: "4px",
                          cursor: saving ? "not-allowed" : "pointer",
                          opacity: saving ? 0.6 : 1,
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Provider Selection - Only show providers with API keys */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>Active Provider</p>
              <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#666" }}>
                Select which provider to use for chat. Only providers with configured API keys are available.
              </p>
              <select
                value={settings.llmProvider || ""}
                onChange={(e) => handleProviderChange(e.target.value as LLMProviderType | "")}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "1rem",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <option value="">System Default (Gemini)</option>
                {(Object.keys(PROVIDER_LABELS) as LLMProviderType[])
                  .filter((provider) => hasApiKey(provider))
                  .map((provider) => (
                    <option key={provider} value={provider}>
                      {PROVIDER_LABELS[provider]}
                    </option>
                  ))}
              </select>
              {!settings.llmProvider && (
                <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                  Using system Gemini API. Add your own API key above to use a different provider.
                </p>
              )}
            </div>

            {/* Model Selection - Only show when a provider with API key is selected */}
            {settings.llmProvider && hasApiKey(settings.llmProvider) && (() => {
              const models = providerModels[settings.llmProvider] || llmModels?.[settings.llmProvider] || [];
              const isLoadingProviderModels = loadingModels[settings.llmProvider];

              return (
                <div
                  style={{
                    padding: "1rem",
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                  }}
                >
                  <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>
                    Model
                    {isLoadingProviderModels && (
                      <span style={{ fontWeight: "normal", color: "#888", marginLeft: "0.5rem" }}>
                        (loading models...)
                      </span>
                    )}
                  </p>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#666" }}>
                    Select the model to use for {PROVIDER_LABELS[settings.llmProvider]}.
                    {models.length > 0 && ` ${models.length} models available.`}
                  </p>
                  <select
                    value={settings.llmModel || ""}
                    onChange={(e) => handleModelChange(e.target.value)}
                    disabled={saving || isLoadingProviderModels}
                    style={{
                      width: "100%",
                      padding: "0.5rem",
                      borderRadius: "4px",
                      border: "1px solid #ccc",
                      fontSize: "1rem",
                      cursor: saving || isLoadingProviderModels ? "not-allowed" : "pointer",
                    }}
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                  {settings.llmModel && models.length > 0 && (
                    <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                      {models.find((m) => m.id === settings.llmModel)?.description}
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Quiz Settings Section */}
      <section style={{ marginBottom: "2rem" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "1rem" }}>Quiz Settings</h2>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
          Configure how the daily learning quiz is generated based on your browsing activity.
        </p>

        {settings && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                Answer Options per Question
              </label>
              <select
                value={settings.quizAnswerOptionsCount ?? 2}
                onChange={async (e) => {
                  setSaving(true);
                  const api = createApiClient(apiUrl, getTokenFn);
                  try {
                    const result = await api.settings.update({
                      quizAnswerOptionsCount: Number(e.target.value),
                    });
                    setSettings(result);
                    setError("");
                  } catch (err) {
                    console.error("Update quiz options error:", err);
                    setError("Failed to update quiz settings");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "0.9rem",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <option value={2}>2 options</option>
                <option value={3}>3 options</option>
                <option value={4}>4 options</option>
              </select>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                More options make the quiz harder.
              </p>
            </div>

            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <label style={{ display: "block", marginBottom: "0.5rem", fontSize: "0.9rem", fontWeight: "500" }}>
                Activity Lookback Period
              </label>
              <select
                value={settings.quizActivityDays ?? 3}
                onChange={async (e) => {
                  setSaving(true);
                  const api = createApiClient(apiUrl, getTokenFn);
                  try {
                    const result = await api.settings.update({
                      quizActivityDays: Number(e.target.value),
                    });
                    setSettings(result);
                    setError("");
                  } catch (err) {
                    console.error("Update quiz days error:", err);
                    setError("Failed to update quiz settings");
                  } finally {
                    setSaving(false);
                  }
                }}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  borderRadius: "4px",
                  border: "1px solid #ccc",
                  fontSize: "0.9rem",
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={4}>4 days</option>
                <option value={5}>5 days</option>
                <option value={6}>6 days</option>
                <option value={7}>7 days</option>
              </select>
              <p style={{ margin: "0.5rem 0 0", fontSize: "0.8rem", color: "#888" }}>
                How many days of browsing activity to use for generating quiz questions.
              </p>
            </div>

            {/* Generate Quiz Button */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                textAlign: "center",
              }}
            >
              <p style={{ margin: "0 0 1rem", fontSize: "0.9rem", color: "#666" }}>
                Ready to test your knowledge? Generate a quiz based on your recent browsing activity.
              </p>
              <Link
                href="/quiz"
                style={{
                  display: "inline-block",
                  padding: "0.75rem 1.5rem",
                  background: "#007bff",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "4px",
                  fontSize: "1rem",
                  fontWeight: "500",
                }}
              >
                Take Quiz
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Task Queue Section */}
      <section style={{ marginBottom: "2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Background Tasks</h2>
          {taskSSEConnected && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                padding: "0.125rem 0.5rem",
                background: "#d4edda",
                color: "#155724",
                borderRadius: "12px",
                fontSize: "0.7rem",
                fontWeight: "500",
              }}
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#28a745",
                  animation: "pulse 2s infinite",
                }}
              />
              Live
            </span>
          )}
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
          @keyframes processingPulse {
            0%, 100% { background-color: #e3f2fd; }
            50% { background-color: #bbdefb; }
          }
        `}</style>
        <p style={{ color: "#666", fontSize: "0.9rem", marginBottom: "1rem" }}>
          View the status of background tasks like focus calculations, summarizations, and quiz generation.
        </p>

        {loadingTasks ? (
          <p style={{ color: "#888" }}>Loading tasks...</p>
        ) : taskQueueStatus ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {/* Stats */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
                display: "flex",
                justifyContent: "space-around",
                textAlign: "center",
              }}
            >
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#ffc107" }}>
                  {taskQueueStatus.stats.pendingCount}
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#666" }}>Pending</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#17a2b8" }}>
                  {taskQueueStatus.stats.processingCount}
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#666" }}>Processing</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#28a745" }}>
                  {taskQueueStatus.stats.completedToday}
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#666" }}>Completed Today</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: "1.5rem", fontWeight: "bold", color: "#dc3545" }}>
                  {taskQueueStatus.stats.failedToday}
                </p>
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#666" }}>Failed Today</p>
              </div>
            </div>

            {/* Active Tasks */}
            {(taskQueueStatus.pending.length > 0 || taskQueueStatus.processing.length > 0) && (
              <div
                style={{
                  padding: "1rem",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>Active Tasks</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {[...taskQueueStatus.processing, ...taskQueueStatus.pending].map((task) => (
                    <div
                      key={task.id}
                      style={{
                        padding: "0.5rem",
                        background: task.status === "processing" ? "#e3f2fd" : "#f8f9fa",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        animation: task.status === "processing" ? "processingPulse 2s ease-in-out infinite" : "none",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: "500" }}>
                          {TASK_TYPE_LABELS[task.type] || task.type}
                        </span>
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            background: TASK_STATUS_COLORS[task.status],
                            color: "white",
                          }}
                        >
                          {task.status}
                        </span>
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "#888" }}>
                        {formatTimeAgo(task.createdAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent History */}
            {taskQueueStatus.history.length > 0 && (
              <div
                style={{
                  padding: "1rem",
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                }}
              >
                <p style={{ margin: "0 0 0.5rem", fontWeight: "bold" }}>Recent History</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {taskQueueStatus.history.slice(0, 10).map((task) => (
                    <div
                      key={task.id}
                      style={{
                        padding: "0.5rem",
                        background: "#f8f9fa",
                        borderRadius: "4px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: "500" }}>
                          {TASK_TYPE_LABELS[task.type] || task.type}
                        </span>
                        <span
                          style={{
                            marginLeft: "0.5rem",
                            padding: "0.125rem 0.375rem",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            background: TASK_STATUS_COLORS[task.status],
                            color: "white",
                          }}
                        >
                          {task.status}
                        </span>
                        {task.durationMs && (
                          <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem", color: "#888" }}>
                            ({formatTaskDuration(task.durationMs)})
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: "0.8rem", color: "#888" }}>
                        {formatTimeAgo(task.completedAt)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => fetchTaskQueue()}
              disabled={loadingTasks}
              style={{
                padding: "0.5rem 1rem",
                background: "#6c757d",
                color: "white",
                border: "none",
                borderRadius: "4px",
                cursor: loadingTasks ? "not-allowed" : "pointer",
                opacity: loadingTasks ? 0.6 : 1,
                alignSelf: "flex-start",
              }}
            >
              {loadingTasks ? "Refreshing..." : "Refresh Tasks"}
            </button>
          </div>
        ) : (
          <p style={{ color: "#888" }}>No task data available</p>
        )}
      </section>
    </main>
  );
}
