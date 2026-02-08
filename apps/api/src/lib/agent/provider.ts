/**
 * Shared AI provider creation for agents.
 * Supports Gemini, Anthropic, and OpenAI based on user settings.
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { UserSettings } from "@prisma/client";
import { decryptApiKey } from "../llm/encryption.js";
import { SYSTEM_DEFAULT_MODEL } from "../llm/models.js";
import { env } from "../env.js";

export type AgentProvider =
  | ReturnType<typeof createGoogleGenerativeAI>
  | ReturnType<typeof createAnthropic>
  | ReturnType<typeof createOpenAI>;

/**
 * Create an AI provider instance for Vercel AI SDK based on user settings.
 * Falls back to system Gemini if no user provider is configured.
 */
export function createAgentProvider(
  settings: UserSettings | null,
): AgentProvider {
  // Check user's configured provider first
  if (settings?.llmProvider) {
    const providerType = settings.llmProvider;

    switch (providerType) {
      case "gemini": {
        const apiKey = decryptApiKey(settings.geminiApiKeyEncrypted);
        if (apiKey) {
          return createGoogleGenerativeAI({ apiKey });
        }
        break;
      }
      case "anthropic": {
        const apiKey = decryptApiKey(settings.anthropicApiKeyEncrypted);
        if (apiKey) {
          return createAnthropic({ apiKey });
        }
        break;
      }
      case "openai": {
        const apiKey = decryptApiKey(settings.openaiApiKeyEncrypted);
        if (apiKey) {
          return createOpenAI({ apiKey });
        }
        break;
      }
    }
  }

  // Fall back to system Gemini
  if (!env.geminiApiKey) {
    throw new Error("No LLM provider available");
  }
  return createGoogleGenerativeAI({ apiKey: env.geminiApiKey });
}

/**
 * Get the model ID based on user settings.
 * Falls back to provider defaults if not specified.
 */
export function getAgentModelId(settings: UserSettings | null): string {
  if (settings?.llmModel) {
    return settings.llmModel;
  }

  if (settings?.llmProvider) {
    switch (settings.llmProvider) {
      case "gemini":
        return "gemini-2.0-flash";
      case "anthropic":
        return "claude-3-5-haiku-latest";
      case "openai":
        return "gpt-4o-mini";
    }
  }

  return SYSTEM_DEFAULT_MODEL;
}
