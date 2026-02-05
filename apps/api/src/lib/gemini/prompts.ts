import { gemini, flushTraces, GEMINI_MODELS } from "./client.js";

/**
 * Generate a concise chat title based on the first message.
 * Returns a title of at most 4 words.
 */
export async function generateChatTitle(message: string): Promise<string> {
  const prompt = `Generate a very short title (maximum 4 words) for a chat conversation that starts with this message.
Return ONLY the title, nothing else. No quotes, no punctuation at the end.

Message: "${message}"

Title:`;

  try {
    const response = await gemini.models.generateContent({
      model: GEMINI_MODELS.flash,
      contents: prompt,
    });

    const title = response.text?.trim() || "New Chat";

    // Ensure max 4 words
    const words = title.split(/\s+/).slice(0, 4);
    const finalTitle = words.join(" ");

    await flushTraces();

    return finalTitle || "New Chat";
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return "New Chat";
  }
}
