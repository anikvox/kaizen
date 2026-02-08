/**
 * Attention Insight Generation
 *
 * Generates short 4-5 word summaries of what the user is currently paying attention to.
 * Examples: "You're reading about React hooks", "You're viewing product images"
 */

import { db } from "../db.js";
import { createLLMService } from "../llm/service.js";
import { events } from "../events.js";

const MAX_INSIGHTS = 10;
const INSIGHT_GENERATION_INTERVAL_MS = 30 * 1000; // 30 seconds

export interface AttentionInsight {
  id: string;
  userId: string;
  message: string;
  sourceUrl: string | null;
  createdAt: Date;
}

/**
 * Get recent insights for a user
 */
export async function getUserInsights(
  userId: string,
): Promise<AttentionInsight[]> {
  const insights = await db.attentionInsight.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_INSIGHTS,
  });

  return insights.map((i) => ({
    id: i.id,
    userId: i.userId,
    message: i.message,
    sourceUrl: i.sourceUrl,
    createdAt: i.createdAt,
  }));
}

/**
 * Check if enough time has passed since last insight generation
 */
export async function shouldGenerateInsight(userId: string): Promise<boolean> {
  const lastInsight = await db.attentionInsight.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (!lastInsight) return true;

  const timeSinceLastInsight = Date.now() - lastInsight.createdAt.getTime();
  return timeSinceLastInsight >= INSIGHT_GENERATION_INTERVAL_MS;
}

/**
 * Generate an attention insight from recent attention data
 */
export async function generateInsight(
  userId: string,
  attentionData: {
    type: "text" | "image" | "youtube";
    url: string;
    content: string; // text content, image alt/title, or youtube title
  },
): Promise<AttentionInsight | null> {
  // Check if we should generate (rate limiting)
  const shouldGenerate = await shouldGenerateInsight(userId);
  if (!shouldGenerate) {
    return null;
  }

  const { type, url, content } = attentionData;

  // Skip if content is too short or empty
  if (!content || content.trim().length < 5) {
    return null;
  }

  const PROMPT = `Generate a single short attention summary (4-6 words) describing what the user is doing.

Content type: ${type}
Content: "${content.slice(0, 200)}"

Use one of these patterns:
- "You're reading about [topic]"
- "You're viewing [thing]"
- "You're exploring [topic]"
- "You're checking [thing]"
- "You're learning about [topic]"
- "You're looking into [topic]"
- "You're watching [topic]"

Rules:
- Extract the main topic/subject from the content
- Keep it 4-6 words maximum
- Be specific but concise
- No quotes in response
- Just return the single sentence, nothing else`;

  try {
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const llmService = createLLMService(settings);
    const provider = llmService.getProvider();

    const response = await provider.generate({
      messages: [{ role: "user", content: PROMPT }],
    });

    const message = response.content.trim().replace(/^["']|["']$/g, "");

    // Validate the response
    if (!message || message.length > 60 || message.split(" ").length > 8) {
      return null;
    }

    // Create the insight
    const insight = await db.attentionInsight.create({
      data: {
        userId,
        message,
        sourceUrl: url,
      },
    });

    // Clean up old insights (keep only MAX_INSIGHTS)
    const allInsights = await db.attentionInsight.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: MAX_INSIGHTS,
    });

    if (allInsights.length > 0) {
      await db.attentionInsight.deleteMany({
        where: {
          id: { in: allInsights.map((i) => i.id) },
        },
      });
    }

    const result: AttentionInsight = {
      id: insight.id,
      userId: insight.userId,
      message: insight.message,
      sourceUrl: insight.sourceUrl,
      createdAt: insight.createdAt,
    };

    // Emit event for real-time updates
    events.emitInsightCreated({ userId, insight: result });

    return result;
  } catch (error) {
    console.error("[Insight] Generation failed:", error);
    return null;
  }
}
