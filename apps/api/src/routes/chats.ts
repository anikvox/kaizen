import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { UserSettings } from "@prisma/client";
import {
  db,
  events,
  createLLMBot,
  generateChatTitle,
  getAttentionData,
  serializeAttentionForLLM,
  SYSTEM_PROMPTS,
} from "../lib/index.js";
import type { BotMessage, BotMediaPart } from "../lib/index.js";

// Valid attention range values
type ChatAttentionRange = "30m" | "2h" | "1d" | "all";

const ATTENTION_RANGE_MS: Record<ChatAttentionRange, number> = {
  "30m": 30 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "all": 10 * 365 * 24 * 60 * 60 * 1000, // 10 years
};

function isValidAttentionRange(range: string): range is ChatAttentionRange {
  return ["30m", "2h", "1d", "all"].includes(range);
}

/**
 * Build a system prompt that includes the user's attention context.
 */
function buildSystemPromptWithAttention(attentionContext: string): string {
  return `${SYSTEM_PROMPTS.chat}

You have access to the user's recent browsing activity and attention data. Use this context to provide more personalized and relevant responses. The user may ask questions about what they were reading, watching, or doing online.

${attentionContext}`;
}

// Timeout for bot typing state (1 minute)
const BOT_TYPING_TIMEOUT_MS = 60 * 1000;

// Track active bot responses for timeout handling
const activeBotResponses = new Map<string, NodeJS.Timeout>();

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: { get: (key: string) => string | undefined }): Promise<string | null> {
  const deviceUserId = c.get("userId");
  if (deviceUserId) {
    return deviceUserId;
  }

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

// List all chat sessions for the user
app.get("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  // Note: attentionRange field requires Prisma client regeneration after schema update
  const sessions = await db.chatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });

  const sessionCounts = await db.chatMessage.groupBy({
    by: ["sessionId"],
    where: { sessionId: { in: sessions.map((s) => s.id) } },
    _count: true,
  });

  const countMap = new Map(sessionCounts.map((c) => [c.sessionId, c._count]));

  return c.json(
    sessions.map((s) => ({
      id: s.id,
      title: s.title,
      attentionRange: (s as any).attentionRange || "2h",
      messageCount: countMap.get(s.id) || 0,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }))
  );
});

// Get a specific chat session with all messages
app.get("/:sessionId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const sessionId = c.req.param("sessionId");

  const session = await db.chatSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) {
    return c.json({ error: "Chat session not found" }, 404);
  }

  return c.json({
    id: session.id,
    title: session.title,
    attentionRange: (session as any).attentionRange || "2h",
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messages: session.messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      status: m.status,
      errorMessage: m.errorMessage,
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    })),
  });
});

