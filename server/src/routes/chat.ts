import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Opik } from "opik";

import { requireAuth, AuthRequest } from "../middleware/auth";

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Initialize Opik for tracing
const opik = new Opik();

// Helper to generate a chat title
async function generateChatTitle(userMessage: string, assistantResponse: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Based on this conversation, generate a 3-4 word title that captures the main topic.
    
    User: ${userMessage}
    Assistant: ${assistantResponse}
    
    Respond with ONLY the title string, no quotes, no extra words.`;

    const result = await model.generateContent(prompt);
    return result.response.text().trim().replace(/^["']|["']$/g, "").slice(0, 50);
  } catch (error) {
    console.error("Title generation error:", error);
    return "New Conversation";
  }
}

// Create a new chat session
router.post("/sessions", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;
    const { title } = req.body;

    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: title || "New Chat",
      },
    });

    res.json(session);
  } catch (error) {
    console.error("Create session error:", error);
    res.status(500).json({ error: "Failed to create chat session" });
  }
});

// Get all chat sessions for user
router.get("/sessions", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.auth!.userId;

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
        },
      },
    });

    res.json(sessions);
  } catch (error) {
    console.error("Get sessions error:", error);
    res.status(500).json({ error: "Failed to fetch chat sessions" });
  }
});

// Get messages for a specific chat session
router.get(
  "/sessions/:sessionId/messages",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.auth!.userId;
      const sessionId = req.params.sessionId as string;

      // Verify session belongs to user
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }

      const messages = await prisma.chatMessage.findMany({
        where: { chatSessionId: sessionId },
        orderBy: { createdAt: "asc" },
      });

      res.json(messages);
    } catch (error) {
      console.error("Get messages error:", error);
      res.status(500).json({ error: "Failed to fetch messages" });
    }
  }
);

// Send a message and get AI response (streaming)
router.post(
  "/sessions/:sessionId/messages",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.auth!.userId;
      const sessionId = req.params.sessionId as string;
      const { content, context } = req.body;

      // Verify session belongs to user
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }

      // Save user message
      const userMessage = await prisma.chatMessage.create({
        data: {
          chatSessionId: sessionId,
          role: "user",
          content,
        },
      });

      // Set up SSE for streaming response
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Get conversation history for context
      const previousMessages = await prisma.chatMessage.findMany({
        where: { chatSessionId: sessionId as string },
        orderBy: { createdAt: "asc" },
        take: 10, // Last 10 messages for context
      });

      // Prepare Gemini prompt with context
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction: `You are Kaizen AI, an advanced productivity assistant.
        You have access to the user's activity and focus data.
        
        PRINCIPLES:
        1. Be concise and direct.
        2. Use the provided context to offer personalized insights.
        3. Citations: If referring to specific websites, include their URLs.
        4. Focus: Help the user stay in the flow and improve their productivity.
        
        User Context: ${context || "No specific activity context provided yet."}
        `
      });

      // Build conversation history
      const history = previousMessages.slice(0, -1).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      // Start Opik trace
      const trace = opik.trace({
        name: "chat_completion",
        input: { prompt: content, context },
        metadata: {
          userId,
          sessionId,
          model: "gemini-2.5-flash",
        },
      });

      try {
        const chat = model.startChat({ history });
        const result = await chat.sendMessageStream(content);

        let fullResponse = "";

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullResponse += chunkText;

          // Send chunk to client
          res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }

        // Save assistant message
        const assistantMessage = await prisma.chatMessage.create({
          data: {
            chatSessionId: sessionId as string,
            role: "assistant",
            content: fullResponse,
            metadata: {
              userId,
              model: "gemini-2.5-flash",
            },
          },
        });

        // Trigger title update if it's still 'New Chat'
        if (session.title === "New Chat") {
          const newTitle = await generateChatTitle(content, fullResponse);
          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { title: newTitle }
          });
          // Notify client about title update
          res.write(`data: ${JSON.stringify({ type: 'title_update', title: newTitle })}\n\n`);
        }

        // End trace
        trace.end();

        // Send completion signal
        res.write(
          `data: ${JSON.stringify({
            done: true,
            messageId: assistantMessage.id,
          })}\n\n`
        );
        res.end();
      } catch (aiError) {
        console.error("AI generation error:", aiError);
        trace.end();
        res.write(
          `data: ${JSON.stringify({ error: "AI generation failed" })}\n\n`
        );
        res.end();
      }
    } catch (error) {
      console.error("Send message error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to send message" });
      }
    }
  }
);

// Delete a chat session
router.delete(
  "/sessions/:sessionId",
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.auth!.userId;
      const sessionId = req.params.sessionId as string;

      // Verify session belongs to user
      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }

      await prisma.chatSession.delete({
        where: { id: sessionId as string },
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Delete session error:", error);
      res.status(500).json({ error: "Failed to delete chat session" });
    }
  }
);

export default router;
