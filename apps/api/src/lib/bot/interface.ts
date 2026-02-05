export interface BotMessage {
  role: "user" | "bot";
  content: string;
}

export interface BotCallbacks {
  onTyping: () => Promise<void>;
  onChunk: (chunk: string, fullContent: string) => Promise<void>;
  onFinished: (fullContent: string) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

export interface BotInterface {
  generateResponse(
    messages: BotMessage[],
    callbacks: BotCallbacks
  ): Promise<void>;
}
