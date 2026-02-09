import { Hono } from "hono";
import {
  db,
  events,
  encrypt,
  ALL_MODELS,
  decryptApiKey,
  fetchModelsForProvider,
} from "../lib/index.js";
import type { LLMProviderType } from "../lib/index.js";
import { env } from "../lib/env.js";
import {
  authMiddleware,
  deviceAuthMiddleware,
  type AuthVariables,
  type DeviceAuthVariables,
} from "../middleware/index.js";
import { scheduleInitialJobs, rescheduleUserJobs } from "../lib/jobs/index.js";

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: {
  get: (key: string) => string | undefined;
}): Promise<string | null> {
  // Check for device token auth first
  const deviceUserId = c.get("userId");
  if (deviceUserId) {
    return deviceUserId;
  }

  // Check for Clerk auth
  const clerkUserId = c.get("clerkUserId");
  if (clerkUserId) {
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    return user?.id || null;
  }

  return null;
}

// Middleware that supports both device token and Clerk auth
async function dualAuthMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    // Update last used timestamp
    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() },
    });
    c.set("userId", deviceToken.user.id);
    c.set("deviceTokenId", deviceToken.id);
    return next();
  }

  // Try Clerk auth
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
    return next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

// Get current user settings (supports both Clerk and device token auth)
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  // Use upsert to avoid race condition when multiple requests try to create settings
  const settings = await db.userSettings.upsert({
    where: { userId },
    update: {}, // No updates on GET, just ensure it exists
    create: {
      userId,
      cognitiveAttentionDebugMode: false,
      cognitiveAttentionShowOverlay: false,
    },
  });

  // Note: Initial jobs are scheduled in POST /users/sync on user registration
  // No need to schedule here as this endpoint is called after user creation

  return c.json({
    cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
    cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
    attentionTrackingIgnoreList: settings.attentionTrackingIgnoreList,
    // Summarization settings
    attentionSummarizationEnabled: settings.attentionSummarizationEnabled,
    attentionSummarizationIntervalMs: settings.attentionSummarizationIntervalMs,
    // Focus calculation settings
    focusCalculationEnabled: settings.focusCalculationEnabled,
    focusCalculationIntervalMs: settings.focusCalculationIntervalMs,
    focusInactivityThresholdMs: settings.focusInactivityThresholdMs,
    focusMinDurationMs: settings.focusMinDurationMs,
    // LLM settings (don't expose actual API keys, just whether they're set)
    llmProvider: settings.llmProvider,
    llmModel: settings.llmModel,
    hasGeminiApiKey: !!settings.geminiApiKeyEncrypted,
    hasAnthropicApiKey: !!settings.anthropicApiKeyEncrypted,
    hasOpenaiApiKey: !!settings.openaiApiKeyEncrypted,
    // Quiz settings
    quizAnswerOptionsCount: settings.quizAnswerOptionsCount,
    quizActivityDays: settings.quizActivityDays,
    // Pomodoro settings
    pomodoroCooldownMs: settings.pomodoroCooldownMs,
    // Focus agent settings
    focusAgentEnabled: settings.focusAgentEnabled,
    focusAgentSensitivity: settings.focusAgentSensitivity,
    focusAgentCooldownMs: settings.focusAgentCooldownMs,
    focusAgentIntervalMs: settings.focusAgentIntervalMs,
    themeMode: settings.themeMode as "light" | "dark",
  });
});

// Get available LLM models (static fallback)
app.get("/llm/models", dualAuthMiddleware, async (c) => {
  return c.json(ALL_MODELS);
});

