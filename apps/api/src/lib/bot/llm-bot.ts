import type { UserSettings } from "@prisma/client";
import type { BotInterface, BotMessage, BotCallbacks } from "./interface.js";
import { createLLMService, SYSTEM_PROMPTS } from "../llm/index.js";

/**
 * LLM-powered bot that uses the unified LLM service.
 * Supports Gemini, Anthropic, and OpenAI based on user settings.
 */
export class LLMBot implements BotInterface {
  private settings: UserSettings | null;

  constructor(settings?: UserSettings | null) {
    this.settings = settings || null;
  }

  async generateResponse(
    messages: BotMessage[],
    callbacks: BotCallbacks
  ): Promise<void> {
    const llmService = createLLMService(this.settings);
    const provider = llmService.getProvider();

    try {
      // Signal typing state
      await callbacks.onTyping();

      // Convert bot messages to LLM format
      const llmMessages = messages.map((msg) => ({
        role: msg.role === "user" ? "user" as const : "assistant" as const,
        content: msg.content,
      }));

      // Stream the response
      await provider.stream({
        messages: llmMessages,
        systemPrompt: SYSTEM_PROMPTS.chat,
        callbacks: {
          onToken: async (token, fullContent) => {
            await callbacks.onChunk(token, fullContent);
          },
          onFinished: async (fullContent) => {
            await callbacks.onFinished(fullContent);
          },
          onError: async (error) => {
            await callbacks.onError(error);
          },
        },
      });

      // Flush traces
      await provider.flush();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await callbacks.onError(err);
    }
  }
}

/**
 * Create an LLM bot for a user with their settings.
 */
export function createLLMBot(settings?: UserSettings | null): LLMBot {
  return new LLMBot(settings);
}