// Send a message to a chat session (creates session if needed)
app.post("/", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json<{
    sessionId?: string;
    content: string;
    attentionRange: string;
  }>();

  if (!body.content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  if (!body.attentionRange || !isValidAttentionRange(body.attentionRange)) {
    return c.json({ error: "Valid attentionRange is required (30m, 2h, 1d, or all)" }, 400);
  }

  const attentionRange = body.attentionRange as ChatAttentionRange;

  let sessionId = body.sessionId;
  let isNewSession = false;
  let sessionAttentionRange: ChatAttentionRange = attentionRange;

  // Create new session if not provided
  if (!sessionId) {
    // Note: attentionRange field requires Prisma client regeneration after schema update
    const session = await db.chatSession.create({
      data: {
        userId,
        title: "New Chat", // Hardcoded for now, bot will update later
        attentionRange,
      } as any,
    });
    sessionId = session.id;
    isNewSession = true;

    // Emit session created event
    events.emitChatSessionCreated({
      userId,
      sessionId: session.id,
      session: {
        id: session.id,
        title: session.title,
        attentionRange,
        createdAt: session.createdAt.toISOString(),
        updatedAt: session.updatedAt.toISOString(),
      },
    });
  } else {
    // Verify session belongs to user and get its attention range
    const existingSession = await db.chatSession.findFirst({
      where: { id: sessionId, userId },
    });

    if (!existingSession) {
      return c.json({ error: "Chat session not found" }, 404);
    }

    // Use the session's stored attention range
    sessionAttentionRange = ((existingSession as any).attentionRange || "2h") as ChatAttentionRange;
  }

  // Fetch attention data for the system prompt
  const now = new Date();
  const attentionTimeRange = {
    from: new Date(now.getTime() - ATTENTION_RANGE_MS[sessionAttentionRange]),
    to: now,
  };

  let attentionContext = "";
  try {
    const attentionData = await getAttentionData(userId, attentionTimeRange);
    if (attentionData.pages.length > 0) {
      attentionContext = serializeAttentionForLLM(attentionData);
    }
  } catch (error) {
    console.error("Failed to fetch attention data:", error);
    // Continue without attention context if fetch fails
  }

  // Create user message
  const userMessage = await db.chatMessage.create({
    data: {
      sessionId,
      role: "user",
      content: body.content.trim(),
      status: "sent",
    },
  });

  // Emit user message created event
  events.emitChatMessageCreated({
    userId,
    sessionId,
    message: {
      id: userMessage.id,
      role: "user",
      content: userMessage.content,
      status: "sent",
      createdAt: userMessage.createdAt.toISOString(),
      updatedAt: userMessage.updatedAt.toISOString(),
    },
  });

  // Create bot message placeholder with "typing" status
  const botMessage = await db.chatMessage.create({
    data: {
      sessionId,
      role: "bot",
      content: "",
      status: "typing",
    },
  });

  // Emit bot message created event (typing state)
  events.emitChatMessageCreated({
    userId,
    sessionId,
    message: {
      id: botMessage.id,
      role: "bot",
      content: "",
      status: "typing",
      createdAt: botMessage.createdAt.toISOString(),
      updatedAt: botMessage.updatedAt.toISOString(),
    },
  });

  // Set up timeout for bot response
  const timeoutId = setTimeout(async () => {
    activeBotResponses.delete(botMessage.id);

    // Check if still in typing state
    const currentMessage = await db.chatMessage.findUnique({
      where: { id: botMessage.id },
    });

    if (currentMessage && currentMessage.status === "typing") {
      await db.chatMessage.update({
        where: { id: botMessage.id },
        data: {
          status: "error",
          errorMessage: "Response timed out",
        },
      });

      events.emitChatMessageUpdated({
        userId,
        sessionId,
        messageId: botMessage.id,
        updates: {
          status: "error",
          errorMessage: "Response timed out",
        },
      });
    }
  }, BOT_TYPING_TIMEOUT_MS);

  activeBotResponses.set(botMessage.id, timeoutId);

  // Get conversation history for bot
  const allMessages = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });

  const botMessages: BotMessage[] = allMessages
    .filter((m) => m.id !== botMessage.id) // Exclude the current bot placeholder
    .map((m) => ({
      role: m.role as "user" | "bot",
      content: m.content,
    }));

  // Fetch user settings for LLM configuration
  const userSettings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Build system prompt with attention context
  const systemPrompt = attentionContext
    ? buildSystemPromptWithAttention(attentionContext)
    : SYSTEM_PROMPTS.chat;

  // Start bot response generation (non-blocking)
  // Pass first user message for title generation if this is a new session
  const firstUserMessage = isNewSession ? body.content.trim() : undefined;
  generateBotResponse(userId, sessionId, botMessage.id, botMessages, firstUserMessage, userSettings, systemPrompt);

  // Update session updatedAt
  await db.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });

  return c.json({
    sessionId,
    isNewSession,
    userMessage: {
      id: userMessage.id,
      role: "user",
      content: userMessage.content,
      status: "sent",
      createdAt: userMessage.createdAt.toISOString(),
      updatedAt: userMessage.updatedAt.toISOString(),
    },
    botMessage: {
      id: botMessage.id,
      role: "bot",
      content: "",
      status: "typing",
      createdAt: botMessage.createdAt.toISOString(),
      updatedAt: botMessage.updatedAt.toISOString(),
    },
  });
});

// Delete a chat session
app.delete("/:sessionId", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);
  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const sessionId = c.req.param("sessionId");

  const session = await db.chatSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    return c.json({ error: "Chat session not found" }, 404);
  }

  await db.chatSession.delete({
    where: { id: sessionId },
  });

  // Emit session deleted event
  events.emitChatSessionDeleted({
    userId,
    sessionId,
  });

  return c.json({ success: true });
});