// Fetch models dynamically for a specific provider using user's API key
app.get("/llm/models/:provider", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const provider = c.req.param("provider") as LLMProviderType;
  if (!["gemini", "anthropic", "openai"].includes(provider)) {
    return c.json({ error: "Invalid provider" }, 400);
  }

  // Get user settings to retrieve their API key
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Determine which API key to use
  let apiKey: string | null = null;

  switch (provider) {
    case "gemini":
      apiKey =
        decryptApiKey(settings?.geminiApiKeyEncrypted) ||
        env.geminiApiKey ||
        null;
      break;
    case "anthropic":
      apiKey = decryptApiKey(settings?.anthropicApiKeyEncrypted);
      break;
    case "openai":
      apiKey = decryptApiKey(settings?.openaiApiKeyEncrypted);
      break;
  }

  if (!apiKey) {
    // Return static models if no API key (for gemini system default)
    if (provider === "gemini" && env.geminiApiKey) {
      apiKey = env.geminiApiKey;
    } else {
      return c.json({ error: "No API key configured for this provider" }, 400);
    }
  }

  try {
    const models = await fetchModelsForProvider(provider, apiKey);
    return c.json(models);
  } catch (error) {
    console.error(`Failed to fetch models for ${provider}:`, error);
    // Fall back to static models on error
    return c.json(ALL_MODELS[provider] || []);
  }
});

