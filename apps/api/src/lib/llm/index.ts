// Interface and types
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
} from "./interface.js";

// Models
export {
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
  type ModelInfo,
} from "./models.js";

// Providers
export { GeminiProvider, AnthropicProvider, OpenAIProvider } from "./providers/index.js";

// Service
export { LLMService, createLLMService, getSystemProvider } from "./service.js";

// Encryption
export { encrypt, decrypt, decryptApiKey } from "./encryption.js";

// Model fetcher (dynamic)
export {
  fetchGeminiModels,
  fetchOpenAIModels,
  fetchAnthropicModels,
  fetchModelsForProvider,
} from "./model-fetcher.js";

// Prompts
export { SYSTEM_PROMPTS, generateChatTitle } from "./prompts.js";
