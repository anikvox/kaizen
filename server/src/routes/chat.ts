import express, { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { Opik } from "opik";
import multer from "multer";
import fs from "fs";
import path from "path";

import { requireAuth, AuthRequest } from "../middleware/auth";
import { fetchAttentionData } from "../lib/inference";

const router = express.Router();
const prisma = new PrismaClient();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
const genAIFiles = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 20 * 1024 * 1024 }
});

const opik = new Opik();

// Serve uploaded files
router.get("/uploads/:filename", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const filename = Array.isArray(req.params.filename) ? req.params.filename[0] : req.params.filename;
    const filePath = path.join(process.cwd(), "uploads", filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error("[File serve] File not found:", filePath);
      return res.status(404).json({ error: "File not found" });
    }
    
    console.log("[File serve] Serving file:", filePath);
    
    // Try to determine content type from file signature
    const buffer = fs.readFileSync(filePath);
    let contentType = 'application/octet-stream';
    
    // Check file signature (magic numbers)
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      contentType = 'image/jpeg';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      contentType = 'image/png';
    } else if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      contentType = 'image/gif';
    } else if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      contentType = 'image/webp';
    }
    
    res.setHeader('Content-Type', contentType);
    res.sendFile(filePath);
  } catch (error) {
    console.error("Error serving file:", error);
    res.status(500).json({ error: "Failed to serve file" });
  }
});

// Helper to parse reflection range from context string (e.g., "Reflection Range: 30m")
function parseReflectionRange(context?: string): number {
  if (!context) return 30 * 60 * 1000; // Default: 30 minutes

  const match = context.match(/Reflection Range:\s*(\d+)(m|h|d)/i);
  if (!match) return 30 * 60 * 1000;

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'm':
      return value * 60 * 1000; // minutes to milliseconds
    case 'h':
      return value * 60 * 60 * 1000; // hours to milliseconds
    case 'd':
      return value * 24 * 60 * 60 * 1000; // days to milliseconds
    default:
      return 30 * 60 * 1000;
  }
}

