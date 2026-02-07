/**
 * Unified LLM Interface
 * All providers (Gemini, Anthropic, OpenAI) implement this interface.
 * Supports tool calling for agentic capabilities via Vercel AI SDK.
 */

import type { Tool } from "@ai-sdk/provider-utils";

export type LLMProviderType = "gemini" | "anthropic" | "openai";

/**
 * Media part in a multimodal response (e.g., generated images)
 */
export interface LLMMediaPart {
  type: "image" | "audio" | "video";
  mimeType: string;
  data: string; // Base64 encoded data
}

/**
 * Image content for multimodal messages
 */
export interface LLMImageContent {
  type: "image";
  mimeType: string;
  data: string; // Base64 encoded image data
}

/**
 * Text content for messages
 */
export interface LLMTextContent {
  type: "text";
  text: string;
}

export type LLMMessageContent = string | (LLMTextContent | LLMImageContent)[];

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: LLMMessageContent;
}

export interface LLMStreamCallbacks {
  onToken: (token: string, fullContent: string) => Promise<void>;
  onMedia?: (media: LLMMediaPart) => Promise<void>;
  onToolCall?: (toolCall: LLMToolCall) => Promise<void>;
  onFinished: (fullContent: string, media?: LLMMediaPart[]) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

/**
 * Tool definition for agentic capabilities.
 * Compatible with Vercel AI SDK's Tool type.
 */
export type LLMTool = Tool;

/**
 * Tool call made by the model.
 */
export interface LLMToolCall {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * Result of a tool execution.
 */
export interface LLMToolResult {
  toolCallId: string;
  toolName: string;
  result: unknown;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** Tools available for the model to call (agentic capabilities) */
  tools?: Record<string, LLMTool>;
}

export interface LLMStreamOptions extends LLMGenerateOptions {
  callbacks: LLMStreamCallbacks;
}

export interface LLMResponse {
  content: string;
  media?: LLMMediaPart[];
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Tool calls made by the model (if tools were provided) */
  toolCalls?: LLMToolCall[];
  /** Tool results (if maxSteps > 0 and tools were executed) */
  toolResults?: LLMToolResult[];
}

export interface LLMProvider {
  readonly providerType: LLMProviderType;
  readonly model: string;

  /**
   * Generate a response (non-streaming).
   * Supports tool calling when tools are provided in options.
   */
  generate(options: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * Generate a response with streaming.
   * Supports tool calling when tools are provided in options.
   */
  stream(options: LLMStreamOptions): Promise<void>;

  /**
   * Flush any pending traces/logs.
   */
  flush(): Promise<void>;
}

export interface LLMProviderConfig {
  apiKey: string;
  model: string;
  userId?: string; // For tracing/observability (Opik)
}
