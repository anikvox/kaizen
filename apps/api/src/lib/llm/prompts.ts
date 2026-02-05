import type { LLMProvider } from "./interface.js";
import { getSystemProvider } from "./service.js";
import type { AttentionDataResponse, AttentionSummary } from "../attention.js";

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
 * Serialize attention data for a single page into LLM-friendly format
 */
function serializePageAttention(page: AttentionSummary): string {
  const lines: string[] = [];

  lines.push(`## ${page.title || page.url}`);
  lines.push(`- URL: ${page.url}`);
  lines.push(`- Domain: ${page.domain}`);
  lines.push(`- Visited: ${new Date(page.visitedAt).toLocaleString()}`);
  if (page.activeTime > 0) {
    lines.push(`- Active time: ${page.activeTimeFormatted}`);
  }

  // Text attention
  if (page.attention.text.totalWordsRead > 0) {
    lines.push("");
    lines.push(`### Text Read (${page.attention.text.totalWordsRead} words)`);
    for (const excerpt of page.attention.text.excerpts) {
      lines.push(`> ${excerpt.text}`);
    }
  }

  // Image attention
  if (page.attention.images.count > 0) {
    lines.push("");
    lines.push(`### Images Viewed (${page.attention.images.count})`);
    for (const img of page.attention.images.items) {
      const desc = img.alt || "No description";
      lines.push(`- ${desc} (viewed for ${img.hoverDurationFormatted})`);
    }
  }

  // Audio attention
  if (page.attention.audio.count > 0) {
    lines.push("");
    lines.push(`### Audio Listened (${page.attention.audio.count})`);
    for (const audio of page.attention.audio.items) {
      lines.push(`- ${audio.title} (played for ${audio.playbackDurationFormatted})`);
    }
  }

  // YouTube attention
  if (page.attention.youtube.videos.length > 0) {
    lines.push("");
    lines.push(`### YouTube Videos (${page.attention.youtube.videos.length})`);
    for (const video of page.attention.youtube.videos) {
      const title = video.title || "Unknown video";
      const channel = video.channelName ? ` by ${video.channelName}` : "";
      const watchTime = video.activeWatchTimeFormatted
        ? ` (watched for ${video.activeWatchTimeFormatted})`
        : "";
      lines.push(`- ${title}${channel}${watchTime}`);

      if (video.captions.length > 0) {
        lines.push("  Captions:");
        for (const caption of video.captions) {
          lines.push(`  > ${caption}`);
        }
      }
    }
  }

  return lines.join("\n");
}

/**
 * Serialize attention data into an LLM-friendly text format.
 *
 * This function converts structured attention data into a markdown-formatted
 * string that can be easily consumed by language models as context.
 *
 * @param data - The attention data response from getAttentionData()
 * @returns A formatted string containing the attention data
 */
export function serializeAttentionForLLM(data: AttentionDataResponse): string {
  const lines: string[] = [];

  // Header with time range
  const fromDate = new Date(data.timeRange.from).toLocaleString();
  const toDate = new Date(data.timeRange.to).toLocaleString();
  lines.push(`# User Attention Data`);
  lines.push(`Time period: ${fromDate} to ${toDate}`);
  lines.push("");

  // Summary statistics
  lines.push(`## Summary`);
  lines.push(`- Pages visited: ${data.summary.totalPages}`);
  lines.push(`- Total active time: ${data.summary.totalActiveTimeFormatted}`);
  lines.push(`- Words read: ${data.summary.totalWordsRead}`);
  lines.push(`- Images viewed: ${data.summary.totalImagesViewed}`);
  lines.push(`- Audio clips listened: ${data.summary.totalAudioListened}`);
  lines.push(`- YouTube videos watched: ${data.summary.totalYoutubeVideos}`);
  lines.push("");

  // Detailed page-by-page breakdown
  if (data.pages.length > 0) {
    lines.push(`# Detailed Activity`);
    lines.push("");

    for (const page of data.pages) {
      lines.push(serializePageAttention(page));
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

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
