import type { LLMProvider } from "./interface.js";
import { getSystemProvider } from "./service.js";

/**
 * System prompts for different use cases.
 */
export const SYSTEM_PROMPTS = {
  chat: `You are Kaizen, a helpful AI assistant. You are friendly, concise, and helpful.
Keep your responses clear and to the point unless the user asks for more detail.`,

  titleGeneration: `You are a helpful assistant that generates short, descriptive titles.
Generate titles that are concise and capture the essence of the content.`,
} as const;

/**
 * Generate a concise chat title based on the first message.
 * Uses the system provider (not user's custom provider).
 * Returns a title of at most 4 words.
 */
export async function generateChatTitle(
  message: string,
  provider?: LLMProvider
): Promise<string> {
  const llm = provider || getSystemProvider();

  const prompt = `Generate a very short title (maximum 4 words) for a chat conversation that starts with this message.
Return ONLY the title, nothing else. No quotes, no punctuation at the end.

Message: "${message}"

Title:`;

  try {
    const response = await llm.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: SYSTEM_PROMPTS.titleGeneration,
      maxTokens: 20,
      temperature: 0.7,
    });

    const title = response.content.trim() || "New Chat";

    // Ensure max 4 words
    const words = title.split(/\s+/).slice(0, 4);
    const finalTitle = words.join(" ");

    await llm.flush();

    return finalTitle || "New Chat";
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return "New Chat";
  }
}
