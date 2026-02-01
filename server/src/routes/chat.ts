import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { Opik } from "opik";
import multer from "multer";
import fs from "fs";
import path from "path";

import { requireAuth, AuthRequest } from "../middleware/auth";

const router = express.Router();
const prisma = new PrismaClient();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const genAIFiles = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 }
});

const opik = new Opik();

// Helper to generate a chat title
async function generateChatTitle(userMessage: string, assistantResponse: string): Promise<string> {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const prompt = `Generate a concise, descriptive title (2-5 words) for this conversation that captures the main topic or question.

User: ${userMessage}
Assistant: ${assistantResponse}

Requirements:
- Be specific and descriptive
- Use title case
- No quotes or punctuation
- Focus on the key topic or action

Examples:
- "Focus Tracking Setup"
- "Productivity Tips"
- "Weekly Report Analysis"
- "API Integration Help"

Title:`;

    const result = await model.generateContent(prompt);
    const title = result.response.text().trim().replace(/^["']|["']$/g, "").slice(0, 60);
    return title || "New Chat";
  } catch (error) {
    console.error("Title generation error:", error);
    return "New Chat";
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
  (req, res, next) => {
    upload.fields([{ name: 'image', maxCount: 1 }, { name: 'audio', maxCount: 1 }])(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ error: "File upload failed" });
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.auth!.userId;
      const sessionId = req.params.sessionId as string;
      const { content, context } = req.body;
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      console.log("Received message request:", { 
        userId, 
        sessionId, 
        hasContent: !!content,
        hasContext: !!context,
        hasFiles: !!files,
        fileKeys: files ? Object.keys(files) : []
      });

      const session = await prisma.chatSession.findFirst({
        where: { id: sessionId, userId },
      });

      if (!session) {
        return res.status(404).json({ error: "Chat session not found" });
      }

      const userMessage = await prisma.chatMessage.create({
        data: {
          chatSessionId: sessionId,
          role: "user",
          content,
        },
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const previousMessages = await prisma.chatMessage.findMany({
        where: { chatSessionId: sessionId as string },
        orderBy: { createdAt: "asc" },
        take: 10,
      });

      const systemInstruction = `You are Kaizen AI, an advanced productivity assistant.
        You have access to the user's activity and focus data.
        
        PRINCIPLES:
        1. Be concise and direct.
        2. Use the provided context to offer personalized insights.
        3. Citations: If referring to specific websites, include their URLs.
        4. Focus: Help the user stay in the flow and improve their productivity.
        
        User Context: ${context || "No specific activity context provided yet."}`;

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        systemInstruction
      });

      const history = previousMessages.slice(0, -1).map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      const trace = opik.trace({
        name: "chat_completion",
        input: { prompt: content, context },
        metadata: {
          userId,
          sessionId,
          model: "gemini-2.5-flash",
          hasImage: !!files?.image,
          hasAudio: !!files?.audio,
        },
      });

      try {
        let uploadedFiles: any[] = [];
        
        if (files?.image?.[0]) {
          const imageFile = files.image[0];
          const uploadedImage = await genAIFiles.files.upload({
            file: imageFile.path,
            config: { mimeType: imageFile.mimetype },
          });
          uploadedFiles.push({
            fileData: { fileUri: uploadedImage.uri, mimeType: imageFile.mimetype }
          });
          fs.unlinkSync(imageFile.path);
        }

        if (files?.audio?.[0]) {
          const audioFile = files.audio[0];
          const uploadedAudio = await genAIFiles.files.upload({
            file: audioFile.path,
            config: { mimeType: audioFile.mimetype },
          });
          uploadedFiles.push({
            fileData: { fileUri: uploadedAudio.uri, mimeType: audioFile.mimetype }
          });
          fs.unlinkSync(audioFile.path);
        }

        const chat = model.startChat({ history });
        
        const messageParts: any[] = [];
        if (uploadedFiles.length > 0) {
          messageParts.push(...uploadedFiles);
        }
        if (content) {
          messageParts.push({ text: content });
        }
        
        const result = await chat.sendMessageStream(messageParts.length > 0 ? messageParts : content);

        let fullResponse = "";

        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          fullResponse += chunkText;
          res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
        }

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

        if (session.title === "New Chat") {
          const newTitle = await generateChatTitle(content, fullResponse);
          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { title: newTitle }
          });
          res.write(`data: ${JSON.stringify({ type: 'title_update', title: newTitle })}\n\n`);
        }

        trace.end();

        res.write(
          `data: ${JSON.stringify({
            done: true,
            messageId: assistantMessage.id,
          })}\n\n`
        );
        res.end();
      } catch (aiError) {
        console.error("AI generation error:", aiError);
        if (aiError instanceof Error) {
          console.error("Error details:", aiError.message, aiError.stack);
        }
        trace.end();
        res.write(
          `data: ${JSON.stringify({ error: "AI generation failed" })}\n\n`
        );
        res.end();
      }
    } catch (error) {
      console.error("Send message error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
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
