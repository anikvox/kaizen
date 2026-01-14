import "dotenv/config";
import express, { Request, Response } from "express";
import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import { Opik } from "opik";

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Initialize Opik client with API key
const opikClient = new Opik({
  apiKey: process.env.OPIK_API_KEY!,
  projectName: "kaizen",
});

// Initialize Google GenAI client
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Wrap the client with Opik tracking
const trackedGenAI = trackGemini(genAI, {
  client: opikClient,
  traceMetadata: {
    tags: ["kaizen", "gemini"],
  },
  generationName: "kaizen-message",
});

interface MessageRequest {
  message: string;
}

app.post("/message", async (req: Request<{}, {}, MessageRequest>, res: Response) => {
  const { message } = req.body;

  if (!message) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  try {
    const response = await trackedGenAI.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: message,
    });

    const responseText = response.text || "";

    // Flush traces to ensure they're sent
    await trackedGenAI.flush();

    res.json({ response: responseText });
  } catch (error) {
    console.error("Error communicating with Gemini:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Graceful shutdown - flush remaining traces
process.on("SIGTERM", async () => {
  await trackedGenAI.flush();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await trackedGenAI.flush();
  process.exit(0);
});
