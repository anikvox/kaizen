/**
 * Agentic chat implementation using Vercel AI SDK.
 * Supports tool calling with streaming responses.
 */

import { streamText, type CoreMessage } from "ai";
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

## Available Tools

### Context, Time & Location
- **get_current_time**: Get the current time for a city. Uses saved location if no city specified.
- **get_current_weather**: Get current weather for a city. Uses saved location if no city specified.
- **set_user_location**: Save the user's location for future time/weather requests. Also returns the current time in that location.
- **get_user_context**: Get user's saved location, timezone, and current browsing context.
- **get_active_website**: Get the website the user is currently viewing right now.
- **get_active_focus**: Get what topics/themes the user is currently focused on.

### Browsing Activity
- **get_attention_data**: Get comprehensive browsing activity (pages, text read, images, videos) for a time period. Defaults to last 2 hours if not specified. Use 'minutes' parameter (1-10080) or preset ('5m', '15m', '30m', '1h', '2h', '6h', '12h', '1d', '3d', '7d')
- **search_browsing_history**: Search for specific websites or topics in browsing history
- **get_reading_activity**: Get what text/articles the user has been reading. Defaults to last 2 hours.
- **get_youtube_history**: Get the user's YouTube watch history with video details and captions

### Focus & Productivity
- **get_focus_history**: Get the user's past focus sessions and work patterns

## When to Use Each Tool

| User asks about... | Use this tool |
|---|---|
| "What time is it?" / "What's today's date?" | get_current_time |
| "What's the weather?" / "Is it cold outside?" | get_current_weather |
| "Weather in Tokyo" / "Paris weather" | get_current_weather with city parameter |
| "I'm in Tokyo" / "I live in London" | set_user_location to save their location |
| "What am I looking at?" / "What site am I on?" | get_active_website |
| "What am I working on?" / "What's my focus?" | get_active_focus |
| "What was I reading?" / "What did I browse?" | get_attention_data (defaults to last 2 hours) |
| "Show me last 5 minutes of activity" | get_attention_data with minutes=5 |
| "Did I visit github today?" | search_browsing_history with query="github" |
| "What articles have I read?" | get_reading_activity |
| "What YouTube videos did I watch?" | get_youtube_history |
| "What have I been focused on this week?" | get_focus_history |

## Important Guidelines

1. **Location handling**: When time/weather tools return \`needsLocation: true\`, you MUST respond by asking the user which city they're in. Say something like "I don't have your location saved yet. Which city are you in?" Once they tell you, use \`set_user_location\` to save it, then IMMEDIATELY call \`get_current_time\` or \`get_current_weather\` to get the actual data. NEVER make up or guess the time/weather - you MUST call the tool to get real data.

2. **Default time range**: When the user asks about browsing activity without specifying a time, use the default of 2 hours. Only ask for clarification if the user seems to want a different time range.

3. **Use specific tools**: Use the most specific tool for the task. For YouTube questions, use get_youtube_history. For reading questions, use get_reading_activity.

4. **Combine tools**: You can call multiple tools to build a complete picture. For example, use get_active_website + get_active_focus to understand the user's current context.

5. **Be proactive**: If a question could benefit from browsing context, proactively fetch it. For example, if the user asks "can you summarize what I was just reading?", get the recent reading activity.

6. **Always respond after tools**: After using any tool, you MUST ALWAYS generate a text response to the user. NEVER leave your response empty. Even if the tool returns an error or needs more information, you must still write a message to the user explaining what happened or what you need from them.`;

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
