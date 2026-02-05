import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
} from "../interface.js";
import { env } from "../../env.js";

// Type for the tracked client with Opik extension
type TrackedGoogleGenAI = GoogleGenAI & { flush(): Promise<void> };

export class GeminiProvider implements LLMProvider {
  readonly providerType = "gemini" as const;
  readonly model: string;

  private client: TrackedGoogleGenAI;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;

    const baseClient = new GoogleGenAI({
      apiKey: config.apiKey,
    });

    this.client = trackGemini(baseClient, {
      traceMetadata: {
        tags: ["kaizen", "gemini"],
        project: env.opikProjectName,
      },
    }) as TrackedGoogleGenAI;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    const contents = this.formatMessages(options.messages);

    const response = await this.client.models.generateContent({
      model: this.model,
      contents,
      config: {
        systemInstruction: options.systemPrompt,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
      },
    });

    return {
      content: response.text || "",
      usage: response.usageMetadata
        ? {
            inputTokens: response.usageMetadata.promptTokenCount || 0,
            outputTokens: response.usageMetadata.candidatesTokenCount || 0,
          }
        : undefined,
    };
  }

  async stream(options: LLMStreamOptions): Promise<void> {
    const contents = this.formatMessages(options.messages);

    try {
      const response = await this.client.models.generateContentStream({
        model: this.model,
        contents,
        config: {
          systemInstruction: options.systemPrompt,
          maxOutputTokens: options.maxTokens,
          temperature: options.temperature,
        },
      });

      let fullContent = "";

      for await (const chunk of response) {
        const chunkText = chunk.text;
        if (chunkText) {
          fullContent += chunkText;
          await options.callbacks.onToken(chunkText, fullContent);
        }
      }

      await options.callbacks.onFinished(fullContent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.callbacks.onError(err);
    }
  }

  async flush(): Promise<void> {
    await this.client.flush();
  }

  private formatMessages(messages: LLMGenerateOptions["messages"]) {
    return messages
      .filter((m) => m.role !== "system") // System messages handled separately
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.content }],
      }));
  }
}
