"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth, SignInButton, useUser } from "@clerk/nextjs";
import { createApiClient, type UserSettings, type LLMModels, type LLMProviderType, type ModelInfo, type UnifiedSSEData } from "@kaizen/api-client";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Logo,
} from "@kaizen/ui";
import { ArrowLeft, Loader2, Check, X, Key, Brain, Timer, HelpCircle, Settings2 } from "lucide-react";

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

  // Subscribe to settings changes via unified SSE (for real-time sync from extensions)
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
              // Initial connection with settings
              setSettings(data.settings);
              setIgnoreListValue(data.settings.attentionTrackingIgnoreList || "");
              setIgnoreListDirty(false);
              break;

            case "settings-changed":
              // Settings changed from another source (e.g., extension)
              setSettings((prev) => prev ? { ...prev, ...data.settings } : null);
              if (!ignoreListDirty && data.settings.attentionTrackingIgnoreList !== undefined) {
                setIgnoreListValue(data.settings.attentionTrackingIgnoreList || "");
              }
              break;
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
  }, [isSignedIn, clerkUser, getToken, ignoreListDirty]);


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
      <main className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto">
          <Logo size="md" className="mb-6" />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Loading settings...</span>
          </div>
        </div>
      </main>
    );
  }

  if (!isSignedIn) {
    return (
      <main className="min-h-screen bg-background p-8">
        <div className="max-w-2xl mx-auto">
          <Logo size="md" className="mb-6" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5" />
                Settings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">Sign in to manage your settings.</p>
              <SignInButton mode="modal">
                <Button>Sign In</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Logo size="md" />
            <h1 className="text-2xl font-bold">Settings</h1>
          </div>
          <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-destructive/10 text-destructive flex items-center gap-2">
            <X className="w-4 h-4" />
            {error}
          </div>
        )}

        {/* Cognitive Attention Tracking Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-secondary" />
            <h2 className="text-lg font-semibold">Cognitive Attention Tracking</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            These settings control the attention tracking behavior in the browser extension.
            Changes will sync to all linked extensions in real-time.
          </p>

          {settings && (
            <div className="space-y-4">
              {/* Debug Mode Toggle */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">Debug Mode</p>
                      <p className="text-sm text-muted-foreground">
                        Shows a debug overlay with real-time attention tracking data including
                        reading progress, top candidates, and scroll velocity.
                      </p>
                    </div>
                    <Button
                      onClick={() => handleToggle("cognitiveAttentionDebugMode")}
                      disabled={saving}
                      variant={settings.cognitiveAttentionDebugMode ? "default" : "outline"}
                      size="sm"
                      className="min-w-[60px]"
                    >
                      {settings.cognitiveAttentionDebugMode ? "ON" : "OFF"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Show Overlay Toggle */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">Show Overlay</p>
                      <p className="text-sm text-muted-foreground">
                        Displays visual overlays around text, images, and audio elements
                        being tracked to show reading progress and attention focus.
                      </p>
                    </div>
                    <Button
                      onClick={() => handleToggle("cognitiveAttentionShowOverlay")}
                      disabled={saving}
                      variant={settings.cognitiveAttentionShowOverlay ? "default" : "outline"}
                      size="sm"
                      className="min-w-[60px]"
                    >
                      {settings.cognitiveAttentionShowOverlay ? "ON" : "OFF"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Ignore List */}
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium mb-1">Ignore List</p>
                  <p className="text-sm text-muted-foreground mb-3">
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
                    className="w-full p-3 rounded-md border border-input bg-background text-sm font-mono resize-y min-h-[100px] focus:outline-none focus:ring-2 focus:ring-ring"
                    rows={5}
                  />
                  {ignoreListDirty && (
                    <Button
                      onClick={handleSaveIgnoreList}
                      disabled={saving}
                      className="mt-3"
                    >
                      {saving ? "Saving..." : "Save Ignore List"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Summarization Settings */}
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium mb-1">Auto-Summarization</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Automatically generate summaries of web pages based on the text you read.
                    Summaries are generated using your configured AI provider.
                  </p>
                  <div>
                    <label className="block text-sm font-medium mb-2">Summarization Interval</label>
                    <select
                      value={settings.attentionSummarizationIntervalMs ?? 60000}
                      onChange={(e) => handleSummarizationIntervalChange(Number(e.target.value))}
                      disabled={saving}
                      className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value={30000}>30 seconds</option>
                      <option value={60000}>1 minute</option>
                      <option value={120000}>2 minutes</option>
                      <option value={300000}>5 minutes</option>
                      <option value={600000}>10 minutes</option>
                    </select>
                    <p className="text-xs text-muted-foreground mt-2">
                      How often to check for new content to summarize.
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Focus Detection Settings */}
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium mb-1">Focus Detection</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Automatically detect what you&apos;re focused on based on your browsing activity.
                    Uses AI to analyze patterns and identify your current area of focus.
                  </p>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-2">Calculation Interval</label>
                      <select
                        value={settings.focusCalculationIntervalMs ?? 30000}
                        onChange={(e) => handleFocusIntervalChange(Number(e.target.value))}
                        disabled={saving}
                        className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value={30000}>30 seconds</option>
                        <option value={60000}>1 minute</option>
                        <option value={120000}>2 minutes</option>
                        <option value={300000}>5 minutes</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-2">
                        How often to analyze your activity and update focus.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Inactivity Threshold</label>
                      <select
                        value={settings.focusInactivityThresholdMs ?? 60000}
                        onChange={(e) => handleFocusInactivityChange(Number(e.target.value))}
                        disabled={saving}
                        className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value={60000}>1 minute</option>
                        <option value={120000}>2 minutes</option>
                        <option value={300000}>5 minutes</option>
                        <option value={600000}>10 minutes</option>
                        <option value={900000}>15 minutes</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-2">
                        End focus after this period of inactivity.
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium mb-2">Minimum Focus Duration</label>
                      <select
                        value={settings.focusMinDurationMs ?? 30000}
                        onChange={(e) => handleFocusMinDurationChange(Number(e.target.value))}
                        disabled={saving}
                        className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        <option value={30000}>30 seconds</option>
                        <option value={60000}>1 minute</option>
                        <option value={120000}>2 minutes</option>
                        <option value={300000}>5 minutes</option>
                      </select>
                      <p className="text-xs text-muted-foreground mt-2">
                        Minimum time before detecting a new focus area.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </section>

        {/* LLM Settings Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Key className="w-5 h-5 text-secondary" />
            <h2 className="text-lg font-semibold">AI Chat Settings</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Configure which AI provider and model to use for chat. Add your API keys first,
            then select a provider and model.
          </p>

          {settings && llmModels && (
            <div className="space-y-4">
              {/* API Keys Section */}
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium mb-1">API Keys</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    Add your API keys to enable different providers. Keys are encrypted and stored securely.
                  </p>

                  <div className="space-y-4">
                    {(Object.keys(PROVIDER_LABELS) as LLMProviderType[]).map((provider) => (
                      <div key={provider}>
                        <label className="block text-sm font-medium mb-2">
                          {PROVIDER_LABELS[provider]}
                          {hasApiKey(provider) && (
                            <span className="text-accent ml-2 font-normal flex items-center gap-1 inline-flex">
                              <Check className="w-3 h-3" />
                              configured
                            </span>
                          )}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            type="password"
                            placeholder={hasApiKey(provider) ? "••••••••••••••••" : `Enter ${PROVIDER_LABELS[provider]} API key`}
                            value={apiKeyInputs[provider]}
                            onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [provider]: e.target.value }))}
                            disabled={saving}
                            className="flex-1"
                          />
                          <Button
                            onClick={() => handleApiKeySave(provider)}
                            disabled={saving || !apiKeyInputs[provider].trim()}
                          >
                            Save
                          </Button>
                          {hasApiKey(provider) && (
                            <Button
                              onClick={() => handleApiKeyClear(provider)}
                              disabled={saving}
                              variant="destructive"
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Provider Selection */}
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium mb-1">Active Provider</p>
                  <p className="text-sm text-muted-foreground mb-3">
                    Select which provider to use for chat. Only providers with configured API keys are available.
                  </p>
                  <select
                    value={settings.llmProvider || ""}
                    onChange={(e) => handleProviderChange(e.target.value as LLMProviderType | "")}
                    disabled={saving}
                    className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                      Using system Gemini API. Add your own API key above to use a different provider.
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Model Selection */}
              {settings.llmProvider && hasApiKey(settings.llmProvider) && (() => {
                const models = providerModels[settings.llmProvider] || llmModels?.[settings.llmProvider] || [];
                const isLoadingProviderModels = loadingModels[settings.llmProvider];

                return (
                  <Card>
                    <CardContent className="pt-4">
                      <p className="font-medium mb-1">
                        Model
                        {isLoadingProviderModels && (
                          <span className="font-normal text-muted-foreground ml-2 text-sm">
                            (loading models...)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-muted-foreground mb-3">
                        Select the model to use for {PROVIDER_LABELS[settings.llmProvider]}.
                        {models.length > 0 && ` ${models.length} models available.`}
                      </p>
                      <select
                        value={settings.llmModel || ""}
                        onChange={(e) => handleModelChange(e.target.value)}
                        disabled={saving || isLoadingProviderModels}
                        className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                      {settings.llmModel && models.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          {models.find((m) => m.id === settings.llmModel)?.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}
        </section>

        {/* Pomodoro Settings Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Timer className="w-5 h-5 text-pomodoro" />
            <h2 className="text-lg font-semibold">Pomodoro Timer</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            The Pomodoro timer automatically tracks your focused work time. It starts when focus is detected
            and continues running even during brief breaks (cooldown period).
          </p>

          {settings && (
            <Card>
              <CardContent className="pt-4">
                <label className="block text-sm font-medium mb-2">Cooldown Period</label>
                <select
                  value={settings.pomodoroCooldownMs ?? 120000}
                  onChange={async (e) => {
                    setSaving(true);
                    const api = createApiClient(apiUrl, getTokenFn);
                    try {
                      const result = await api.settings.update({
                        pomodoroCooldownMs: Number(e.target.value),
                      });
                      setSettings(result);
                      setError("");
                    } catch (err) {
                      console.error("Update pomodoro cooldown error:", err);
                      setError("Failed to update pomodoro settings");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  disabled={saving}
                  className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={30000}>30 seconds</option>
                  <option value={60000}>1 minute</option>
                  <option value={120000}>2 minutes</option>
                  <option value={180000}>3 minutes</option>
                  <option value={300000}>5 minutes</option>
                  <option value={600000}>10 minutes</option>
                </select>
                <p className="text-xs text-muted-foreground mt-2">
                  How long the timer continues running after all focus sessions end.
                  If you resume work within this time, the timer continues. Otherwise, it resets.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Quiz Settings Section */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <HelpCircle className="w-5 h-5 text-pulse" />
            <h2 className="text-lg font-semibold">Quiz Settings</h2>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Configure how the daily learning quiz is generated based on your browsing activity.
          </p>

          {settings && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-4">
                  <label className="block text-sm font-medium mb-2">Answer Options per Question</label>
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
                    className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={2}>2 options</option>
                    <option value={3}>3 options</option>
                    <option value={4}>4 options</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    More options make the quiz harder.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4">
                  <label className="block text-sm font-medium mb-2">Activity Lookback Period</label>
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
                    className="w-full p-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value={1}>1 day</option>
                    <option value={2}>2 days</option>
                    <option value={3}>3 days</option>
                    <option value={4}>4 days</option>
                    <option value={5}>5 days</option>
                    <option value={6}>6 days</option>
                    <option value={7}>7 days</option>
                  </select>
                  <p className="text-xs text-muted-foreground mt-2">
                    How many days of browsing activity to use for generating quiz questions.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
