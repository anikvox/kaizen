"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser, useClerk } from "@clerk/nextjs";
import {
  createApiClient,
  type UserSettings,
  type LLMModels,
  type LLMProviderType,
  type ModelInfo,
  type UnifiedSSEData,
} from "@kaizen/api-client";
import Link from "next/link";
import { Button, Input, Logo } from "@kaizen/ui";
import {
  ArrowLeft,
  Loader2,
  Check,
  X,
  Key,
  Brain,
  Timer,
  HelpCircle,
  Eye,
  EyeOff,
  Zap,
  Target,
  Clock,
  FileText,
  Sparkles,
  AlertTriangle,
  Trash2,
  User,
  Shield,
} from "lucide-react";

const apiUrl =
  process.env.NEXT_PUBLIC_KAIZEN_API_URL || "http://localhost:60092";

const PROVIDER_LABELS: Record<LLMProviderType, string> = {
  gemini: "Google Gemini",
  anthropic: "Anthropic Claude",
  openai: "OpenAI",
};

type SettingsTab = "tracking" | "ai" | "focus" | "quiz" | "account";

export default function Settings() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerk();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<SettingsTab>("tracking");
  const eventSourceRef = useRef<EventSource | null>(null);

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Ignore list state
  const [ignoreListValue, setIgnoreListValue] = useState("");
  const [ignoreListDirty, setIgnoreListDirty] = useState(false);

  // LLM settings state
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
  const [showApiKey, setShowApiKey] = useState<
    Record<LLMProviderType, boolean>
  >({
    gemini: false,
    anthropic: false,
    openai: false,
  });
  const [llmModels, setLlmModels] = useState<LLMModels | null>(null);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

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

  const fetchSettings = useCallback(async () => {
    if (!isSignedIn || !clerkUser) return;

    const api = createApiClient(apiUrl, getTokenFn);
    const email = clerkUser.emailAddresses[0]?.emailAddress;
    if (!email) return;

    try {
      await api.users.sync({
        email,
        name: clerkUser.fullName || undefined,
      });

      const [settingsResult, modelsResult] = await Promise.all([
        api.settings.get(),
        api.settings.getLLMModels(),
      ]);
      setSettings(settingsResult);
      setIgnoreListValue(settingsResult.attentionTrackingIgnoreList || "");
      setIgnoreListDirty(false);
      setLlmModels(modelsResult);
      setError("");

      const providers: LLMProviderType[] = ["gemini", "anthropic", "openai"];
      for (const provider of providers) {
        const hasKey =
          (provider === "gemini" && settingsResult.hasGeminiApiKey) ||
          (provider === "anthropic" && settingsResult.hasAnthropicApiKey) ||
          (provider === "openai" && settingsResult.hasOpenaiApiKey);

        if (hasKey) {
          api.settings
            .getModelsForProvider(provider)
            .then((models) =>
              setProviderModels((prev) => ({ ...prev, [provider]: models })),
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

  // SSE for real-time sync
  useEffect(() => {
    if (!isSignedIn || !clerkUser) return;

    const setupSSE = async () => {
      const token = await getToken();
      if (!token) return;

      const api = createApiClient(apiUrl);
      eventSourceRef.current = api.sse.subscribeUnified(
        (data: UnifiedSSEData) => {
          switch (data.type) {
            case "connected":
              setSettings(data.settings);
              setIgnoreListValue(
                data.settings.attentionTrackingIgnoreList || "",
              );
              setIgnoreListDirty(false);
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
          }
        },
        (error) => console.error("Settings SSE error:", error),
        token,
      );
    };

    setupSSE();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [isSignedIn, clerkUser, getToken, ignoreListDirty]);

  const handleToggle = async (key: keyof UserSettings) => {
    if (!settings) return;
    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update({ [key]: !settings[key] });
      setSettings(result);
      setError("");
    } catch (err) {
      console.error("Update settings error:", err);
      setError("Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (updates: Partial<UserSettings>) => {
    if (!settings) return;
    setSaving(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      const result = await api.settings.update(updates);
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

  const handleProviderChange = async (provider: LLMProviderType | "") => {
    if (!settings) return;
    setSaving(true);
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
      const result = await api.settings.update({ llmModel: model || null });
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
      const result = await api.settings.update({ [keyField]: key });
      setSettings(result);
      setApiKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      setError("");
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

  const tabs = [
    { id: "tracking" as SettingsTab, label: "Tracking", icon: Eye },
    { id: "ai" as SettingsTab, label: "AI", icon: Sparkles },
    { id: "focus" as SettingsTab, label: "Focus", icon: Target },
    { id: "quiz" as SettingsTab, label: "Quiz", icon: HelpCircle },
    { id: "account" as SettingsTab, label: "Account", icon: User },
  ];

  const handleDeleteAllData = async () => {
    setDeleting(true);
    const api = createApiClient(apiUrl, getTokenFn);

    try {
      await api.users.deleteAccount();
      // Sign out and redirect to home
      await signOut({ redirectUrl: "/" });
    } catch (err) {
      console.error("Delete account error:", err);
      setError("Failed to delete account. Please try again.");
      setDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isLoaded || loading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Logo size="md" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-background">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-8">
            <Logo size="md" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Key className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Sign in Required</h2>
            <p className="text-muted-foreground mb-6">
              Sign in to manage your settings
            </p>
            <SignInButton mode="modal">
              <Button>Sign In</Button>
            </SignInButton>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6">
          <div className="h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Logo size="md" />
              <h1 className="text-xl font-semibold">Settings</h1>
            </div>
            <Link
              href="/"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </div>

          {/* Tabs */}
          <nav className="flex gap-6 -mb-px">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-secondary text-secondary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-destructive/10 text-destructive flex items-center gap-2">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Tracking Tab */}
        {activeTab === "tracking" && settings && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Attention Tracking</h2>
              <p className="text-sm text-muted-foreground">
                Configure how the browser extension tracks your reading activity
              </p>
            </div>

            {/* Toggle Cards */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Eye className="w-4 h-4 text-secondary" />
                      <h3 className="font-medium">Debug Mode</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Show real-time tracking overlay with reading progress and
                      scroll velocity
                    </p>
                  </div>
                  <Button
                    onClick={() => handleToggle("cognitiveAttentionDebugMode")}
                    disabled={saving}
                    variant={
                      settings.cognitiveAttentionDebugMode
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="w-4 h-4 text-amber-500" />
                      <h3 className="font-medium">Visual Overlay</h3>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Display visual highlights around tracked text and media
                      elements
                    </p>
                  </div>
                  <Button
                    onClick={() =>
                      handleToggle("cognitiveAttentionShowOverlay")
                    }
                    disabled={saving}
                    variant={
                      settings.cognitiveAttentionShowOverlay
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Ignore List */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <EyeOff className="w-4 h-4 text-muted-foreground" />
                <h3 className="font-medium">Ignore List</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                URLs to exclude from tracking. One pattern per line. Supports
                plain text, glob patterns (*.example.com), and regex
                (/pattern/).
              </p>
              <textarea
                value={ignoreListValue}
                onChange={(e) => {
                  setIgnoreListValue(e.target.value);
                  setIgnoreListDirty(true);
                }}
                placeholder={
                  "Example:\nexample.com\n*.internal.company.com\n/^https:\\/\\/mail\\.google\\.com/"
                }
                disabled={saving}
                className="w-full p-4 rounded-xl border border-border bg-background text-sm font-mono resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-ring"
                rows={5}
              />
              {ignoreListDirty && (
                <Button
                  onClick={handleSaveIgnoreList}
                  disabled={saving}
                  className="mt-4"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>

            {/* Summarization */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-pulse" />
                <h3 className="font-medium">Auto-Summarization</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Automatically generate summaries of pages based on your reading
                activity
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Check Interval
                </label>
                <select
                  value={settings.attentionSummarizationIntervalMs ?? 60000}
                  onChange={(e) =>
                    handleUpdate({
                      attentionSummarizationIntervalMs: Number(e.target.value),
                    })
                  }
                  disabled={saving}
                  className="w-full md:w-64 p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={120000}>2 minutes</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === "ai" && settings && llmModels && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">AI Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Configure your AI provider and API keys for chat and analysis
                features
              </p>
            </div>

            {/* API Keys */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Key className="w-4 h-4 text-secondary" />
                <h3 className="font-medium">API Keys</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Add your API keys to use your own accounts. Keys are encrypted
                and stored securely.
              </p>

              <div className="space-y-5">
                {(Object.keys(PROVIDER_LABELS) as LLMProviderType[]).map(
                  (provider) => (
                    <div key={provider} className="p-4 rounded-xl bg-muted/30">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {PROVIDER_LABELS[provider]}
                          </span>
                          {hasApiKey(provider) && (
                            <span className="flex items-center gap-1 text-xs text-accent">
                              <Check className="w-3 h-3" />
                              configured
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 relative">
                          <Input
                            type={showApiKey[provider] ? "text" : "password"}
                            placeholder={
                              hasApiKey(provider)
                                ? "••••••••••••••••"
                                : `Enter API key`
                            }
                            value={apiKeyInputs[provider]}
                            onChange={(e) =>
                              setApiKeyInputs((prev) => ({
                                ...prev,
                                [provider]: e.target.value,
                              }))
                            }
                            disabled={saving}
                            className="pr-10"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowApiKey((prev) => ({
                                ...prev,
                                [provider]: !prev[provider],
                              }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showApiKey[provider] ? (
                              <EyeOff className="w-4 h-4" />
                            ) : (
                              <Eye className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                        <Button
                          onClick={() => handleApiKeySave(provider)}
                          disabled={saving || !apiKeyInputs[provider].trim()}
                          size="sm"
                        >
                          Save
                        </Button>
                        {hasApiKey(provider) && (
                          <Button
                            onClick={() => handleApiKeyClear(provider)}
                            disabled={saving}
                            variant="destructive"
                            size="sm"
                          >
                            Clear
                          </Button>
                        )}
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            {/* Provider & Model Selection */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-pulse" />
                  <h3 className="font-medium">Active Provider</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Select which AI provider to use
                </p>
                <select
                  value={settings.llmProvider || ""}
                  onChange={(e) =>
                    handleProviderChange(e.target.value as LLMProviderType | "")
                  }
                  disabled={saving}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                  <p className="text-xs text-muted-foreground mt-2">
                    Using system Gemini. Add your own API key for a different
                    provider.
                  </p>
                )}
              </div>

              {settings.llmProvider &&
                hasApiKey(settings.llmProvider) &&
                (() => {
                  const models =
                    providerModels[settings.llmProvider] ||
                    llmModels?.[settings.llmProvider] ||
                    [];
                  const isLoadingProviderModels =
                    loadingModels[settings.llmProvider];

                  return (
                    <div className="rounded-2xl border border-border bg-card p-6">
                      <div className="flex items-center gap-2 mb-1">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <h3 className="font-medium">
                          Model
                          {isLoadingProviderModels && (
                            <span className="font-normal text-muted-foreground ml-2 text-xs">
                              (loading...)
                            </span>
                          )}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground mb-4">
                        {models.length} models available
                      </p>
                      <select
                        value={settings.llmModel || ""}
                        onChange={(e) => handleModelChange(e.target.value)}
                        disabled={saving || isLoadingProviderModels}
                        className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      {settings.llmModel && models.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {
                            models.find((m) => m.id === settings.llmModel)
                              ?.description
                          }
                        </p>
                      )}
                    </div>
                  );
                })()}
            </div>
          </div>
        )}

        {/* Focus Tab */}
        {activeTab === "focus" && settings && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Focus & Timer</h2>
              <p className="text-sm text-muted-foreground">
                Configure focus detection and the Pomodoro timer
              </p>
            </div>

            {/* Focus Detection */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-focus" />
                <h3 className="font-medium">Focus Detection</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                AI-powered detection of what you&apos;re focused on based on
                browsing patterns
              </p>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Calculation Interval
                  </label>
                  <select
                    value={settings.focusCalculationIntervalMs ?? 30000}
                    onChange={(e) =>
                      handleUpdate({
                        focusCalculationIntervalMs: Number(e.target.value),
                      })
                    }
                    disabled={saving}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={15000}>15 seconds</option>
                    <option value={30000}>30 seconds</option>
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    How often to analyze activity
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Inactivity Threshold
                  </label>
                  <select
                    value={settings.focusInactivityThresholdMs ?? 60000}
                    onChange={(e) =>
                      handleUpdate({
                        focusInactivityThresholdMs: Number(e.target.value),
                      })
                    }
                    disabled={saving}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                    <option value={600000}>10 minutes</option>
                    <option value={900000}>15 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    End focus after inactivity
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Min Focus Duration
                  </label>
                  <select
                    value={settings.focusMinDurationMs ?? 30000}
                    onChange={(e) =>
                      handleUpdate({
                        focusMinDurationMs: Number(e.target.value),
                      })
                    }
                    disabled={saving}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={30000}>30 seconds</option>
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Minimum time for new focus
                  </p>
                </div>
              </div>
            </div>

            {/* Pomodoro Timer */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-4 h-4 text-pomodoro" />
                <h3 className="font-medium">Pomodoro Timer</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                Automatic timer that runs during focus sessions
              </p>

              <div className="max-w-xs">
                <label className="block text-sm font-medium mb-2">
                  Cooldown Period
                </label>
                <select
                  value={settings.pomodoroCooldownMs ?? 120000}
                  onChange={(e) =>
                    handleUpdate({ pomodoroCooldownMs: Number(e.target.value) })
                  }
                  disabled={saving}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={120000}>2 minutes</option>
                  <option value={180000}>3 minutes</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                </select>
                <p className="text-xs text-muted-foreground mt-2">
                  How long the timer continues after focus ends before resetting
                </p>
              </div>
            </div>

            {/* Focus Guardian */}
            <div className="rounded-2xl border border-border bg-card p-6">
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-4 h-4 text-green-600" />
                <h3 className="font-medium">Focus Guardian</h3>
              </div>
              <p className="text-sm text-muted-foreground mb-6">
                AI agent that monitors your browsing and nudges you when it detects
                unfocused patterns like doomscrolling
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="flex items-start justify-between gap-4 p-4 rounded-xl bg-muted/30">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium mb-1">Enable Guardian</h4>
                    <p className="text-xs text-muted-foreground">
                      Get helpful nudges when you&apos;re off track
                    </p>
                  </div>
                  <Button
                    onClick={() => handleToggle("focusAgentEnabled")}
                    disabled={saving}
                    variant={settings.focusAgentEnabled ? "default" : "outline"}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {settings.focusAgentEnabled ? "ON" : "OFF"}
                  </Button>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Check Interval
                  </label>
                  <select
                    value={settings.focusAgentIntervalMs ?? 60000}
                    onChange={(e) =>
                      handleUpdate({
                        focusAgentIntervalMs: Number(e.target.value),
                      })
                    }
                    disabled={saving}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={30000}>30 seconds</option>
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    How often the guardian checks your activity
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Nudge Cooldown
                  </label>
                  <select
                    value={settings.focusAgentCooldownMs ?? 300000}
                    onChange={(e) =>
                      handleUpdate({
                        focusAgentCooldownMs: Number(e.target.value),
                      })
                    }
                    disabled={saving}
                    className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={60000}>1 minute</option>
                    <option value={120000}>2 minutes</option>
                    <option value={300000}>5 minutes</option>
                    <option value={600000}>10 minutes</option>
                    <option value={900000}>15 minutes</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    Minimum time between nudges
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">
                    Sensitivity: {Math.round((settings.focusAgentSensitivity ?? 0.5) * 100)}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((settings.focusAgentSensitivity ?? 0.5) * 100)}
                    onChange={(e) =>
                      handleUpdate({
                        focusAgentSensitivity: Number(e.target.value) / 100,
                      })
                    }
                    disabled={saving}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground mt-2">
                    Higher = more nudges, Lower = fewer nudges
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quiz Tab */}
        {activeTab === "quiz" && settings && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Quiz Settings</h2>
              <p className="text-sm text-muted-foreground">
                Configure how quizzes are generated based on your browsing
                activity
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <HelpCircle className="w-4 h-4 text-pulse" />
                  <h3 className="font-medium">Answer Options</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Number of choices per question
                </p>
                <select
                  value={settings.quizAnswerOptionsCount ?? 2}
                  onChange={(e) =>
                    handleUpdate({
                      quizAnswerOptionsCount: Number(e.target.value),
                    })
                  }
                  disabled={saving}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={2}>2 options (easier)</option>
                  <option value={3}>3 options</option>
                  <option value={4}>4 options (harder)</option>
                </select>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-secondary" />
                  <h3 className="font-medium">Activity Lookback</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Days of activity to use for questions
                </p>
                <select
                  value={settings.quizActivityDays ?? 3}
                  onChange={(e) =>
                    handleUpdate({ quizActivityDays: Number(e.target.value) })
                  }
                  disabled={saving}
                  className="w-full p-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={1}>1 day</option>
                  <option value={2}>2 days</option>
                  <option value={3}>3 days</option>
                  <option value={4}>4 days</option>
                  <option value={5}>5 days</option>
                  <option value={6}>6 days</option>
                  <option value={7}>7 days</option>
                </select>
              </div>
            </div>

            {/* Quiz Info */}
            <div className="rounded-2xl border border-border bg-muted/30 p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-pulse/10 flex items-center justify-center flex-shrink-0">
                  <Brain className="w-5 h-5 text-pulse" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">How Quizzes Work</h3>
                  <p className="text-sm text-muted-foreground">
                    Quizzes are generated based on the content you&apos;ve read
                    in the browser extension. The AI analyzes your reading
                    activity and creates questions to help reinforce your
                    learning. Generate quizzes from the Dashboard tab.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Account Tab */}
        {activeTab === "account" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold mb-1">Account</h2>
              <p className="text-sm text-muted-foreground">
                Manage your account and data
              </p>
            </div>

            {/* User Info */}
            {clerkUser && (
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    {clerkUser.imageUrl ? (
                      <img
                        src={clerkUser.imageUrl}
                        alt={clerkUser.fullName || "User"}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <User className="w-6 h-6 text-muted-foreground" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-medium">
                      {clerkUser.fullName || "User"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {clerkUser.emailAddresses[0]?.emailAddress}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h3 className="font-semibold text-destructive">Danger Zone</h3>
              </div>

              {!showDeleteConfirm ? (
                <div>
                  <p className="text-sm text-muted-foreground mb-4">
                    Permanently delete your account and all associated data.
                    This action cannot be undone.
                  </p>
                  <Button
                    onClick={() => setShowDeleteConfirm(true)}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete All My Data
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
                    <p className="text-sm text-destructive font-medium mb-2">
                      Are you absolutely sure?
                    </p>
                    <p className="text-sm text-muted-foreground">
                      This will permanently delete all your data including:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-2 list-disc list-inside space-y-1">
                      <li>All browsing history and attention data</li>
                      <li>All chat sessions and messages</li>
                      <li>All focus sessions and insights</li>
                      <li>All quizzes and quiz results</li>
                      <li>All scheduled background jobs</li>
                      <li>Your user account and settings</li>
                    </ul>
                  </div>
                  <div className="flex gap-3">
                    <Button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deleting}
                      variant="outline"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDeleteAllData}
                      disabled={deleting}
                      variant="destructive"
                      className="flex items-center gap-2"
                    >
                      {deleting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-4 h-4" />
                          Yes, Delete Everything
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
