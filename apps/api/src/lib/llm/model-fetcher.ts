import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LLMProviderType } from "./interface.js";
import type { ModelInfo } from "./models.js";

// Anthropic doesn't have a models list API, so we maintain a curated list
// but verify the API key works
const ANTHROPIC_KNOWN_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-20250514",
    name: "Claude Sonnet 4",
    description: "Latest Sonnet model, excellent balance of speed and intelligence",
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

/**
 * Fetch available models from Gemini API
 */
export async function fetchGeminiModels(apiKey: string): Promise<ModelInfo[]> {
  const client = new GoogleGenAI({ apiKey });

  const models: ModelInfo[] = [];
  const response = await client.models.list();

  // Access models from the page property
  const modelList = response.page || [];

  for (const model of modelList) {
    // Filter to only generative models that support generateContent
    const actions = model.supportedActions || [];
    if (model.name && actions.includes("generateContent")) {
      // Extract model ID from full name (e.g., "models/gemini-1.5-flash" -> "gemini-1.5-flash")
      const modelId = model.name.replace("models/", "");

      // Skip embedding, imagen, veo, aqa, and audio-only models
      if (modelId.includes("embedding") ||
          modelId.includes("imagen") ||
          modelId.includes("veo") ||
          modelId === "aqa" ||
          modelId.includes("native-audio")) {
        continue;
      }

      models.push({
        id: modelId,
        name: model.displayName || modelId,
        description: model.description || "",
        contextWindow: model.inputTokenLimit || 0,
        maxOutputTokens: model.outputTokenLimit || 8192,
      });
    }
  }

  // Sort: prioritize stable versions, then by name
  return models.sort((a, b) => {
    const priority = (id: string) => {
      // Prioritize stable gemini versions
      if (id === "gemini-2.5-flash") return 0;
      if (id === "gemini-2.5-flash-lite") return 1;
      if (id === "gemini-2.5-pro") return 2;
      if (id.startsWith("gemini-2.5")) return 3;
      if (id.startsWith("gemini-2.0")) return 4;
      if (id.startsWith("gemini-3")) return 5;
      if (id.startsWith("gemini")) return 6;
      if (id.startsWith("gemma")) return 7;
      return 10;
    };
    return priority(a.id) - priority(b.id) || a.name.localeCompare(b.name);
  });
}

/**
 * Fetch available models from OpenAI API
 */
export async function fetchOpenAIModels(apiKey: string): Promise<ModelInfo[]> {
  const client = new OpenAI({ apiKey });

  const response = await client.models.list();
  const models: ModelInfo[] = [];

  // Filter to chat models (gpt-*, o1-*, o3-*, chatgpt-*)
  const chatModelPrefixes = ["gpt-4", "gpt-3.5", "o1", "o3", "chatgpt"];

  for (const model of response.data) {
    const isChatModel = chatModelPrefixes.some(prefix => model.id.startsWith(prefix));

    // Skip instruct, audio, realtime, and search models
    const isExcluded = model.id.includes("instruct") ||
                       model.id.includes("audio") ||
                       model.id.includes("realtime") ||
                       model.id.includes("search");

    if (isChatModel && !isExcluded) {
      // OpenAI doesn't return context window in list, use known defaults
      const contextWindow = getOpenAIContextWindow(model.id);
      const maxOutputTokens = getOpenAIMaxOutput(model.id);

      models.push({
        id: model.id,
        name: formatOpenAIModelName(model.id),
        description: getOpenAIDescription(model.id),
        contextWindow,
        maxOutputTokens,
      });
    }
  }

  // Sort: prioritize newer models (gpt-4o, o1, o3 first)
  return models.sort((a, b) => {
    const priority = (id: string) => {
      if (id.startsWith("o3")) return 0;
      if (id.startsWith("o1")) return 1;
      if (id.startsWith("gpt-4o")) return 2;
      if (id.startsWith("gpt-4")) return 3;
      if (id.startsWith("chatgpt")) return 4;
      return 5;
    };
    return priority(a.id) - priority(b.id) || a.name.localeCompare(b.name);
  });
}

/**
 * Get models for Anthropic (verify API key, return known models)
 * Anthropic doesn't have a public models list API
 */
export async function fetchAnthropicModels(apiKey: string): Promise<ModelInfo[]> {
  // Verify the API key works by making a minimal request
  const client = new Anthropic({ apiKey });

  // Use a minimal messages request to verify the key
  // This will throw if the key is invalid
  await client.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 1,
    messages: [{ role: "user", content: "hi" }],
  });

  // Return known models if key is valid
  return ANTHROPIC_KNOWN_MODELS;
}

/**
 * Fetch models for a specific provider
 */
export async function fetchModelsForProvider(
  provider: LLMProviderType,
  apiKey: string
): Promise<ModelInfo[]> {
  switch (provider) {
    case "gemini":
      return fetchGeminiModels(apiKey);
    case "openai":
      return fetchOpenAIModels(apiKey);
    case "anthropic":
      return fetchAnthropicModels(apiKey);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// Helper functions for OpenAI model metadata
function getOpenAIContextWindow(modelId: string): number {
  if (modelId.includes("o1") || modelId.includes("o3")) return 200000;
  if (modelId.includes("gpt-4o") || modelId.includes("gpt-4-turbo")) return 128000;
  if (modelId.includes("gpt-4-32k")) return 32768;
  if (modelId.includes("gpt-4")) return 8192;
  if (modelId.includes("gpt-3.5-turbo-16k")) return 16385;
  if (modelId.includes("gpt-3.5")) return 16385;
  return 8192;
}

function getOpenAIMaxOutput(modelId: string): number {
  if (modelId.includes("o1")) return 100000;
  if (modelId.includes("o3")) return 100000;
  if (modelId.includes("gpt-4o")) return 16384;
  return 4096;
}

function formatOpenAIModelName(modelId: string): string {
  // Format model ID into a readable name
  return modelId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Gpt", "GPT")
    .replace("O1", "o1")
    .replace("O3", "o3");
}

function getOpenAIDescription(modelId: string): string {
  if (modelId === "gpt-4o") return "Most capable GPT-4 model with vision";
  if (modelId === "gpt-4o-mini") return "Smaller, faster, and more affordable";
  if (modelId.includes("gpt-4o")) return "GPT-4o variant";
  if (modelId.includes("gpt-4-turbo")) return "Fast GPT-4 with large context";
  if (modelId.includes("gpt-4")) return "GPT-4 model";
  if (modelId.startsWith("o1")) return "Advanced reasoning model";
  if (modelId.startsWith("o3")) return "Next-gen reasoning model";
  if (modelId.includes("gpt-3.5")) return "Fast and affordable";
  if (modelId.includes("chatgpt")) return "ChatGPT model";
  return "";
}
