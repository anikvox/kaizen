import OpenAI from "openai";
import { trackOpenAI } from "opik-openai";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  LLMMessageContent,
} from "../interface.js";
import { env } from "../../env.js";

// Type for the tracked client with Opik extension
type TrackedOpenAI = OpenAI & { flush(): Promise<void> };

export class OpenAIProvider implements LLMProvider {
  readonly providerType = "openai" as const;
  readonly model: string;

  private client: TrackedOpenAI;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;

    const baseClient = new OpenAI({
      apiKey: config.apiKey,
    });

    this.client = trackOpenAI(baseClient, {
      traceMetadata: {
        tags: ["kaizen", "openai"],
        project: env.opikProjectName,
        metadata: config.userId ? { userId: config.userId } : undefined,
      },
    }) as TrackedOpenAI;
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    const messages = this.formatMessages(options.messages, options.systemPrompt);

    const response = await this.client.chat.completions.create({
      model: this.model,
      messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
    });

    const content = response.choices[0]?.message?.content || "";

    return {
      content,
      usage: response.usage
        ? {
            inputTokens: response.usage.prompt_tokens,
            outputTokens: response.usage.completion_tokens,
          }
        : undefined,
    };
  }

  async stream(options: LLMStreamOptions): Promise<void> {
    const messages = this.formatMessages(options.messages, options.systemPrompt);

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: options.maxTokens,
        temperature: options.temperature,
        stream: true,
        stream_options: { include_usage: true },
      });

      let fullContent = "";

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          await options.callbacks.onToken(delta, fullContent);
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

  private formatMessages(
    messages: LLMGenerateOptions["messages"],
    systemPrompt?: string
  ): OpenAI.ChatCompletionMessageParam[] {
    const formatted: OpenAI.ChatCompletionMessageParam[] = [];

    // Add system prompt if provided
    if (systemPrompt) {
      formatted.push({ role: "system", content: systemPrompt });
    }

    // Add conversation messages
    for (const msg of messages) {
      if (msg.role === "system") {
        formatted.push({ role: "system", content: this.formatContentAsString(msg.content) });
      } else if (msg.role === "user") {
        formatted.push({ role: "user", content: this.formatContent(msg.content) });
      } else {
        formatted.push({ role: "assistant", content: this.formatContentAsString(msg.content) });
      }
    }

    return formatted;
  }

  private formatContent(
    content: LLMMessageContent
  ): string | OpenAI.ChatCompletionContentPart[] {
    // Simple string content
    if (typeof content === "string") {
      return content;
    }

    // Multimodal content array
    return content.map((part): OpenAI.ChatCompletionContentPart => {
      if (part.type === "text") {
        return { type: "text", text: part.text };
      } else if (part.type === "image") {
        return {
          type: "image_url",
          image_url: {
            url: `data:${part.mimeType};base64,${part.data}`,
          },
        };
      }
      return { type: "text", text: "" };
    });
  }

  private formatContentAsString(content: LLMMessageContent): string {
    if (typeof content === "string") {
      return content;
    }
    return content
      .filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text)
      .join("\n");
  }
}
