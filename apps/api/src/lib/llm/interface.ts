/**
 * Unified LLM Interface
 * All providers (Gemini, Anthropic, OpenAI) implement this interface.
 */

export type LLMProviderType = "gemini" | "anthropic" | "openai";

/**
 * Media part in a multimodal response (e.g., generated images)
 */
export interface LLMMediaPart {
  type: "image" | "audio" | "video";
  mimeType: string;
  data: string; // Base64 encoded data
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface LLMStreamCallbacks {
  onToken: (token: string, fullContent: string) => Promise<void>;
  onMedia?: (media: LLMMediaPart) => Promise<void>;
  onFinished: (fullContent: string, media?: LLMMediaPart[]) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
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
}

export interface LLMProvider {
  readonly providerType: LLMProviderType;
  readonly model: string;

  /**
   * Generate a response (non-streaming).
   */
  generate(options: LLMGenerateOptions): Promise<LLMResponse>;

  /**
   * Generate a response with streaming.
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
}
