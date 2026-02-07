/**
 * Agentic chat implementation using Vercel AI SDK.
 * Supports tool calling with streaming responses.
 */

import { streamText, type CoreMessage } from "ai";
import type { UserSettings } from "@prisma/client";
import { createAgentProvider, getAgentModelId } from "../agent/index.js";
import { getTelemetrySettings, getPrompt, PROMPT_NAMES } from "../llm/index.js";
import { createChatTools } from "./tools.js";

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

  // Fetch prompt from Opik (with local fallback)
  const systemPrompt = systemPromptOverride || await getPrompt(PROMPT_NAMES.CHAT_AGENT);
  let fullContent = "";
  const toolCallsResult: Array<{ id: string; name: string; args: unknown; result: unknown }> = [];

  console.log(`[Agent] Using model: ${modelId}`);

  try {
    const result = streamText({
      model: provider(modelId),
      system: systemPrompt,
      messages: coreMessages,
      tools,
      maxSteps: 5, // Allow up to 5 steps for multi-step tool calling
      experimental_telemetry: telemetry as any,
      onStepFinish: (step) => {
        console.log(`[Agent] onStepFinish:`, {
          stepType: step.stepType,
          finishReason: step.finishReason,
          isContinued: step.isContinued,
          text: step.text?.slice(0, 100),
          toolCalls: step.toolCalls?.length || 0,
          toolResults: step.toolResults?.length || 0,
        });
      },
    });

    // Process the stream
    for await (const part of result.fullStream) {
      console.log(`[Agent] Stream part: ${part.type}`);
      switch (part.type) {
        case "text-delta":
          fullContent += part.text;
          if (callbacks?.onTextChunk) {
            await callbacks.onTextChunk(part.text, fullContent);
          }
          break;

        case "tool-call":
          console.log(`[Agent] Tool call: ${part.toolName}`, part);
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

        case "step-finish":
          console.log(`[Agent] Step finished. Reason: ${(part as any).finishReason}, isContinued: ${(part as any).isContinued}`);
          break;

        case "finish":
          console.log(`[Agent] Stream finished. Reason: ${(part as any).finishReason}`);
          break;
      }
    }

    // Get final text from result (in case fullContent wasn't accumulated properly)
    const finalText = await result.text;
    console.log(`[Agent] Final text: "${finalText?.slice(0, 100)}"`);
    console.log(`[Agent] Accumulated content: "${fullContent?.slice(0, 100)}"`);
    console.log(`[Agent] Tool calls: ${toolCallsResult.length}`);

    let responseContent = fullContent || finalText || "";

    // Workaround: If there are tool results but no text, make a follow-up call
    // This handles models (like Gemini) that don't automatically continue after tool calls
    if (!responseContent && toolCallsResult.length > 0) {
      console.log(`[Agent] No text after tool calls, making follow-up request...`);

      // Build a simple follow-up prompt that includes the tool results
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

      // Make a second call without tools to force text generation
      const followUpResult = streamText({
        model: provider(modelId),
        system: systemPrompt,
        messages: followUpMessages,
        // No tools - force the model to generate text
      });

      for await (const part of followUpResult.fullStream) {
        if (part.type === "text-delta") {
          responseContent += part.text;
          if (callbacks?.onTextChunk) {
            await callbacks.onTextChunk(part.text, responseContent);
          }
        }
      }

      console.log(`[Agent] Follow-up response: "${responseContent?.slice(0, 100)}"`);
    }

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
