"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type UserSettings, type LLMModels, type LLMProviderType, type ModelInfo } from "@kaizen/api-client";
import Link from "next/link";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};


export default function Settings() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const eventSourceRef = useRef<EventSource | null>(null);

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
    } catch (err) {
      console.error("Fetch settings error:", err);
      setError("Failed to fetch settings");
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, clerkUser, getTokenFn]);


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
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ margin: 0, fontWeight: "bold" }}>Auto-Summarization</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Automatically generate summaries of web pages based on the text you read.
                  Summaries are generated using your configured AI provider.
                </p>
              </div>

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
            </div>

            {/* Focus Calculation Settings */}
            <div
              style={{
                padding: "1rem",
                border: "1px solid #ddd",
                borderRadius: "8px",
              }}
            >
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ margin: 0, fontWeight: "bold" }}>Focus Detection</p>
                <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#666" }}>
                  Automatically detect what you&apos;re focused on based on your browsing activity.
                  Uses AI to analyze patterns and identify your current area of focus.
                </p>
              </div>

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

    </main>
  );
}
