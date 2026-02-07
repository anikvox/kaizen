export type { BotInterface, BotMessage, BotMediaPart, BotCallbacks } from "./interface.js";
export { FakeBot, fakeBot } from "./fake-bot.js";
export { LLMBot, createLLMBot, type LLMBotOptions } from "./llm-bot.js";

import { env } from "../env.js";
import { fakeBot } from "./fake-bot.js";
import { LLMBot } from "./llm-bot.js";
import type { BotInterface } from "./interface.js";

// Select default bot based on environment
// Use LLMBot (with system Gemini) if API key is available, otherwise fall back to fake bot
function selectDefaultBot(): BotInterface {
  if (env.geminiApiKey) {
    return new LLMBot(); // Uses system default (Gemini)
  }
  console.warn("GEMINI_API_KEY not set, using fake bot");
  return fakeBot;
}

// Default bot for simple use cases (no user settings)
export const bot = selectDefaultBot();
