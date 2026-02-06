import type { FormattedAttentionItem } from "./types.js";

/**
 * Format attention data for inclusion in LLM prompts.
 * Truncates content to avoid excessive token usage.
 */
export function formatAttentionForPrompt(
  attentionItems: FormattedAttentionItem[],
  maxContentLength: number = 5000
): string {
  if (attentionItems.length === 0) {
    return "No recent attention data available.";
  }

  let totalLength = 0;
  const formattedSessions: string[] = [];

  for (const item of attentionItems) {
    const parts: string[] = [];

    // Add URL and title
    parts.push(`URL: ${item.url}`);
    if (item.title) {
      parts.push(`Title: ${item.title}`);
    }

    // Add text content (truncated)
    if (item.textContent.length > 0) {
      const textContent = item.textContent.join(" ").slice(0, 1000);
      parts.push(`Text read: ${textContent}${item.textContent.join(" ").length > 1000 ? "..." : ""}`);
    }

    // Add image descriptions
    if (item.imageDescriptions.length > 0) {
      const imageDesc = item.imageDescriptions.slice(0, 5).join("; ");
      parts.push(`Images viewed: ${imageDesc}`);
    }

    // Add YouTube content
    if (item.youtubeContent.length > 0) {
      const ytContent = item.youtubeContent.slice(0, 3).join("; ");
      parts.push(`YouTube: ${ytContent}`);
    }

    const sessionText = parts.join("\n");

    // Check if adding this session would exceed the limit
    if (totalLength + sessionText.length > maxContentLength) {
      break;
    }

    formattedSessions.push(sessionText);
    totalLength += sessionText.length;
  }

  return formattedSessions.join("\n\n---\n\n");
}

/**
 * Prompt 1: Focus Area Detection
 * Identifies the user's current focus area from recent attention data.
 */
export function createFocusAreaPrompt(formattedAttention: string): string {
  return `You are an attention analysis model. Based on the following browsing sessions, determine the user's primary focus area.

Sessions:
---
${formattedAttention}
---

Instructions:
- Respond with ONLY 2-3 words that represent the main topic
- Focus on the most recent and dominant theme
- Consider both explicit mentions and implied context
- Do not include punctuation or explanations
- Be specific enough to be meaningful (e.g., "React Development" not just "Programming")

If you cannot determine a clear focus from the data, respond with exactly: null`;
}

/**
 * Prompt 2: Focus Drift Detection
 * Checks if the user's attention has shifted to a completely different topic.
 */
export function createFocusDriftPrompt(
  currentFocusItem: string,
  keywords: string[],
  formattedAttention: string
): string {
  return `You are performing focus analysis to check if the user's attention has shifted to a new topic.

Current focus: ${currentFocusItem}
Current keywords: ${keywords.join(", ")}

Recent attention:
---
${formattedAttention}
---

Question: Does the recent attention clearly belong to a DIFFERENT subject than the current focus?

Rules:
- If it is related, even tangentially, answer: no
- If it's the same domain or subtopic, answer: no
- If it's a natural extension or related research, answer: no
- Only answer "yes" if it's a completely different topic (e.g., moving from tech to cooking)
- Be conservative - when in doubt, answer "no"

Answer with one word only: yes or no`;
}

/**
 * Prompt 3: Keyword Summarization
 * Consolidates multiple keywords into a single representative focus item.
 */
export function createKeywordSummaryPrompt(keywords: string[]): string {
  return `Find the common theme in these keywords and respond with 2-3 words only.

Keywords: ${keywords.join(", ")}

Rules:
- Be specific enough to be meaningful
- If no clear commonality exists, identify the most significant or dominant term
- Consider both direct and indirect relationships
- No punctuation or explanation in your response`;
}

/**
 * System prompt for focus-related LLM calls.
 * Keeps responses concise and focused.
 */
export const FOCUS_SYSTEM_PROMPT = `You are a focus analysis assistant. Your responses must be:
- Extremely concise (2-3 words maximum for focus items)
- Factual and based only on the provided data
- Free of explanations, punctuation, or additional commentary
- In lowercase when returning single words like "yes" or "no"`;
