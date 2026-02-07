/**
 * Agentic chat implementation using Vercel AI SDK.
 * Supports tool calling with streaming responses.
 */

import { streamText, stepCountIs, type CoreMessage } from "ai";
import type { UserSettings } from "@prisma/client";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import { getTelemetrySettings } from "../llm/telemetry.js";
import { createChatTools } from "./tools.js";
import { SYSTEM_PROMPTS } from "../llm/index.js";

/**
 * System prompt for the chat agent.
 * Includes instructions for tool usage.
 */
const CHAT_AGENT_SYSTEM_PROMPT = `${SYSTEM_PROMPTS.chat}

You have access to tools that can help you provide better responses:
- get_current_utc_time: Get the current UTC time in various formats
- get_user_attention_data: Get the user's recent browsing activity and attention data

When the user asks about:
- The current time, date, or needs timestamp information → use get_current_utc_time
- What they were reading, watching, or browsing → use get_user_attention_data
- Something they saw online or want context about their recent activity → use get_user_attention_data

Always use tools when they would help answer the user's question more accurately. You can call get_user_attention_data proactively if you think browsing context would help answer the user's question.`;

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
  const telemetry = getTelemetrySettings({ name: "chat-agent", userId });

  // Convert messages to CoreMessage format (only user and assistant messages)
  const coreMessages: CoreMessage[] = messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));

  const systemPrompt = systemPromptOverride || CHAT_AGENT_SYSTEM_PROMPT;
  let fullContent = "";
  const toolCallsResult: Array<{ id: string; name: string; args: unknown; result: unknown }> = [];

  try {
    const result = streamText({
      model: provider(modelId),
      system: systemPrompt,
      messages: coreMessages,
      tools,
      stopWhen: stepCountIs(5), // Continue until 5 steps or no more tool calls
      experimental_telemetry: telemetry as any,
    });

    // Process the stream
    for await (const part of result.fullStream) {
      console.log(`[Agent] Stream part: ${part.type}`, part.type === "text-delta" ? part.text?.slice(0, 50) : "");

      switch (part.type) {
        case "text-delta":
          fullContent += part.text;
          if (callbacks?.onTextChunk) {
            await callbacks.onTextChunk(part.text, fullContent);
          }
          break;

        case "tool-call":
          if (callbacks?.onToolCall) {
            // AI SDK v6 uses 'input' instead of 'args'
            const args = (part as any).args ?? (part as any).input;
            await callbacks.onToolCall(part.toolCallId, part.toolName, args);
          }
          break;

        case "tool-result":
          // AI SDK v6 uses 'output' instead of 'result'
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

        case "finish":
          // Stream finished
          break;
      }
    }

    // Get final text from result (in case fullContent wasn't accumulated properly)
    const finalText = await result.text;
    console.log(`[Agent] Final text from result.text: "${finalText?.slice(0, 100)}"`);
    console.log(`[Agent] Accumulated fullContent: "${fullContent?.slice(0, 100)}"`);

    // Use final text if fullContent is empty
    const responseContent = fullContent || finalText || "";

    if (callbacks?.onFinished) {
      await callbacks.onFinished(responseContent);
    }

    return { content: responseContent, toolCalls: toolCallsResult };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    if (callbacks?.onError) {
      await callbacks.onError(err);
    }
    throw err;
  }
}
