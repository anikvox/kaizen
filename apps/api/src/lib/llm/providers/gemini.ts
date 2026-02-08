import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, streamText } from "ai";
import type {
  UserModelMessage,
  AssistantModelMessage,
} from "@ai-sdk/provider-utils";
import type {
  LLMProvider,
  LLMProviderConfig,
  LLMGenerateOptions,
  LLMStreamOptions,
  LLMResponse,
  LLMMessageContent,
  LLMToolCall,
  LLMToolResult,
} from "../interface.js";
import { getTelemetrySettings } from "../telemetry.js";

type Message = UserModelMessage | AssistantModelMessage;

export class GeminiProvider implements LLMProvider {
  readonly providerType = "gemini" as const;
  readonly model: string;

  private google: ReturnType<typeof createGoogleGenerativeAI>;
  private userId?: string;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.userId = config.userId;

    this.google = createGoogleGenerativeAI({
      apiKey: config.apiKey,
    });
  }

  async generate(options: LLMGenerateOptions): Promise<LLMResponse> {
    const messages = this.formatMessages(options.messages);

    const result = await generateText({
      model: this.google(this.model),
      system: options.systemPrompt,
      messages,
      maxOutputTokens: options.maxTokens,
      temperature: options.temperature,
      tools: options.tools,
      experimental_telemetry: getTelemetrySettings({
        name: `gemini-${this.model}`,
        userId: this.userId,
      }),
    });

    // Extract tool calls and results
    const toolCalls: LLMToolCall[] | undefined = result.toolCalls?.map(
      (tc) => ({
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: "args" in tc ? (tc.args as Record<string, unknown>) : {},
      }),
    );

    const toolResults: LLMToolResult[] | undefined = result.toolResults?.map(
      (tr) => ({
        toolCallId: tr.toolCallId,
        toolName: tr.toolName,
        result: "result" in tr ? tr.result : undefined,
      }),
    );

    return {
      content: result.text,
      usage: result.usage
        ? {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
          }
        : undefined,
      toolCalls: toolCalls?.length ? toolCalls : undefined,
      toolResults: toolResults?.length ? toolResults : undefined,
    };
  }

  async stream(options: LLMStreamOptions): Promise<void> {
    const messages = this.formatMessages(options.messages);

    try {
      const result = streamText({
        model: this.google(this.model),
        system: options.systemPrompt,
        messages,
        maxOutputTokens: options.maxTokens,
        temperature: options.temperature,
        tools: options.tools,
        experimental_telemetry: getTelemetrySettings({
          name: `gemini-${this.model}-stream`,
          userId: this.userId,
        }),
      });

      let fullContent = "";

      // Handle text stream
      for await (const chunk of result.textStream) {
        fullContent += chunk;
        await options.callbacks.onToken(chunk, fullContent);
      }

      // Get final result for tool calls
      const finalResult = await result;
      if (finalResult.toolCalls && options.callbacks.onToolCall) {
        for (const tc of await finalResult.toolCalls) {
          await options.callbacks.onToolCall({
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: "args" in tc ? (tc.args as Record<string, unknown>) : {},
          });
        }
      }

      await options.callbacks.onFinished(fullContent);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      await options.callbacks.onError(err);
    }
  }

  async flush(): Promise<void> {
    // OpenTelemetry handles flushing automatically
  }

  private formatMessages(messages: LLMGenerateOptions["messages"]): Message[] {
    return messages
      .filter((m) => m.role !== "system") // System messages handled separately
      .map((msg): Message => {
        if (msg.role === "user") {
          return {
            role: "user",
            content: this.formatUserContent(msg.content),
          };
        }
        return {
          role: "assistant",
          content: this.formatContentAsString(msg.content),
        };
      });
  }

  private formatUserContent(
    content: LLMMessageContent,
  ): UserModelMessage["content"] {
    // Simple string content
    if (typeof content === "string") {
      return content;
    }

    // Multimodal content array
    return content.map((part) => {
      if (part.type === "text") {
        return { type: "text" as const, text: part.text };
      } else if (part.type === "image") {
        return {
          type: "image" as const,
          image: `data:${part.mimeType};base64,${part.data}`,
        };
      }
      return { type: "text" as const, text: "" };
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
