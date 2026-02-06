import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  LLMMediaPart,
  LLMMessageContent,
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

    // Extract text and media from response
    const { text, media } = this.extractResponseParts(response);

    return {
      content: text,
      media: media.length > 0 ? media : undefined,
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
      const allMedia: LLMMediaPart[] = [];

      for await (const chunk of response) {
        // Extract text and media from each chunk
        const { text, media } = this.extractResponseParts(chunk);

        if (text) {
          fullContent += text;
          await options.callbacks.onToken(text, fullContent);
        }

        // Handle media parts
        for (const mediaPart of media) {
          allMedia.push(mediaPart);
          if (options.callbacks.onMedia) {
            await options.callbacks.onMedia(mediaPart);
          }
        }
      }

      await options.callbacks.onFinished(fullContent, allMedia.length > 0 ? allMedia : undefined);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.callbacks.onError(err);
    }
  }

  /**
   * Extract text and media parts from a Gemini response
   */
  private extractResponseParts(response: any): { text: string; media: LLMMediaPart[] } {
    const textParts: string[] = [];
    const media: LLMMediaPart[] = [];

    // Get candidates from response
    const candidates = response.candidates || [];

    for (const candidate of candidates) {
      const parts = candidate.content?.parts || [];

      for (const part of parts) {
        // Text part
        if (part.text) {
          textParts.push(part.text);
        }

        // Inline data (images, etc.)
        if (part.inlineData) {
          const mimeType = part.inlineData.mimeType || "application/octet-stream";
          const mediaType = this.getMediaType(mimeType);

          media.push({
            type: mediaType,
            mimeType,
            data: part.inlineData.data,
          });
        }
      }
    }

    return {
      text: textParts.join(""),
      media,
    };
  }

  /**
   * Determine media type from MIME type
   */
  private getMediaType(mimeType: string): "image" | "audio" | "video" {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType.startsWith("video/")) return "video";
    return "image"; // Default to image for unknown types
  }

  async flush(): Promise<void> {
    await this.client.flush();
  }

  private formatMessages(messages: LLMGenerateOptions["messages"]) {
    return messages
      .filter((m) => m.role !== "system") // System messages handled separately
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: this.formatContent(msg.content),
      }));
  }

  private formatContent(content: LLMMessageContent): any[] {
    // Simple string content
    if (typeof content === "string") {
      return [{ text: content }];
    }

    // Multimodal content array
    return content.map((part) => {
      if (part.type === "text") {
        return { text: part.text };
      } else if (part.type === "image") {
        return {
          inlineData: {
            mimeType: part.mimeType,
            data: part.data,
          },
        };
      }
      return { text: "" };
    });
  }
}
