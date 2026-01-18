import express, { Request, Response } from "express";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import routes from "./routes";
import { prisma } from "./lib/prisma";
import { startFocusScheduler, stopFocusScheduler } from "./lib/scheduler";
import { opikClient, flushTraces } from "./lib/opik";

const app = express();
const port = process.env.PORT || 60092;

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map(origin => origin.trim())
  : ["http://localhost:60091"];

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(express.json());

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

// Mount API routes
app.use("/api", routes);

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

  // Start the background focus computation scheduler
  startFocusScheduler();
});

// Graceful shutdown - stop scheduler, flush traces, and disconnect Prisma
async function gracefulShutdown() {
  console.log("Shutting down gracefully...");
  stopFocusScheduler();
  // Flush both the tracked Gemini client and the shared Opik client
  await Promise.all([trackedGenAI.flush(), flushTraces()]);
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
