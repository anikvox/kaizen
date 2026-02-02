import express, { Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth, AuthRequest } from "../middleware/auth";

const router = express.Router();
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// AI Write - Generate creative text based on a prompt
router.post("/write", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const systemPrompt = `You are a creative writing assistant. Generate an interesting, engaging prompt or message based on the user's input. Be creative, concise, and helpful. Return only the generated text without any preamble or explanation.`;
    
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Generate a creative prompt based on: ${prompt}` }
    ]);
    
    const text = result.response.text();
    
    res.json({ text });
  } catch (error) {
    console.error("AI write error:", error);
    res.status(500).json({ error: "Failed to generate text" });
  }
});

// AI Rewrite - Improve and rewrite existing text
router.post("/rewrite", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { text, context } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const systemPrompt = `You are a professional writing assistant. Rewrite the given text to be clearer, more concise, and more engaging while preserving the original meaning and intent. Return only the rewritten text without any preamble or explanation.`;
    
    const contextStr = context ? `\n\nContext: ${context}` : "";
    
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Rewrite this text: "${text}"${contextStr}` }
    ]);
    
    const rewrittenText = result.response.text();
    
    res.json({ text: rewrittenText });
  } catch (error) {
    console.error("AI rewrite error:", error);
    res.status(500).json({ error: "Failed to rewrite text" });
  }
});

// AI Summarize - Create a summary of text
router.post("/summarize", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ error: "Text is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const systemPrompt = `You are a summarization assistant. Create a concise, clear summary of the given text. Return only the summary without any preamble or explanation.`;
    
    const result = await model.generateContent([
      { text: systemPrompt },
      { text: `Summarize this text: "${text}"` }
    ]);
    
    const summary = result.response.text();
    
    res.json({ text: summary });
  } catch (error) {
    console.error("AI summarize error:", error);
    res.status(500).json({ error: "Failed to summarize text" });
  }
});

// AI Prompt - General purpose AI prompt
router.post("/prompt", requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    
    res.json({ text });
  } catch (error) {
    console.error("AI prompt error:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

export default router;
