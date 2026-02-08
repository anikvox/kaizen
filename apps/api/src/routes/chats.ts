import { Hono } from "hono";
import type { UserSettings } from "@prisma/client";
import { db, events, generateChatTitle, runChatAgent } from "../lib/index.js";
import type { ChatAgentMessage } from "../lib/index.js";

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
async function getUserIdFromContext(c: {
  get: (key: string) => string | undefined;
}): Promise<string | null> {
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
    })),
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
        orderBy: { updatedAt: "asc" }, // Order by updatedAt so tool results appear before assistant's final response
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
      toolCallId: m.toolCallId,
      toolName: m.toolName,
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
    attentionRange?: string;
  }>();

  if (!body.content?.trim()) {
    return c.json({ error: "Message content is required" }, 400);
  }

  let sessionId = body.sessionId;
  let isNewSession = false;
  let sessionAttentionRange = body.attentionRange || "2h";

  // Create new session if not provided
  if (!sessionId) {
    const session = await db.chatSession.create({
      data: {
        userId,
        title: "New Chat", // Will be updated by bot after first response
        attentionRange: sessionAttentionRange,
      },
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
        attentionRange: sessionAttentionRange,
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
    sessionAttentionRange = existingSession.attentionRange || "2h";
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

  // Create assistant message placeholder with "typing" status
  const assistantMessage = await db.chatMessage.create({
    data: {
      sessionId,
      role: "assistant",
      content: "",
      status: "typing",
    },
  });

  // Emit assistant message created event (typing state)
  events.emitChatMessageCreated({
    userId,
    sessionId,
    message: {
      id: assistantMessage.id,
      role: "assistant",
      content: "",
      status: "typing",
      createdAt: assistantMessage.createdAt.toISOString(),
      updatedAt: assistantMessage.updatedAt.toISOString(),
    },
  });

  // Set up timeout for assistant response
  const timeoutId = setTimeout(async () => {
    activeBotResponses.delete(assistantMessage.id);

    // Check if still in typing state
    const currentMessage = await db.chatMessage.findUnique({
      where: { id: assistantMessage.id },
    });

    if (currentMessage && currentMessage.status === "typing") {
      await db.chatMessage.update({
        where: { id: assistantMessage.id },
        data: {
          status: "error",
          errorMessage: "Response timed out",
        },
      });

      events.emitChatMessageUpdated({
        userId,
        sessionId,
        messageId: assistantMessage.id,
        updates: {
          status: "error",
          errorMessage: "Response timed out",
        },
      });
    }
  }, BOT_TYPING_TIMEOUT_MS);

  activeBotResponses.set(assistantMessage.id, timeoutId);

  // Get conversation history for agent
  const allMessages = await db.chatMessage.findMany({
    where: { sessionId },
    orderBy: { updatedAt: "asc" },
  });

  const agentMessages: ChatAgentMessage[] = allMessages
    .filter((m) => m.id !== assistantMessage.id) // Exclude the current assistant placeholder
    .filter((m) => m.role !== "tool") // Exclude tool messages - they were part of completed tool call flows
    .map((m) => ({
      role: (m.role === "bot" ? "assistant" : m.role) as "user" | "assistant",
      content: m.content,
    }));

  // Fetch user settings for LLM configuration
  const userSettings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Start agent response generation (non-blocking)
  // The agent will use tools to get attention data when needed
  // Pass first user message for title generation if this is a new session
  const firstUserMessage = isNewSession ? body.content.trim() : undefined;
  generateAgentResponse(
    userId,
    sessionId,
    assistantMessage.id,
    agentMessages,
    firstUserMessage,
    userSettings,
    sessionAttentionRange,
  );

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
    assistantMessage: {
      id: assistantMessage.id,
      role: "assistant",
      content: "",
      status: "typing",
      createdAt: assistantMessage.createdAt.toISOString(),
      updatedAt: assistantMessage.updatedAt.toISOString(),
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

// Non-blocking agentic response generation with tool support
async function generateAgentResponse(
  userId: string,
  sessionId: string,
  assistantMessageId: string,
  conversationHistory: ChatAgentMessage[],
  firstUserMessage?: string, // If provided, generate title after response
  userSettings?: UserSettings | null,
  attentionRange?: string, // User's selected time range for activity context
) {
  // Build context about the user's selected attention range
  const attentionRangeContext = attentionRange
    ? `\n\n## Attention Range Context\nThe user has selected "${attentionRange}" as their attention range for this conversation. When querying browsing activity or attention data, use this time range:\n- "30m" = last 30 minutes\n- "2h" = last 2 hours\n- "1d" = last 24 hours\n- "all" = all available data\n\nUse the appropriate preset or minutes value when calling get_attention_data or similar tools.`
    : "";

  try {
    await runChatAgent(
      userId,
      conversationHistory,
      userSettings || null,
      attentionRangeContext || undefined,
      {
        onTextChunk: async (chunk: string, fullContent: string) => {
          // Clear timeout on first chunk
          const timeoutId = activeBotResponses.get(assistantMessageId);
          if (timeoutId) {
            clearTimeout(timeoutId);
            activeBotResponses.delete(assistantMessageId);
          }

          // Update message in database
          await db.chatMessage.update({
            where: { id: assistantMessageId },
            data: {
              content: fullContent,
              status: "streaming",
            },
          });

          // Emit update event
          events.emitChatMessageUpdated({
            userId,
            sessionId,
            messageId: assistantMessageId,
            updates: {
              content: fullContent,
              status: "streaming",
            },
          });
        },

        onToolCall: async (
          toolCallId: string,
          toolName: string,
          args: unknown,
        ) => {
          // Clear timeout when tool is called
          const timeoutId = activeBotResponses.get(assistantMessageId);
          if (timeoutId) {
            clearTimeout(timeoutId);
            activeBotResponses.delete(assistantMessageId);
          }

          // Emit tool call started event (UI-only, not persisted to DB)
          events.emitToolCallStarted({
            userId,
            sessionId,
            toolCallId,
            toolName,
          });
        },

        onToolResult: async (
          toolCallId: string,
          toolName: string,
          result: unknown,
        ) => {
          // Create tool message in database (only when we have the result)
          const toolMessage = await db.chatMessage.create({
            data: {
              sessionId,
              role: "tool",
              content: JSON.stringify(result),
              status: "finished",
              toolCallId,
              toolName,
            },
          });

          // Emit tool message created event
          events.emitChatMessageCreated({
            userId,
            sessionId,
            message: {
              id: toolMessage.id,
              role: "tool",
              content: toolMessage.content,
              status: "finished",
              toolCallId,
              toolName,
              createdAt: toolMessage.createdAt.toISOString(),
              updatedAt: toolMessage.updatedAt.toISOString(),
            },
          });
        },

        onFinished: async (fullContent: string) => {
          // Clear timeout
          const timeoutId = activeBotResponses.get(assistantMessageId);
          if (timeoutId) {
            clearTimeout(timeoutId);
            activeBotResponses.delete(assistantMessageId);
          }

          // Update message in database
          await db.chatMessage.update({
            where: { id: assistantMessageId },
            data: {
              content: fullContent,
              status: "finished",
            },
          });

          // Emit update event
          events.emitChatMessageUpdated({
            userId,
            sessionId,
            messageId: assistantMessageId,
            updates: {
              content: fullContent,
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
          const timeoutId = activeBotResponses.get(assistantMessageId);
          if (timeoutId) {
            clearTimeout(timeoutId);
            activeBotResponses.delete(assistantMessageId);
          }

          // Update message in database
          await db.chatMessage.update({
            where: { id: assistantMessageId },
            data: {
              status: "error",
              errorMessage: error.message,
            },
          });

          // Emit update event
          events.emitChatMessageUpdated({
            userId,
            sessionId,
            messageId: assistantMessageId,
            updates: {
              status: "error",
              errorMessage: error.message,
            },
          });
        },
      },
    );
  } catch (error) {
    console.error("Agent response error:", error);

    // Clear timeout
    const timeoutId = activeBotResponses.get(assistantMessageId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      activeBotResponses.delete(assistantMessageId);
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    await db.chatMessage.update({
      where: { id: assistantMessageId },
      data: {
        status: "error",
        errorMessage,
      },
    });

    events.emitChatMessageUpdated({
      userId,
      sessionId,
      messageId: assistantMessageId,
      updates: {
        status: "error",
        errorMessage,
      },
    });
  }
}

export default app;
