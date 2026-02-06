import Anthropic from "@anthropic-ai/sdk";
import { Opik } from "opik";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  LLMMessageContent,
} from "../interface.js";
import { env } from "../../env.js";

export class AnthropicProvider implements LLMProvider {
  readonly providerType = "anthropic" as const;
  readonly model: string;

  private client: Anthropic;
  private opikClient: Opik | null = null;
  private userId: string | undefined;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.userId = config.userId;

    this.client = new Anthropic({
      apiKey: config.apiKey,
    });

    // Initialize Opik client for manual tracing
    if (env.opikApiKey) {
      this.opikClient = new Opik({
        apiKey: env.opikApiKey,
        projectName: env.opikProjectName,
      });
    }
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    const startTime = Date.now();
    const messages = this.formatMessages(options.messages);

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: options.maxTokens || 4096,
      system: options.systemPrompt,
      messages,
      temperature: options.temperature,
    });

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    // Log trace to Opik
    if (this.opikClient) {
      const trace = this.opikClient.trace({
        name: `anthropic-${this.model}`,
        input: { messages, systemPrompt: options.systemPrompt },
        output: { content },
        metadata: {
          provider: "anthropic",
          model: this.model,
          durationMs: Date.now() - startTime,
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          userId: this.userId,
        },
      });

      trace.span({
        name: "generate",
        type: "llm",
        input: { messages },
        output: { content },
      });
    }

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  async stream(options: LLMStreamOptions): Promise<void> {
    const startTime = Date.now();
    const messages = this.formatMessages(options.messages);

    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: options.maxTokens || 4096,
        system: options.systemPrompt,
        messages,
        temperature: options.temperature,
      });

      let fullContent = "";
      let inputTokens = 0;
      let outputTokens = 0;

      stream.on("text", async (text) => {
        fullContent += text;
        await options.callbacks.onToken(text, fullContent);
      });

      const finalMessage = await stream.finalMessage();

      inputTokens = finalMessage.usage.input_tokens;
      outputTokens = finalMessage.usage.output_tokens;

      // Log trace to Opik
      if (this.opikClient) {
        const trace = this.opikClient.trace({
          name: `anthropic-${this.model}-stream`,
          input: { messages, systemPrompt: options.systemPrompt },
          output: { content: fullContent },
          metadata: {
            provider: "anthropic",
            model: this.model,
            durationMs: Date.now() - startTime,
            inputTokens,
            outputTokens,
            streaming: true,
            userId: this.userId,
          },
        });

        trace.span({
          name: "stream",
          type: "llm",
          input: { messages },
          output: { content: fullContent },
        });
      }

      await options.callbacks.onFinished(fullContent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.callbacks.onError(err);
    }
  }

  async flush(): Promise<void> {
    if (this.opikClient) {
      await this.opikClient.flush();
    }
  }

  private formatMessages(
    messages: LLMGenerateOptions["messages"]
  ): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== "system") // System messages handled separately
      .map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: this.formatContent(msg.content),
      }));
  }

  private formatContent(
    content: LLMMessageContent
  ): string | Anthropic.ContentBlockParam[] {
    // Simple string content
    if (typeof content === "string") {
      return content;
    }

    // Multimodal content array
    return content.map((part): Anthropic.ContentBlockParam => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      } else if (part.type === "image") {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: part.mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/gif"
              | "image/webp",
            data: part.data,
          },
        };
      }
      return { type: "text", text: "" };
    });
  }
}