// Helper to format attention data for AI context
function formatAttentionData(attentionData: Awaited<ReturnType<typeof fetchAttentionData>>): string {
  const { websiteVisits, textActivities, imageActivities, youtubeActivities, audioActivities } = attentionData;

  let formatted = "\n\n## User's Recent Activity:\n";

  // Website visits
  if (websiteVisits.length > 0) {
    formatted += "\n### Websites Visited:\n";
    websiteVisits.slice(0, 10).forEach(visit => {
      const activeMinutes = Math.round(visit.activeTime / 60000);
      formatted += `- ${visit.title} (${visit.url})\n  Active time: ${activeMinutes} minutes\n`;
    });
  }

  // Text reading activities
  if (textActivities.length > 0) {
    formatted += "\n### Reading Activity:\n";
    textActivities.slice(0, 10).forEach(activity => {
      const preview = activity.text.slice(0, 100) + (activity.text.length > 100 ? '...' : '');
      formatted += `- Read on ${activity.url}\n  "${preview}"\n`;
    });
  }

  // Image viewing activities
  if (imageActivities.length > 0) {
    formatted += "\n### Images Viewed:\n";
    imageActivities.slice(0, 10).forEach(activity => {
      formatted += `- ${activity.title || activity.alt} on ${activity.url}\n`;
      if (activity.caption) {
        formatted += `  Caption: ${activity.caption.slice(0, 100)}\n`;
      }
    });
  }

  // YouTube videos
  if (youtubeActivities.length > 0) {
    formatted += "\n### Videos Watched:\n";
    youtubeActivities.slice(0, 10).forEach(activity => {
      const watchMinutes = activity.activeWatchTime ? Math.round(activity.activeWatchTime / 60) : 0;
      formatted += `- "${activity.title}" by ${activity.channelName}\n`;
      if (watchMinutes > 0) {
        formatted += `  Watch time: ${watchMinutes} minutes\n`;
      }
    });
  }

  // Audio listening
  if (audioActivities.length > 0) {
    formatted += "\n### Audio Content:\n";
    audioActivities.slice(0, 10).forEach(activity => {
      const durationMinutes = Math.round(activity.duration / 60);
      formatted += `- ${activity.title}\n  Duration: ${durationMinutes} minutes\n`;
      if (activity.summary) {
        formatted += `  Summary: ${activity.summary.slice(0, 100)}\n`;
      }
    });
  }

  // Summary stats
  const totalActivities = websiteVisits.length + textActivities.length +
                          imageActivities.length + youtubeActivities.length +
                          audioActivities.length;

  if (totalActivities === 0) {
    formatted += "\nNo recent activity data available in this time range.\n";
  } else {
    formatted += `\n### Activity Summary:\n`;
    formatted += `- Total website visits: ${websiteVisits.length}\n`;
    formatted += `- Reading activities: ${textActivities.length}\n`;
    formatted += `- Images viewed: ${imageActivities.length}\n`;
    formatted += `- Videos watched: ${youtubeActivities.length}\n`;
    formatted += `- Audio content: ${audioActivities.length}\n`;
  }

  return formatted;
}

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

    console.log("Creating session for user:", userId, "with title:", title);

    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: title || "New Chat",
      },
    });

    console.log("Session created successfully:", session.id);
    res.json(session);
  } catch (error) {
    console.error("Create session error:", error);
    if (error instanceof Error) {
      console.error("Error details:", error.message, error.stack);
    }
    res.status(500).json({ error: "Failed to create chat session", details: error instanceof Error ? error.message : 'Unknown error' });
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

      console.log("[GET messages] Fetched messages for session:", sessionId);
      console.log("[GET messages] First message:", messages[0]);
      console.log("[GET messages] First message metadata:", JSON.stringify(messages[0]?.metadata, null, 2));

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
          metadata: {
            hasImage: !!files?.image?.[0],
            hasAudio: !!files?.audio?.[0],
            imageFileName: files?.image?.[0]?.originalname,
            audioFileName: files?.audio?.[0]?.originalname,
            imagePath: files?.image?.[0]?.filename, // Use filename instead of path
            audioPath: files?.audio?.[0]?.filename,
            imageMimeType: files?.image?.[0]?.mimetype,
            audioMimeType: files?.audio?.[0]?.mimetype
          }
        },
      });
      
      console.log("Created user message with metadata:", {
        id: userMessage.id,
        metadata: userMessage.metadata,
        hasImage: !!files?.image?.[0],
        imagePath: files?.image?.[0]?.path
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const previousMessages = await prisma.chatMessage.findMany({
        where: { chatSessionId: sessionId as string },
        orderBy: { createdAt: "asc" },
        take: 10,
      });

      // Parse reflection range and fetch attention data
      const reflectionRangeMs = parseReflectionRange(context);
      const windowEnd = new Date();
      const windowStart = new Date(windowEnd.getTime() - reflectionRangeMs);

      console.log("[Chat] Fetching attention data:", {
        reflectionRangeMs,
        windowStart,
        windowEnd,
        userId
      });

      let attentionContext = "";
      try {
        const attentionData = await fetchAttentionData(windowStart, windowEnd, userId);
        attentionContext = formatAttentionData(attentionData);
        console.log("[Chat] Fetched attention data successfully");
      } catch (error) {
        console.error("[Chat] Error fetching attention data:", error);
        attentionContext = "\n\nNo recent activity data available.";
      }

      const systemInstruction = `You are Kaizen AI, an advanced productivity assistant.
        You have access to the user's activity and focus data.

        PRINCIPLES:
        1. Be concise and direct.
        2. Use the provided context to offer personalized insights.
        3. Citations: If referring to specific websites, include their URLs.
        4. Focus: Help the user stay in the flow and improve their productivity.
        5. When discussing the user's activities, reference specific websites, articles, videos, or content they've engaged with.
        6. Provide actionable insights based on their actual browsing and attention patterns.

        ${attentionContext}`;

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
          console.log("Processing image file:", {
            name: imageFile.originalname,
            mimetype: imageFile.mimetype,
            size: imageFile.size
          });
          
          try {
            const uploadedImage = await genAIFiles.files.upload({
              file: imageFile.path,
              config: { mimeType: imageFile.mimetype },
            });
            console.log("Image uploaded successfully:", uploadedImage.uri);
            
            if (uploadedImage.name) {
              let file = await genAIFiles.files.get({ name: uploadedImage.name });
              while (file.state === "PROCESSING") {
                await new Promise(resolve => setTimeout(resolve, 1000));
                file = await genAIFiles.files.get({ name: uploadedImage.name });
              }
              
              if (file.state === "FAILED") {
                throw new Error("Image processing failed");
              }
            }
            
            uploadedFiles.push({
              fileData: { fileUri: uploadedImage.uri, mimeType: imageFile.mimetype }
            });
            // Keep the file for serving via /api/chat/uploads/:filename
            // fs.unlinkSync(imageFile.path);
          } catch (imageError) {
            console.error("Image upload failed:", imageError);
            // Keep the file even on error so it can be served
            // fs.unlinkSync(imageFile.path);
            throw new Error(`Image upload failed: ${imageError instanceof Error ? imageError.message : 'Unknown error'}`);
          }
        }

        if (files?.audio?.[0]) {
          const audioFile = files.audio[0];
          console.log("Processing audio file:", {
            name: audioFile.originalname,
            mimetype: audioFile.mimetype,
            size: audioFile.size
          });
          
          try {
            const uploadedAudio = await genAIFiles.files.upload({
              file: audioFile.path,
              config: { mimeType: audioFile.mimetype },
            });
            console.log("Audio uploaded successfully:", uploadedAudio.uri);
            
            if (uploadedAudio.name) {
              let file = await genAIFiles.files.get({ name: uploadedAudio.name });
              while (file.state === "PROCESSING") {
                await new Promise(resolve => setTimeout(resolve, 1000));
                file = await genAIFiles.files.get({ name: uploadedAudio.name });
              }
              
              if (file.state === "FAILED") {
                throw new Error("Audio processing failed");
              }
            }
            
            uploadedFiles.push({
              fileData: { fileUri: uploadedAudio.uri, mimeType: audioFile.mimetype }
            });
            // Keep the file for serving via /api/chat/uploads/:filename
            // fs.unlinkSync(audioFile.path);
          } catch (audioError) {
            console.error("Audio upload failed:", audioError);
            // Keep the file even on error so it can be served
            // fs.unlinkSync(audioFile.path);
            throw new Error(`Audio upload failed: ${audioError instanceof Error ? audioError.message : 'Unknown error'}`);
          }
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
            data: { 
              title: newTitle,
              updatedAt: new Date()
            }
          });
          res.write(`data: ${JSON.stringify({ type: 'title_update', title: newTitle })}\n\n`);
        } else {
          // Update session to refresh updatedAt timestamp
          await prisma.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() }
          });
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
