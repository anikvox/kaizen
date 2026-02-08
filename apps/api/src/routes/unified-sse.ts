import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db, events } from "../lib/index.js";
import { getPomodoroStatus } from "../lib/pomodoro/index.js";
import { getUserPulses } from "../lib/pulse/index.js";

/**
 * Unified SSE endpoint that combines all real-time streams into a single connection.
 * This reduces the number of connections from 5+ to 1, avoiding browser connection limits.
 *
 * Supports both device token and Clerk JWT authentication.
 *
 * Event types:
 * - connected: Initial connection with all current state
 * - settings-changed: User settings updated
 * - focus-changed: Focus session created/updated/ended
 * - pomodoro-tick: Pomodoro timer tick (every second when active)
 * - pomodoro-status-changed: Pomodoro state changed
 * - chat-session-created: New chat session
 * - chat-session-updated: Chat session updated (title, etc.)
 * - chat-session-deleted: Chat session deleted
 * - chat-message-created: New message in a chat
 * - chat-message-updated: Message updated (streaming, status change)
 * - device-token-revoked: Device token was revoked
 * - active-tab-changed: Active browser tab changed
 * - pulses-updated: User's pulses were regenerated
 */

const app = new Hono();

// Helper to authenticate and get user info
async function authenticateToken(token: string): Promise<{
  userId: string;
  user: { id: string; email: string; name: string | null };
  deviceToken?: string;
} | null> {
  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    return {
      userId: deviceToken.user.id,
      user: {
        id: deviceToken.user.id,
        email: deviceToken.user.email,
        name: deviceToken.user.name,
      },
      deviceToken: token,
    };
  }

  // Try Clerk JWT auth
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });

    const user = await db.user.findUnique({
      where: { clerkId: payload.sub },
    });

    if (user) {
      return {
        userId: user.id,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
      };
    }
  } catch {
    // Invalid Clerk token
  }

  return null;
}

app.get("/", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  // Authenticate with dual auth support
  const authResult = await authenticateToken(token);

  if (!authResult) {
    return c.json({ error: "Invalid token" }, 401);
  }

  const { userId, user, deviceToken } = authResult;

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Gather initial state
    const [settings, focuses, pomodoroStatus, pulses] = await Promise.all([
      db.userSettings.upsert({
        where: { userId },
        update: {},
        create: {
          userId,
          cognitiveAttentionDebugMode: false,
          cognitiveAttentionShowOverlay: false,
        },
      }),
      db.focus.findMany({
        where: { userId, isActive: true },
        orderBy: { startedAt: "desc" },
      }),
      getPomodoroStatus(userId),
      getUserPulses(userId),
    ]);

    // Send initial connection with all state
    await stream.writeSSE({
      data: JSON.stringify({
        type: "connected",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        settings: {
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
        },
        focuses: focuses.map((f) => ({
          id: f.id,
          item: f.item,
          keywords: f.keywords,
          isActive: f.isActive,
          startedAt: f.startedAt.toISOString(),
          endedAt: f.endedAt?.toISOString() || null,
          lastActivityAt: f.lastActivityAt.toISOString(),
        })),
        pomodoro: pomodoroStatus,
        pulses: pulses.map((p) => ({
          id: p.id,
          message: p.message,
          createdAt: p.createdAt.toISOString(),
        })),
      }),
      event: "message",
      id: String(id++),
    });

    // Subscribe to all event types
    const cleanups: (() => void)[] = [];

    // Settings changed
    cleanups.push(
      events.onSettingsChanged(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "settings-changed",
              settings: data.settings,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Focus changed
    cleanups.push(
      events.onFocusChanged(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "focus-changed",
              focus: data.focus,
              changeType: data.changeType,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Pomodoro status changed
    cleanups.push(
      events.onPomodoroStatusChanged(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "pomodoro-status-changed",
              status: data.status,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Chat session created
    cleanups.push(
      events.onChatSessionCreated(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "chat-session-created",
              sessionId: data.sessionId,
              session: data.session,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Chat session updated
    cleanups.push(
      events.onChatSessionUpdated(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "chat-session-updated",
              sessionId: data.sessionId,
              updates: data.updates,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Chat session deleted
    cleanups.push(
      events.onChatSessionDeleted(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "chat-session-deleted",
              sessionId: data.sessionId,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Chat message created
    cleanups.push(
      events.onChatMessageCreated(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "chat-message-created",
              sessionId: data.sessionId,
              message: data.message,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Chat message updated
    cleanups.push(
      events.onChatMessageUpdated(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "chat-message-updated",
              sessionId: data.sessionId,
              messageId: data.messageId,
              updates: data.updates,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Tool call started
    cleanups.push(
      events.onToolCallStarted(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "tool-call-started",
              sessionId: data.sessionId,
              toolCallId: data.toolCallId,
              toolName: data.toolName,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Device token revoked (only relevant for device token auth)
    cleanups.push(
      events.onDeviceTokenRevoked(async (data) => {
        if (deviceToken && data.token === deviceToken) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "device-token-revoked",
              token: data.token,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Device list changed
    cleanups.push(
      events.onDeviceListChanged(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "device-list-changed",
              action: data.action,
              deviceId: data.deviceId,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Pulses updated
    cleanups.push(
      events.onPulsesUpdated(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "pulses-updated",
              pulses: data.pulses.map((p) => ({
                id: p.id,
                message: p.message,
                createdAt: p.createdAt.toISOString(),
              })),
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Active tab changed
    cleanups.push(
      events.onActiveTabChanged(async (data) => {
        if (data.userId === userId) {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "active-tab-changed",
              url: data.url,
              title: data.title,
              timestamp: data.timestamp,
            }),
            event: "message",
            id: String(id++),
          });
        }
      })
    );

    // Keep-alive ping and pomodoro ticks
    try {
      while (true) {
        // Get current pomodoro status for tick
        const currentStatus = await getPomodoroStatus(userId);

        // Only send tick if pomodoro is active (running or cooldown)
        if (currentStatus.state === "running" || currentStatus.state === "cooldown") {
          await stream.writeSSE({
            data: JSON.stringify({
              type: "pomodoro-tick",
              status: currentStatus,
            }),
            event: "message",
            id: String(id++),
          });
        }

        // Always send ping for keep-alive
        await stream.writeSSE({
          data: JSON.stringify({
            type: "ping",
            time: new Date().toISOString(),
          }),
          event: "message",
          id: String(id++),
        });

        await stream.sleep(1000);
      }
    } finally {
      // Cleanup all subscriptions
      cleanups.forEach((cleanup) => cleanup());
    }
  });
});

export default app;
