/**
 * Attention data serialization and chat title generation utilities.
 */

import type { LLMProvider } from "./interface.js";
import { getSystemProvider } from "./service.js";
import { LLM_CONFIG } from "./config.js";
import { validateTitle } from "./validators.js";
import { getPrompt, PROMPT_NAMES } from "./prompt-provider.js";
import type { AttentionDataResponse, AttentionSummary } from "../attention.js";

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
 * Serialize attention data into a compact, LLM-friendly format.
 *
 * This version prioritizes AI-generated summaries over raw data for efficiency.
 * It produces a much shorter output suitable for context-limited LLM conversations.
 *
 * Format priorities:
 * - Uses page summary instead of individual text excerpts when available
 * - Uses image summaries instead of alt text when available
 * - Omits timestamps and detailed metadata
 * - Groups content by domain for better organization
 *
 * @param data - The attention data response from getAttentionData()
 * @returns A compact formatted string for LLM context
 */
export function serializeAttentionCompact(data: AttentionDataResponse): string {
  const lines: string[] = [];

  // Brief header
  const fromDate = new Date(data.timeRange.from).toLocaleString();
  const toDate = new Date(data.timeRange.to).toLocaleString();
  lines.push(`# Recent Activity (${fromDate} - ${toDate})`);
  lines.push(`Pages: ${data.summary.totalPages} | Time: ${data.summary.totalActiveTimeFormatted} | Words: ${data.summary.totalWordsRead}`);
  lines.push("");

  // Group pages by domain for organization
  const domainGroups = new Map<string, AttentionSummary[]>();
  for (const page of data.pages) {
    const pages = domainGroups.get(page.domain) || [];
    pages.push(page);
    domainGroups.set(page.domain, pages);
  }

  // Serialize each domain group
  for (const [domain, pages] of domainGroups) {
    lines.push(`## ${domain}`);

    for (const page of pages) {
      lines.push(serializePageCompact(page));
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Serialize a single page's attention data in compact format
 */
function serializePageCompact(page: AttentionSummary): string {
  const parts: string[] = [];

  // Page header with title/URL
  const title = page.title || page.url;
  parts.push(`### ${title}`);
  if (page.activeTime > 0) {
    parts.push(`Active: ${page.activeTimeFormatted}`);
  }

  // Use AI summary if available, otherwise fall back to excerpts
  if (page.summary) {
    parts.push(`Summary: ${page.summary}`);
  } else if (page.attention.text.excerpts.length > 0) {
    // Combine excerpts into a brief representation
    const combinedText = page.attention.text.excerpts
      .slice(0, 3) // Limit to first 3 excerpts
      .map(e => e.text.slice(0, 150)) // Truncate each
      .join(" ... ");
    if (combinedText) {
      parts.push(`Read: ${combinedText}${page.attention.text.excerpts.length > 3 ? " ..." : ""}`);
    }
  }

  // Images - prefer individual summaries, fall back to page-level imageSummary, then alt text
  if (page.attention.images.count > 0) {
    const imageSummaries = page.attention.images.items
      .filter(img => img.summary)
      .map(img => img.summary!);

    if (imageSummaries.length > 0) {
      // Use individual image summaries
      parts.push(`Images (${page.attention.images.count}): ${imageSummaries.slice(0, 3).join("; ")}${imageSummaries.length > 3 ? " ..." : ""}`);
    } else if (page.imageSummary) {
      // Fall back to page-level image summary
      parts.push(`Images: ${page.imageSummary}`);
    } else {
      // Fall back to alt text
      const alts = page.attention.images.items
        .filter(img => img.alt && img.alt !== "No description")
        .map(img => img.alt)
        .slice(0, 3);
      if (alts.length > 0) {
        parts.push(`Images (${page.attention.images.count}): ${alts.join(", ")}${page.attention.images.count > 3 ? " ..." : ""}`);
      } else {
        parts.push(`Images: ${page.attention.images.count} viewed`);
      }
    }
  }

  // Audio - compact format
  if (page.attention.audio.count > 0) {
    const audioTitles = page.attention.audio.items
      .map(a => a.title)
      .slice(0, 3);
    parts.push(`Audio (${page.attention.audio.count}): ${audioTitles.join(", ")}${page.attention.audio.count > 3 ? " ..." : ""}`);
  }

  // YouTube - compact with captions summary
  if (page.attention.youtube.videos.length > 0) {
    for (const video of page.attention.youtube.videos.slice(0, 2)) {
      const title = video.title || "Video";
      const channel = video.channelName ? ` (${video.channelName})` : "";
      const watchTime = video.activeWatchTimeFormatted ? ` [${video.activeWatchTimeFormatted}]` : "";
      parts.push(`YouTube: ${title}${channel}${watchTime}`);

      // Include brief caption summary if available
      if (video.captions.length > 0) {
        const captionPreview = video.captions.slice(0, 5).join(" ");
        const truncated = captionPreview.length > 200
          ? captionPreview.slice(0, 200) + "..."
          : captionPreview;
        parts.push(`  Captions: ${truncated}`);
      }
    }
    if (page.attention.youtube.videos.length > 2) {
      parts.push(`  ...and ${page.attention.youtube.videos.length - 2} more videos`);
    }
  }

  return parts.join("\n");
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
    // Fetch prompt from Opik (with local fallback)
    const systemPrompt = await getPrompt(PROMPT_NAMES.TITLE_GENERATION);

    const response = await llm.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt,
      maxTokens: LLM_CONFIG.titleGeneration.maxTokens,
      temperature: LLM_CONFIG.titleGeneration.temperature,
    });

    await llm.flush();

    return validateTitle(response.content, 4);
  } catch (error) {
    console.error("Failed to generate chat title:", error);
    return "New Chat";
  }
}
