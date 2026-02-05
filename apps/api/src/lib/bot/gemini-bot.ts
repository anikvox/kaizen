import type { BotInterface, BotMessage, BotCallbacks } from "./interface.js";
import { gemini, flushTraces, DEFAULT_CHAT_MODEL, type GeminiModel } from "../gemini/index.js";

const SYSTEM_PROMPT = `You are Kaizen, a helpful AI assistant. You are friendly, concise, and helpful.
Keep your responses clear and to the point unless the user asks for more detail.`;

export class GeminiBot implements BotInterface {
  private model: GeminiModel;

  constructor(model: GeminiModel = DEFAULT_CHAT_MODEL) {
    this.model = model;
  }

  async generateResponse(
    messages: BotMessage[],
    callbacks: BotCallbacks
  ): Promise<void> {
    try {
      // Signal typing state
      await callbacks.onTyping();

      // Convert messages to Gemini format
      const contents = messages.map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));

      // Start streaming response
      const response = await gemini.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
        },
      });

      let fullContent = "";

      // Process streamed chunks
      for await (const chunk of response) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullContent += chunkText;
          await callbacks.onChunk(chunkText, fullContent);
        }
      }

      // Finished streaming
      await callbacks.onFinished(fullContent);

      // Flush traces after completion
      await flushTraces();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await callbacks.onError(err);

      // Still flush traces on error
      await flushTraces();
    }
  }
}

// Default instance
export const geminiBot = new GeminiBot();
