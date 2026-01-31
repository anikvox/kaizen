import express, { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Opik } from 'opik';

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Initialize Opik for tracing
const opik = new Opik();

// Middleware to verify device token
const verifyDeviceToken = async (req: Request, res: Response, next: any) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.substring(7);

  try {
    const deviceToken = await prisma.deviceToken.findUnique({
      where: { token },
      include: { user: true }
    });

    if (!deviceToken) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    // Update last used timestamp
    await prisma.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() }
    });

    // Attach user to request
    (req as any).user = deviceToken.user;
    next();
  } catch (error) {
    console.error('Token verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Create a new chat session
router.post('/sessions', verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { title } = req.body;

    const session = await prisma.chatSession.create({
      data: {
        userId,
        title: title || 'New Chat'
      }
    });

    res.json(session);
  } catch (error) {
    console.error('Create session error:', error);
    res.status(500).json({ error: 'Failed to create chat session' });
  }
});

// Get all chat sessions for user
router.get('/sessions', verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;

    const sessions = await prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    res.json(sessions);
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ error: 'Failed to fetch chat sessions' });
  }
});

// Get messages for a specific chat session
router.get('/sessions/:sessionId/messages', verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const sessionId = req.params.sessionId as string;

    // Verify session belongs to user
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId },
      orderBy: { createdAt: 'asc' }
    });

    res.json(messages);
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// Send a message and get AI response (streaming)
router.post('/sessions/:sessionId/messages', verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const sessionId = req.params.sessionId as string;
    const { content, context } = req.body;

    // Verify session belongs to user
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    // Save user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatSessionId: sessionId,
        role: 'user',
        content
      }
    });

    // Set up SSE for streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get conversation history for context
    const previousMessages = await prisma.chatMessage.findMany({
      where: { chatSessionId: sessionId as string },
      orderBy: { createdAt: 'asc' },
      take: 10 // Last 10 messages for context
    });

    // Prepare Gemini prompt with context
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Build conversation history
    const history = previousMessages.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    // Start Opik trace
    const trace = opik.trace({
      name: 'chat_completion',
      input: { prompt: content },
      metadata: {
        userId,
        sessionId,
        model: 'gemini-pro'
      }
    });

    try {
      const chat = model.startChat({ history });
      const result = await chat.sendMessageStream(content);

      let fullResponse = '';

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
          role: 'assistant',
          content: fullResponse,
          metadata: {
            userId,
            model: 'gemini-pro'
          }
        }
      });

      // End trace
      trace.end();

      // Send completion signal
      res.write(`data: ${JSON.stringify({ done: true, messageId: assistantMessage.id })}\n\n`);
      res.end();

    } catch (aiError) {
      console.error('AI generation error:', aiError);
      trace.end();
      res.write(`data: ${JSON.stringify({ error: 'AI generation failed' })}\n\n`);
      res.end();
    }

  } catch (error) {
    console.error('Send message error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send message' });
    }
  }
});

// Delete a chat session
router.delete('/sessions/:sessionId', verifyDeviceToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const sessionId = req.params.sessionId as string;

    // Verify session belongs to user
    const session = await prisma.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    await prisma.chatSession.delete({
      where: { id: sessionId as string }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Failed to delete chat session' });
  }
});

export default router;
