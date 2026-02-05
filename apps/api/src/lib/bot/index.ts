export type { BotInterface, BotMessage, BotCallbacks } from "./interface.js";
export { FakeBot, fakeBot } from "./fake-bot.js";
export { GeminiBot, geminiBot } from "./gemini-bot.js";

import { env } from "../env.js";
import { fakeBot } from "./fake-bot.js";
import { geminiBot } from "./gemini-bot.js";
import type { BotInterface } from "./interface.js";

// Select bot based on environment
// Use Gemini if API key is available, otherwise fall back to fake bot
function selectBot(): BotInterface {
  if (env.geminiApiKey) {
    return geminiBot;
  }
  console.warn("GEMINI_API_KEY not set, using fake bot");
  return fakeBot;
}

// Default bot to use in the application
export const bot = selectBot();
