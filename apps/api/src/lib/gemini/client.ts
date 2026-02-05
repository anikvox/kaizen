import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import { env } from "../env.js";

// Type for the tracked client with Opik extension
type TrackedGoogleGenAI = GoogleGenAI & { flush(): Promise<void> };

// Gemini model configuration
export const GEMINI_MODELS = {
  flash: "gemini-2.5-flash-lite",
  pro: "gemini-2.5-pro",
} as const;

export type GeminiModel = (typeof GEMINI_MODELS)[keyof typeof GEMINI_MODELS];

// Default model for chat
export const DEFAULT_CHAT_MODEL = GEMINI_MODELS.flash;

// Create tracked Gemini client (lazy initialization)
let _gemini: TrackedGoogleGenAI | null = null;

function createGeminiClient(): TrackedGoogleGenAI {
  if (!env.geminiApiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const baseClient = new GoogleGenAI({
    apiKey: env.geminiApiKey,
  });

  return trackGemini(baseClient, {
    traceMetadata: {
      tags: ["kaizen"],
      project: env.opikProjectName,
    },
  }) as TrackedGoogleGenAI;
}

// Get or create the Gemini client
export function getGeminiClient() {
  if (!_gemini) {
    _gemini = createGeminiClient();
  }
  return _gemini;
}

// Convenience getter that throws if not initialized
export const gemini = {
  get models() {
    return getGeminiClient().models;
  },
  async flush() {
    if (_gemini) {
      await _gemini.flush();
    }
  },
};

// Flush traces - call before process exits or after important operations
export async function flushTraces(): Promise<void> {
  await gemini.flush();
}

// Check if Gemini is available
export function isGeminiAvailable(): boolean {
  return Boolean(env.geminiApiKey);
}

// Re-export types that might be useful
export type { GenerateContentResponse } from "@google/genai";
