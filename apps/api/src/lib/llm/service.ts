import type { UserSettings } from "@prisma/client";
import type { LLMProvider, LLMProviderType } from "./interface.js";
import { GeminiProvider, AnthropicProvider, OpenAIProvider } from "./providers/index.js";
import { decryptApiKey } from "./encryption.js";
import { SYSTEM_DEFAULT_MODEL, getDefaultModel } from "./models.js";
import { env } from "../env.js";

export interface LLMServiceConfig {
  settings?: UserSettings | null;
}

/**
 * LLM Service - Resolves the appropriate LLM provider based on user settings.
 * Falls back to system Gemini if user has no custom configuration.
 */
export class LLMService {
  private settings: UserSettings | null;

  constructor(config: LLMServiceConfig = {}) {
    this.settings = config.settings || null;
  }

  /**
   * Get the LLM provider for the user.
   * Resolution order:
   * 1. User's selected provider with their API key
   * 2. System default (Gemini with system API key)
   */
  getProvider(): LLMProvider {
    // Check if user has custom LLM settings
    if (this.settings?.llmProvider) {
      const provider = this.tryCreateUserProvider();
      if (provider) {
        return provider;
      }
    }

    // Fall back to system Gemini
    return this.createSystemProvider();
  }

  /**
   * Get provider type being used.
   */
  getProviderType(): LLMProviderType {
    if (this.settings?.llmProvider) {
      const apiKey = this.getUserApiKey(this.settings.llmProvider as LLMProviderType);
      if (apiKey) {
        return this.settings.llmProvider as LLMProviderType;
      }
    }
    return "gemini";
  }

  /**
   * Get the model being used.
   */
  getModel(): string {
    const providerType = this.getProviderType();

    if (this.settings?.llmModel) {
      return this.settings.llmModel;
    }

    if (providerType === "gemini" && !this.settings?.llmProvider) {
      // System default
      return SYSTEM_DEFAULT_MODEL;
    }

    return getDefaultModel(providerType);
  }

  /**
   * Try to create a provider using user's settings and API key.
   */
  private tryCreateUserProvider(): LLMProvider | null {
    if (!this.settings?.llmProvider) return null;

    const providerType = this.settings.llmProvider as LLMProviderType;
    const apiKey = this.getUserApiKey(providerType);

    if (!apiKey) {
      console.warn(`No API key found for provider: ${providerType}, falling back to system`);
      return null;
    }

    const model = this.settings.llmModel || getDefaultModel(providerType);

    return this.createProvider(providerType, apiKey, model);
  }

  /**
   * Create the system default provider (Gemini with system API key).
   */
  private createSystemProvider(): LLMProvider {
    if (!env.geminiApiKey) {
      throw new Error("System GEMINI_API_KEY is not configured");
    }

    return new GeminiProvider({
      apiKey: env.geminiApiKey,
      model: SYSTEM_DEFAULT_MODEL,
    });
  }

  /**
   * Get decrypted API key for a provider from user settings.
   */
  private getUserApiKey(providerType: LLMProviderType): string | null {
    if (!this.settings) return null;

    switch (providerType) {
      case "gemini":
        return decryptApiKey(this.settings.geminiApiKeyEncrypted);
      case "anthropic":
        return decryptApiKey(this.settings.anthropicApiKeyEncrypted);
      case "openai":
        return decryptApiKey(this.settings.openaiApiKeyEncrypted);
      default:
        return null;
    }
  }

  /**
   * Create a provider instance.
   */
  private createProvider(
    providerType: LLMProviderType,
    apiKey: string,
    model: string
  ): LLMProvider {
    const config = { apiKey, model };

    switch (providerType) {
      case "gemini":
        return new GeminiProvider(config);
      case "anthropic":
        return new AnthropicProvider(config);
      case "openai":
        return new OpenAIProvider(config);
      default:
        throw new Error(`Unknown provider type: ${providerType}`);
    }
  }
}

/**
 * Create an LLM service for a user.
 */
export function createLLMService(settings?: UserSettings | null): LLMService {
  return new LLMService({ settings });
}

/**
 * Get the system default LLM provider (Gemini with system API key).
 * Use this when user settings are not needed/available.
 */
export function getSystemProvider(): LLMProvider {
  return new LLMService().getProvider();
}
