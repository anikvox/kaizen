export { db } from "./db.js";
export { env } from "./env.js";
export { events } from "./events.js";

// Attention data exports
export {
  formatDuration,
  extractDomain,
  fetchRawAttentionData,
  aggregateAttentionData,
  getAttentionData,
} from "./attention.js";
export type {
  AttentionTimeRange,
  RawAttentionData,
  AttentionSummary,
  AttentionDataResponse,
} from "./attention.js";

// Bot exports
export { bot, fakeBot, geminiBot, GeminiBot, FakeBot, LLMBot, createLLMBot } from "./bot/index.js";
export type { BotInterface, BotMessage, BotMediaPart, BotCallbacks, LLMBotOptions } from "./bot/index.js";

// LLM exports
export {
  // Service
  LLMService,
  createLLMService,
  getSystemProvider,
  // Providers
  GeminiProvider,
  AnthropicProvider,
  OpenAIProvider,
  // Models
  GEMINI_MODELS,
  ANTHROPIC_MODELS,
  OPENAI_MODELS,
  ALL_MODELS,
  DEFAULT_MODELS,
  SYSTEM_DEFAULT_PROVIDER,
  SYSTEM_DEFAULT_MODEL,
  getModelsForProvider,
  isValidModel,
  getDefaultModel,
  // Encryption
  encrypt,
  decrypt,
  decryptApiKey,
  // Model fetcher (dynamic)
  fetchGeminiModels,
  fetchOpenAIModels,
  fetchAnthropicModels,
  fetchModelsForProvider,
  // Prompts
  SYSTEM_PROMPTS,
  generateChatTitle,
  serializeAttentionForLLM,
} from "./llm/index.js";

export type {
  LLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMMessage,
  LLMMediaPart,
  LLMStreamCallbacks,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  ModelInfo,
} from "./llm/index.js";
