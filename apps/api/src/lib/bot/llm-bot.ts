import type { UserSettings } from "@prisma/client";
import type { BotInterface, BotMessage, BotCallbacks, BotMediaPart } from "./interface.js";
import { createLLMService, SYSTEM_PROMPTS } from "../llm/index.js";
import type { LLMMediaPart } from "../llm/index.js";

export interface LLMBotOptions {
  settings?: UserSettings | null;
  systemPrompt?: string;
}

/**
 * LLM-powered bot that uses the unified LLM service.
 * Supports Gemini, Anthropic, and OpenAI based on user settings.
 */
export class LLMBot implements BotInterface {
  private settings: UserSettings | null;
  private systemPrompt: string;

  constructor(options?: LLMBotOptions) {
    this.settings = options?.settings || null;
    this.systemPrompt = options?.systemPrompt || SYSTEM_PROMPTS.chat;
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
        systemPrompt: this.systemPrompt,
        callbacks: {
          onToken: async (token, fullContent) => {
            await callbacks.onChunk(token, fullContent);
          },
          onMedia: callbacks.onMedia
            ? async (media: LLMMediaPart) => {
                const botMedia: BotMediaPart = {
                  type: media.type,
                  mimeType: media.mimeType,
                  data: media.data,
                };
                await callbacks.onMedia!(botMedia);
              }
            : undefined,
          onFinished: async (fullContent, media) => {
            const botMedia = media?.map((m): BotMediaPart => ({
              type: m.type,
              mimeType: m.mimeType,
              data: m.data,
            }));
            await callbacks.onFinished(fullContent, botMedia);
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
 * Create an LLM bot for a user with their settings and optional custom system prompt.
 */
export function createLLMBot(options?: LLMBotOptions): LLMBot {
  return new LLMBot(options);
}
