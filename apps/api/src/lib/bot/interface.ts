import type { LLMMediaPart } from "../llm/index.js";

export interface BotMessage {
  role: "user" | "bot";
  content: string;
}

export interface BotMediaPart {
  type: "image" | "audio" | "video";
  mimeType: string;
  data: string; // Base64 encoded data
}

export interface BotCallbacks {
  onTyping: () => Promise<void>;
  onChunk: (chunk: string, fullContent: string) => Promise<void>;
  onMedia?: (media: BotMediaPart) => Promise<void>;
  onFinished: (fullContent: string, media?: BotMediaPart[]) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

export interface BotInterface {
  generateResponse(
    messages: BotMessage[],
    callbacks: BotCallbacks
  ): Promise<void>;
}
