/**
 * Agentic chat implementation using Vercel AI SDK.
 * Supports tool calling with streaming responses.
 */

import { streamText, type CoreMessage } from "ai";
import type { UserSettings } from "@prisma/client";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import { startTrace, getPromptWithMetadata, PROMPT_NAMES } from "../llm/index.js";
import { createChatTools } from "./tools.js";
import { db } from "../db.js";

/**
 * Build user context section to append to system prompt
 */
async function buildUserContext(userId: string): Promise<string> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    select: {
      location: true,
      timezone: true,
      preferredTranslationLanguage: true,
    },
  });

  const contextParts: string[] = [];

  if (settings?.location) {
    contextParts.push(`- Location: ${settings.location}`);
  }
  if (settings?.timezone) {
    contextParts.push(`- Timezone: ${settings.timezone}`);
  }
  if (settings?.preferredTranslationLanguage) {
    contextParts.push(`- Preferred translation language: ${settings.preferredTranslationLanguage}`);
  }

  if (contextParts.length === 0) {
    return "";
  }

  return `\n\n## User Context\n${contextParts.join("\n")}`;
}

export interface ChatAgentCallbacks {
  /** Called when streaming text content */
  onTextChunk: (chunk: string, fullContent: string) => Promise<void>;
  /** Called when a tool is being called */
  onToolCall: (toolCallId: string, toolName: string, args: unknown) => Promise<void>;
  /** Called when a tool returns a result */
  onToolResult: (toolCallId: string, toolName: string, result: unknown) => Promise<void>;
  /** Called when the response is finished */
  onFinished: (fullContent: string) => Promise<void>;
  /** Called on error */
  onError: (error: Error) => Promise<void>;
}

export interface ChatAgentMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Run the chat agent with streaming and tool support.
 */
export async function runChatAgent(
  userId: string,
  messages: ChatAgentMessage[],
  settings: UserSettings | null,
  systemPromptOverride?: string,
  callbacks?: ChatAgentCallbacks
): Promise<{ content: string; toolCalls: Array<{ id: string; name: string; args: unknown; result: unknown }> }> {
  const provider = createAgentProvider(settings);
  const modelId = getAgentModelId(settings);
  const tools = createChatTools(userId);

  // Convert messages to CoreMessage format (only user and assistant messages)
  const coreMessages: CoreMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  // Fetch prompt from Opik (with local fallback) and get metadata for trace linking
  const promptData = await getPromptWithMetadata(PROMPT_NAMES.CHAT_AGENT);

  // Build user context and append to system prompt
  const userContext = await buildUserContext(userId);
  const systemPrompt = (systemPromptOverride || promptData.content) + userContext;

  // Start trace for this agent run (don't include userId for privacy)
  const trace = startTrace({
    name: "chat-agent",
    input: {
      messageCount: messages.length,
      lastMessage: messages[messages.length - 1]?.content?.slice(0, 200),
    },
    metadata: {
      model: modelId,
      promptName: promptData.promptName,
      promptVersion: promptData.promptVersion,
      promptSource: promptData.source,
    },
  });

  let fullContent = "";
  const toolCallsResult: Array<{ id: string; name: string; args: unknown; result: unknown }> = [];

  console.log(`[Agent] Using model: ${modelId}`);

  try {
    // Create span for the main LLM call
    const llmSpan = trace?.span({
      name: "streamText",
      type: "llm",
      input: {
        model: modelId,
        messageCount: coreMessages.length,
        systemPromptLength: systemPrompt.length,
      },
    });

    const result = streamText({
      model: provider(modelId),
      system: systemPrompt,
      messages: coreMessages,
      tools,
      maxSteps: 5,
      onStepFinish: (step) => {
        // Create a span for each step
        if (step.toolCalls && step.toolCalls.length > 0) {
          for (const toolCall of step.toolCalls) {
            const toolSpan = trace?.span({
              name: `tool:${toolCall.toolName}`,
              type: "tool",
              input: { args: toolCall.args },
            });
            toolSpan?.end({ result: (step.toolResults as any)?.find((r: any) => r.toolCallId === toolCall.toolCallId)?.result });
          }
        }
      },
    });

    // Process the stream
    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta":
          fullContent += part.text;
          if (callbacks?.onTextChunk) {
            await callbacks.onTextChunk(part.text, fullContent);
          }
          break;

        case "tool-call":
          if (callbacks?.onToolCall) {
            const args = (part as any).args ?? (part as any).input;
            await callbacks.onToolCall(part.toolCallId, part.toolName, args);
          }
          break;

        case "tool-result":
          const toolResult = (part as any).result ?? (part as any).output;
          toolCallsResult.push({
            id: part.toolCallId,
            name: part.toolName,
            args: {},
            result: toolResult,
          });
          if (callbacks?.onToolResult) {
            await callbacks.onToolResult(part.toolCallId, part.toolName, toolResult);
          }
          break;

        case "error":
          if (callbacks?.onError) {
            await callbacks.onError(new Error(String(part.error)));
          }
          break;
      }
    }

    // End the LLM span
    llmSpan?.end({
      contentLength: fullContent.length,
      toolCallCount: toolCallsResult.length,
    });

    // Get final text from result
    const finalText = await result.text;
    let responseContent = fullContent || finalText || "";

    // Workaround: If there are tool results but no text, make a follow-up call
    if (!responseContent && toolCallsResult.length > 0) {
      const followUpSpan = trace?.span({
        name: "followUp-streamText",
        type: "llm",
        input: { reason: "no-text-after-tools", toolCallCount: toolCallsResult.length },
      });

      const toolResultsSummary = toolCallsResult.map(tc =>
        `Tool "${tc.name}" returned: ${JSON.stringify(tc.result)}`
      ).join("\n");

      const followUpMessages: CoreMessage[] = [
        ...coreMessages,
        {
          role: "assistant" as const,
          content: `I called the following tools:\n${toolResultsSummary}\n\nNow I need to respond to the user based on these results.`,
        },
        {
          role: "user" as const,
          content: "Based on the tool results above, please provide your response.",
        },
      ];

      const followUpResult = streamText({
        model: provider(modelId),
        system: systemPrompt,
        messages: followUpMessages,
      });

      for await (const part of followUpResult.fullStream) {
        if (part.type === "text-delta") {
          responseContent += part.text;
          if (callbacks?.onTextChunk) {
            await callbacks.onTextChunk(part.text, responseContent);
          }
        }
      }

      followUpSpan?.end({ contentLength: responseContent.length });
    }

    if (callbacks?.onFinished) {
      await callbacks.onFinished(responseContent);
    }

    // End the trace with output
    await trace?.end({
      content: responseContent.slice(0, 500),
      contentLength: responseContent.length,
      toolCallCount: toolCallsResult.length,
    });

    return { content: responseContent, toolCalls: toolCallsResult };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));

    // End trace with error
    await trace?.end({
      error: err.message,
      success: false,
    });

    if (callbacks?.onError) {
      await callbacks.onError(err);
    }
    throw err;
  }
}