// Update user settings (supports both Clerk and device token auth)
app.post("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json<{
    cognitiveAttentionDebugMode?: boolean;
    cognitiveAttentionShowOverlay?: boolean;
    attentionTrackingIgnoreList?: string | null;
    // Summarization settings
    attentionSummarizationEnabled?: boolean;
    attentionSummarizationIntervalMs?: number;
    // Focus calculation settings
    focusCalculationEnabled?: boolean;
    focusCalculationIntervalMs?: number;
    focusInactivityThresholdMs?: number;
    focusMinDurationMs?: number;
    // LLM settings
    llmProvider?: LLMProviderType | null;
    llmModel?: string | null;
    geminiApiKey?: string | null;
    anthropicApiKey?: string | null;
    openaiApiKey?: string | null;
    // Quiz settings
    quizAnswerOptionsCount?: number;
    quizActivityDays?: number;
    // Pomodoro settings
    pomodoroCooldownMs?: number;
    // Focus agent settings
    focusAgentEnabled?: boolean;
    focusAgentSensitivity?: number;
    focusAgentCooldownMs?: number;
    focusAgentIntervalMs?: number;
    // Theme settings
    themeMode?: "light" | "dark";
  }>();

  // Build update data - using Prisma's unchecked types for direct field assignment
  const updateData: Parameters<typeof db.userSettings.update>[0]["data"] = {};
  const createData = {
    userId,
    cognitiveAttentionDebugMode: false as boolean,
    cognitiveAttentionShowOverlay: false as boolean,
    attentionTrackingIgnoreList: null as string | null,
    attentionSummarizationEnabled: true as boolean,
    attentionSummarizationIntervalMs: 60000 as number,
    focusCalculationEnabled: true as boolean,
    focusCalculationIntervalMs: 60000 as number,
    focusInactivityThresholdMs: 900000 as number,
    focusMinDurationMs: 120000 as number,
    llmProvider: null as string | null,
    llmModel: null as string | null,
    geminiApiKeyEncrypted: null as string | null,
    anthropicApiKeyEncrypted: null as string | null,
    openaiApiKeyEncrypted: null as string | null,
    quizAnswerOptionsCount: 2 as number,
    quizActivityDays: 3 as number,
    pomodoroCooldownMs: 120000 as number,
  };

  // Cognitive attention settings
  if (body.cognitiveAttentionDebugMode !== undefined) {
    updateData.cognitiveAttentionDebugMode = body.cognitiveAttentionDebugMode;
    createData.cognitiveAttentionDebugMode = body.cognitiveAttentionDebugMode;
  }
  if (body.cognitiveAttentionShowOverlay !== undefined) {
    updateData.cognitiveAttentionShowOverlay =
      body.cognitiveAttentionShowOverlay;
    createData.cognitiveAttentionShowOverlay =
      body.cognitiveAttentionShowOverlay;
  }
  if (body.attentionTrackingIgnoreList !== undefined) {
    updateData.attentionTrackingIgnoreList = body.attentionTrackingIgnoreList;
    createData.attentionTrackingIgnoreList = body.attentionTrackingIgnoreList;
  }
  // Summarization settings
  if (body.attentionSummarizationEnabled !== undefined) {
    updateData.attentionSummarizationEnabled =
      body.attentionSummarizationEnabled;
    createData.attentionSummarizationEnabled =
      body.attentionSummarizationEnabled;
  }
  if (body.attentionSummarizationIntervalMs !== undefined) {
    updateData.attentionSummarizationIntervalMs =
      body.attentionSummarizationIntervalMs;
    createData.attentionSummarizationIntervalMs =
      body.attentionSummarizationIntervalMs;
  }

  // Focus calculation settings
  if (body.focusCalculationEnabled !== undefined) {
    updateData.focusCalculationEnabled = body.focusCalculationEnabled;
    createData.focusCalculationEnabled = body.focusCalculationEnabled;
  }
  if (body.focusCalculationIntervalMs !== undefined) {
    // Enforce minimum interval of 15 seconds
    const interval = Math.max(15000, body.focusCalculationIntervalMs);
    updateData.focusCalculationIntervalMs = interval;
    createData.focusCalculationIntervalMs = interval;
  }
  if (body.focusInactivityThresholdMs !== undefined) {
    // Enforce minimum threshold of 1 minute
    const threshold = Math.max(60000, body.focusInactivityThresholdMs);
    updateData.focusInactivityThresholdMs = threshold;
    createData.focusInactivityThresholdMs = threshold;
  }
  if (body.focusMinDurationMs !== undefined) {
    // Enforce minimum duration of 30 seconds
    const minDuration = Math.max(30000, body.focusMinDurationMs);
    updateData.focusMinDurationMs = minDuration;
    createData.focusMinDurationMs = minDuration;
  }

  // LLM settings
  if (body.llmProvider !== undefined) {
    updateData.llmProvider = body.llmProvider;
    createData.llmProvider = body.llmProvider;
  }
  if (body.llmModel !== undefined) {
    updateData.llmModel = body.llmModel;
    createData.llmModel = body.llmModel;
  }

  // API keys - encrypt before storing, null clears the key
  if (body.geminiApiKey !== undefined) {
    updateData.geminiApiKeyEncrypted = body.geminiApiKey
      ? encrypt(body.geminiApiKey)
      : null;
    createData.geminiApiKeyEncrypted = body.geminiApiKey
      ? encrypt(body.geminiApiKey)
      : null;
  }
  if (body.anthropicApiKey !== undefined) {
    updateData.anthropicApiKeyEncrypted = body.anthropicApiKey
      ? encrypt(body.anthropicApiKey)
      : null;
    createData.anthropicApiKeyEncrypted = body.anthropicApiKey
      ? encrypt(body.anthropicApiKey)
      : null;
  }
  if (body.openaiApiKey !== undefined) {
    updateData.openaiApiKeyEncrypted = body.openaiApiKey
      ? encrypt(body.openaiApiKey)
      : null;
    createData.openaiApiKeyEncrypted = body.openaiApiKey
      ? encrypt(body.openaiApiKey)
      : null;
  }

  // Quiz settings
  if (body.quizAnswerOptionsCount !== undefined) {
    // Enforce valid range 2-4
    const count = Math.min(4, Math.max(2, body.quizAnswerOptionsCount));
    updateData.quizAnswerOptionsCount = count;
    createData.quizAnswerOptionsCount = count;
  }
  if (body.quizActivityDays !== undefined) {
    // Enforce valid range 1-7
    const days = Math.min(7, Math.max(1, body.quizActivityDays));
    updateData.quizActivityDays = days;
    createData.quizActivityDays = days;
  }

  // Pomodoro settings
  if (body.pomodoroCooldownMs !== undefined) {
    // Enforce minimum of 30 seconds, max of 10 minutes
    const cooldown = Math.min(600000, Math.max(30000, body.pomodoroCooldownMs));
    updateData.pomodoroCooldownMs = cooldown;
    createData.pomodoroCooldownMs = cooldown;
  }

  // Focus agent settings
  if (body.focusAgentEnabled !== undefined) {
    updateData.focusAgentEnabled = body.focusAgentEnabled;
  }
  if (body.focusAgentSensitivity !== undefined) {
    // Enforce valid range 0-1
    const sensitivity = Math.min(1, Math.max(0, body.focusAgentSensitivity));
    updateData.focusAgentSensitivity = sensitivity;
  }
  if (body.focusAgentCooldownMs !== undefined) {
    // Enforce minimum of 1 minute
    const cooldown = Math.max(60000, body.focusAgentCooldownMs);
    updateData.focusAgentCooldownMs = cooldown;
  }
  if (body.focusAgentIntervalMs !== undefined) {
    // Enforce minimum of 30 seconds
    const interval = Math.max(30000, body.focusAgentIntervalMs);
    updateData.focusAgentIntervalMs = interval;
  }

  // Theme settings
  if (body.themeMode !== undefined) {
    const mode = body.themeMode === "dark" ? "dark" : "light";
    updateData.themeMode = mode;
  }

  const settings = await db.userSettings.upsert({
    where: { userId },
    update: updateData,
    create: createData,
  });

  // Reschedule jobs if interval settings changed
  const jobSettingsChanged =
    body.focusCalculationIntervalMs !== undefined ||
    body.attentionSummarizationIntervalMs !== undefined ||
    body.focusAgentIntervalMs !== undefined;

  if (jobSettingsChanged) {
    try {
      await rescheduleUserJobs(userId, settings);
    } catch (error) {
      console.error("[Settings] Failed to reschedule jobs:", error);
      // Don't fail the request, jobs will eventually self-schedule
    }
  }

  // Emit settings changed event for SSE subscribers
  events.emitSettingsChanged({
    userId,
    settings: {
      cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
      cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
      attentionTrackingIgnoreList: settings.attentionTrackingIgnoreList,
      attentionSummarizationEnabled: settings.attentionSummarizationEnabled,
      attentionSummarizationIntervalMs:
        settings.attentionSummarizationIntervalMs,
      focusCalculationEnabled: settings.focusCalculationEnabled,
      focusCalculationIntervalMs: settings.focusCalculationIntervalMs,
      focusInactivityThresholdMs: settings.focusInactivityThresholdMs,
      focusMinDurationMs: settings.focusMinDurationMs,
      llmProvider: settings.llmProvider,
      llmModel: settings.llmModel,
      hasGeminiApiKey: !!settings.geminiApiKeyEncrypted,
      hasAnthropicApiKey: !!settings.anthropicApiKeyEncrypted,
      hasOpenaiApiKey: !!settings.openaiApiKeyEncrypted,
      quizAnswerOptionsCount: settings.quizAnswerOptionsCount,
      quizActivityDays: settings.quizActivityDays,
      pomodoroCooldownMs: settings.pomodoroCooldownMs,
      focusAgentEnabled: settings.focusAgentEnabled,
      focusAgentSensitivity: settings.focusAgentSensitivity,
      focusAgentCooldownMs: settings.focusAgentCooldownMs,
      focusAgentIntervalMs: settings.focusAgentIntervalMs,
      themeMode: settings.themeMode as "light" | "dark",
    },
  });

  return c.json({
    cognitiveAttentionDebugMode: settings.cognitiveAttentionDebugMode,
    cognitiveAttentionShowOverlay: settings.cognitiveAttentionShowOverlay,
    attentionTrackingIgnoreList: settings.attentionTrackingIgnoreList,
    attentionSummarizationEnabled: settings.attentionSummarizationEnabled,
    attentionSummarizationIntervalMs: settings.attentionSummarizationIntervalMs,
    focusCalculationEnabled: settings.focusCalculationEnabled,
    focusCalculationIntervalMs: settings.focusCalculationIntervalMs,
    focusInactivityThresholdMs: settings.focusInactivityThresholdMs,
    focusMinDurationMs: settings.focusMinDurationMs,
    llmProvider: settings.llmProvider,
    llmModel: settings.llmModel,
    hasGeminiApiKey: !!settings.geminiApiKeyEncrypted,
    hasAnthropicApiKey: !!settings.anthropicApiKeyEncrypted,
    hasOpenaiApiKey: !!settings.openaiApiKeyEncrypted,
    quizAnswerOptionsCount: settings.quizAnswerOptionsCount,
    quizActivityDays: settings.quizActivityDays,
    pomodoroCooldownMs: settings.pomodoroCooldownMs,
    focusAgentEnabled: settings.focusAgentEnabled,
    focusAgentSensitivity: settings.focusAgentSensitivity,
    focusAgentCooldownMs: settings.focusAgentCooldownMs,
    focusAgentIntervalMs: settings.focusAgentIntervalMs,
    themeMode: settings.themeMode as "light" | "dark",
  });
});

export default app;
