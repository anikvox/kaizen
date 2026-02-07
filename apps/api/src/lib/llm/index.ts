// Interface and types
export type {
  LLMProvider,
  LLMProviderType,
  LLMProviderConfig,
  LLMMessage,
  LLMMessageContent,
  LLMTextContent,
  LLMImageContent,
  LLMMediaPart,
  LLMStreamCallbacks,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  LLMTool,
  LLMToolCall,
  LLMToolResult,
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

// System Prompts (centralized)
export {
  SYSTEM_PROMPTS,
  CHAT_SYSTEM_PROMPT,
  CHAT_AGENT_SYSTEM_PROMPT,
  TITLE_GENERATION_SYSTEM_PROMPT,
  FOCUS_ANALYSIS_SYSTEM_PROMPT,
  FOCUS_AGENT_SYSTEM_PROMPT,
  TEXT_SUMMARIZATION_SYSTEM_PROMPT,
  IMAGE_SUMMARIZATION_SYSTEM_PROMPT,
  INDIVIDUAL_IMAGE_SYSTEM_PROMPT,
  QUIZ_GENERATION_SYSTEM_PROMPT,
} from "./system-prompts.js";

// LLM Config
export { LLM_CONFIG, type LLMCallConfig, type LLMConfigKey } from "./config.js";

// Response Validators
export {
  validateYesNo,
  validateFocusItem,
  validateTitle,
  validateJson,
  validateQuizResponse,
  validateSummary,
  type JsonValidationResult,
  type QuizQuestion,
  type QuizValidationResult,
} from "./validators.js";

// Prompts (serialization utilities)
export {
  generateChatTitle,
  serializeAttentionForLLM,
  serializeAttentionCompact,
} from "./prompts.js";

// Telemetry (Opik tracing)
export {
  initTelemetry,
  shutdownTelemetry,
  startTrace,
  traceOperation,
  isTracingEnabled,
  type TraceContext,
  type SpanContext,
  type TraceOptions,
  type SpanOptions,
} from "./telemetry.js";

// Anonymizer (PII protection)
export {
  anonymizeText,
  anonymizeData,
  anonymizeInput,
  anonymizeOutput,
  addAnonymizeRules,
  clearAnonymizeRules,
} from "./anonymizer.js";

// Opik Prompt Library
export {
  getPrompt,
  getPromptWithMetadata,
  getAllLocalPrompts,
  PROMPT_NAMES,
  type PromptName,
  type PromptWithMetadata,
} from "./prompt-provider.js";
export {
  syncPromptToOpik,
  syncAllPromptsToOpik,
  isOpikPromptsEnabled,
} from "./prompts-opik.js";