// Non-blocking bot response generation
async function generateBotResponse(
  userId: string,
  sessionId: string,
  botMessageId: string,
  conversationHistory: BotMessage[],
  firstUserMessage?: string, // If provided, generate title after bot response
  userSettings?: UserSettings | null,
  systemPrompt?: string
) {
  // Create bot with user's LLM settings and custom system prompt
  const bot = createLLMBot({
    settings: userSettings,
    systemPrompt,
  });

  try {
    await bot.generateResponse(conversationHistory, {
      onTyping: async () => {
        // Already in typing state, update to streaming when first chunk arrives
      },

      onChunk: async (chunk: string, fullContent: string) => {
        // Clear timeout on first chunk
        const timeoutId = activeBotResponses.get(botMessageId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          activeBotResponses.delete(botMessageId);
        }

        // Update message in database
        await db.chatMessage.update({
          where: { id: botMessageId },
          data: {
            content: fullContent,
            status: "streaming",
          },
        });

        // Emit update event
        events.emitChatMessageUpdated({
          userId,
          sessionId,
          messageId: botMessageId,
          updates: {
            content: fullContent,
            status: "streaming",
          },
        });
      },

      onMedia: async (media: BotMediaPart) => {
        // When media is received during streaming, we'll append it to the content
        // as a data URL for immediate display
        // The media will be properly included in onFinished
        console.log(`Received ${media.type} media: ${media.mimeType}`);
      },

      onFinished: async (fullContent: string, media?: BotMediaPart[]) => {
        // Clear timeout
        const timeoutId = activeBotResponses.get(botMessageId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          activeBotResponses.delete(botMessageId);
        }

        // Build final content including any media as data URLs
        let finalContent = fullContent;
        if (media && media.length > 0) {
          for (const m of media) {
            if (m.type === "image") {
              // Append image as markdown with data URL
              const dataUrl = `data:${m.mimeType};base64,${m.data}`;
              finalContent += `\n\n![Generated Image](${dataUrl})`;
            } else if (m.type === "audio") {
              // Append audio as HTML audio element
              const dataUrl = `data:${m.mimeType};base64,${m.data}`;
              finalContent += `\n\n<audio controls src="${dataUrl}"></audio>`;
            } else if (m.type === "video") {
              // Append video as HTML video element
              const dataUrl = `data:${m.mimeType};base64,${m.data}`;
              finalContent += `\n\n<video controls src="${dataUrl}"></video>`;
            }
          }
        }

        // Update message in database
        await db.chatMessage.update({
          where: { id: botMessageId },
          data: {
            content: finalContent,
            status: "finished",
          },
        });

        // Emit update event
        events.emitChatMessageUpdated({
          userId,
          sessionId,
          messageId: botMessageId,
          updates: {
            content: finalContent,
            status: "finished",
          },
        });

        // Generate and update chat title if this is the first message
        if (firstUserMessage) {
          try {
            const title = await generateChatTitle(firstUserMessage);

            // Update session with new title
            await db.chatSession.update({
              where: { id: sessionId },
              data: { title, updatedAt: new Date() },
            });

            // Emit session updated event for title change
            events.emitChatSessionUpdated({
              userId,
              sessionId,
              updates: { title },
            });
          } catch (error) {
            console.error("Failed to generate chat title:", error);
          }
        } else {
          // Just update session updatedAt
          await db.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });
        }
      },

      onError: async (error: Error) => {
        // Clear timeout
        const timeoutId = activeBotResponses.get(botMessageId);
        if (timeoutId) {
          clearTimeout(timeoutId);
          activeBotResponses.delete(botMessageId);
        }

        // Update message in database
        await db.chatMessage.update({
          where: { id: botMessageId },
          data: {
            status: "error",
            errorMessage: error.message,
          },
        });

        // Emit update event
        events.emitChatMessageUpdated({
          userId,
          sessionId,
          messageId: botMessageId,
          updates: {
            status: "error",
            errorMessage: error.message,
          },
        });
      },
    });
  } catch (error) {
    console.error("Bot response error:", error);

    // Clear timeout
    const timeoutId = activeBotResponses.get(botMessageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeBotResponses.delete(botMessageId);
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await db.chatMessage.update({
      where: { id: botMessageId },
      data: {
        status: "error",
        errorMessage,
      },
    });

    events.emitChatMessageUpdated({
      userId,
      sessionId,
      messageId: botMessageId,
      updates: {
        status: "error",
        errorMessage,
      },
    });
  }
}

export default app;

// SSE endpoints for chat updates
export const chatSSE = new Hono();

