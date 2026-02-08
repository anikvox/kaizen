import type { LLMProviderType } from "./interface.js";

export interface ModelInfo {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
}

export const GEMINI_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    description: "Fast and efficient, great for most tasks",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Balanced speed and capability",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    description: "Most capable Gemini model",
    contextWindow: 1000000,
    maxOutputTokens: 8192,
  },
];

export const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    description:
      "Latest Sonnet model, excellent balance of speed and intelligence",
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  {
    id: "claude-3-5-haiku-20241022",
    name: "Claude 3.5 Haiku",
    description: "Fast and efficient for simpler tasks",
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    name: "Claude 3.5 Sonnet",
    description: "Previous generation Sonnet, still highly capable",
    contextWindow: 200000,
    maxOutputTokens: 8192,
  },
  {
    id: "claude-3-opus-20240229",
    name: "Claude 3 Opus",
    description: "Most powerful for complex reasoning",
    contextWindow: 200000,
    maxOutputTokens: 4096,
  },
];

export const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    description: "Most capable GPT-4 model with vision",
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    description: "Smaller, faster, and more affordable",
    contextWindow: 128000,
    maxOutputTokens: 16384,
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    description: "Previous generation, highly capable",
    contextWindow: 128000,
    maxOutputTokens: 4096,
  },
  {
    id: "o1",
    name: "o1",
    description: "Advanced reasoning model",
    contextWindow: 200000,
    maxOutputTokens: 100000,
  },
  {
    id: "o1-mini",
    name: "o1 Mini",
    description: "Faster reasoning model",
    contextWindow: 128000,
    maxOutputTokens: 65536,
  },
];

export const ALL_MODELS: Record<LLMProviderType, ModelInfo[]> = {
  gemini: GEMINI_MODELS,
  anthropic: ANTHROPIC_MODELS,
  openai: OPENAI_MODELS,
};

export const DEFAULT_MODELS: Record<LLMProviderType, string> = {
  gemini: "gemini-2.5-flash-lite",
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
};

// System default (used when user has no custom settings)
export const SYSTEM_DEFAULT_PROVIDER: LLMProviderType = "gemini";
export const SYSTEM_DEFAULT_MODEL = "gemini-2.5-flash-lite";

/**
 * Get models for a specific provider.
 */
export function getModelsForProvider(provider: LLMProviderType): ModelInfo[] {
  return ALL_MODELS[provider] || [];
}

/**
 * Check if a model ID is valid for a provider.
 */
export function isValidModel(
  provider: LLMProviderType,
  modelId: string,
): boolean {
  const models = ALL_MODELS[provider];
  return models?.some((m) => m.id === modelId) ?? false;
}

/**
 * Get default model for a provider.
 */
export function getDefaultModel(provider: LLMProviderType): string {
  return DEFAULT_MODELS[provider];
}