// SSE for all user's chats
chatSSE.get("/", async (c) => {
  const token = c.req.query("token");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  let userId: string;

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    userId = deviceToken.user.id;
  } else {
    // Try Clerk auth
    try {
      const { verifyToken } = await import("@clerk/backend");
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const user = await db.user.findUnique({
        where: { clerkId: payload.sub },
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      userId = user.id;
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Send initial connection confirmation
    await stream.writeSSE({
      data: JSON.stringify({ connected: true }),
      event: "connected",
      id: String(id++),
    });

    // Listen for chat session events
    const cleanupSessionCreated = events.onChatSessionCreated(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-session-created",
          id: String(id++),
        });
      }
    });

    const cleanupSessionUpdated = events.onChatSessionUpdated(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-session-updated",
          id: String(id++),
        });
      }
    });

    const cleanupSessionDeleted = events.onChatSessionDeleted(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-session-deleted",
          id: String(id++),
        });
      }
    });

    const cleanupMessageCreated = events.onChatMessageCreated(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-message-created",
          id: String(id++),
        });
      }
    });

    const cleanupMessageUpdated = events.onChatMessageUpdated(async (data) => {
      if (data.userId === userId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-message-updated",
          id: String(id++),
        });
      }
    });

    // Keep connection alive with periodic pings
    try {
      while (true) {
        await stream.writeSSE({
          data: JSON.stringify({ time: new Date().toISOString() }),
          event: "ping",
          id: String(id++),
        });
        await stream.sleep(30000);
      }
    } finally {
      cleanupSessionCreated();
      cleanupSessionUpdated();
      cleanupSessionDeleted();
      cleanupMessageCreated();
      cleanupMessageUpdated();
    }
  });
});

// SSE for a specific chat session
chatSSE.get("/:sessionId", async (c) => {
  const token = c.req.query("token");
  const sessionId = c.req.param("sessionId");

  if (!token) {
    return c.json({ error: "Token required" }, 401);
  }

  let userId: string;

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    userId = deviceToken.user.id;
  } else {
    // Try Clerk auth
    try {
      const { verifyToken } = await import("@clerk/backend");
      const payload = await verifyToken(token, {
        secretKey: process.env.CLERK_SECRET_KEY,
      });

      const user = await db.user.findUnique({
        where: { clerkId: payload.sub },
      });

      if (!user) {
        return c.json({ error: "User not found" }, 404);
      }

      userId = user.id;
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  // Verify session belongs to user
  const session = await db.chatSession.findFirst({
    where: { id: sessionId, userId },
  });

  if (!session) {
    return c.json({ error: "Chat session not found" }, 404);
  }

  return streamSSE(c, async (stream) => {
    let id = 0;

    // Send initial connection confirmation with session info
    await stream.writeSSE({
      data: JSON.stringify({
        connected: true,
        session: {
          id: session.id,
          title: session.title,
          createdAt: session.createdAt.toISOString(),
          updatedAt: session.updatedAt.toISOString(),
        },
      }),
      event: "connected",
      id: String(id++),
    });

    // Listen only for events related to this session
    const cleanupSessionUpdated = events.onChatSessionUpdated(async (data) => {
      if (data.userId === userId && data.sessionId === sessionId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-session-updated",
          id: String(id++),
        });
      }
    });

    const cleanupSessionDeleted = events.onChatSessionDeleted(async (data) => {
      if (data.userId === userId && data.sessionId === sessionId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-session-deleted",
          id: String(id++),
        });
      }
    });

    const cleanupMessageCreated = events.onChatMessageCreated(async (data) => {
      if (data.userId === userId && data.sessionId === sessionId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-message-created",
          id: String(id++),
        });
      }
    });

    const cleanupMessageUpdated = events.onChatMessageUpdated(async (data) => {
      if (data.userId === userId && data.sessionId === sessionId) {
        await stream.writeSSE({
          data: JSON.stringify(data),
          event: "chat-message-updated",
          id: String(id++),
        });
      }
    });

    // Keep connection alive with periodic pings
    try {
      while (true) {
        await stream.writeSSE({
          data: JSON.stringify({ time: new Date().toISOString() }),
          event: "ping",
          id: String(id++),
        });
        await stream.sleep(30000);
      }
    } finally {
      cleanupSessionUpdated();
      cleanupSessionDeleted();
      cleanupMessageCreated();
      cleanupMessageUpdated();
    }
  });
});
