import { db } from "./db.js";
import { createLLMService } from "./llm/service.js";
import type { UserSettings } from "@prisma/client";

const SUMMARIZATION_SYSTEM_PROMPT = `You are a helpful assistant that creates concise summaries of web page content.
Based on the text the user has been reading on a webpage, create a brief summary that captures:
- The main topic or subject of the page
- Key points or information the user focused on
- Any important details or takeaways

Keep summaries concise (2-4 sentences) and informative.`;

/**
 * Generate a summary for text attention data from a website visit.
 */
export async function generateVisitSummary(
  textContent: string,
  pageTitle: string,
  pageUrl: string,
  settings: UserSettings | null
): Promise<string> {
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  const prompt = `Summarize the following text content that the user read on "${pageTitle}" (${pageUrl}):

---
${textContent}
---

Provide a concise summary (2-4 sentences) of what the user was reading about.`;

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: SUMMARIZATION_SYSTEM_PROMPT,
      maxTokens: 200,
      temperature: 0.3,
    });

    await provider.flush();

    return response.content.trim();
  } catch (error) {
    console.error("Failed to generate summary:", error);
    throw error;
  }
}

/**
 * Process website visits that need summarization for a specific user.
 */
export async function processUserSummarization(userId: string): Promise<number> {
  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  // Check if summarization is enabled
  if (!settings?.attentionSummarizationEnabled) {
    return 0;
  }

  const intervalMs = settings.attentionSummarizationIntervalMs || 60000;
  const cutoffTime = new Date(Date.now() - intervalMs);

  // Find website visits that need summarization:
  // - Have text attention data
  // - Either never summarized, or summarized before the cutoff time
  const visitsToSummarize = await db.websiteVisit.findMany({
    where: {
      userId,
      OR: [
        { summarizedAt: null },
        { summarizedAt: { lt: cutoffTime } },
      ],
    },
    orderBy: { openedAt: "desc" },
    take: 10, // Process up to 10 visits at a time to avoid overload
  });

  let summarizedCount = 0;

  for (const visit of visitsToSummarize) {
    // Get text attention for this visit's URL within the visit's time window
    const textAttentions = await db.textAttention.findMany({
      where: {
        userId,
        url: visit.url,
        timestamp: {
          gte: visit.openedAt,
          ...(visit.closedAt ? { lte: visit.closedAt } : {}),
        },
      },
      orderBy: { timestamp: "asc" },
    });

    if (textAttentions.length === 0) {
      // No text attention data, mark as summarized with empty summary
      await db.websiteVisit.update({
        where: { id: visit.id },
        data: { summarizedAt: new Date() },
      });
      continue;
    }

    // Combine all text content
    const textContent = textAttentions
      .map((t) => t.text)
      .join("\n\n");

    // Skip if text is too short
    if (textContent.length < 50) {
      await db.websiteVisit.update({
        where: { id: visit.id },
        data: { summarizedAt: new Date() },
      });
      continue;
    }

    try {
      const summary = await generateVisitSummary(
        textContent,
        visit.title,
        visit.url,
        settings
      );

      await db.websiteVisit.update({
        where: { id: visit.id },
        data: {
          summary,
          summarizedAt: new Date(),
        },
      });

      summarizedCount++;
    } catch (error) {
      console.error(`Failed to summarize visit ${visit.id}:`, error);
      // Mark as summarized to avoid retry loop, but with no summary
      await db.websiteVisit.update({
        where: { id: visit.id },
        data: { summarizedAt: new Date() },
      });
    }
  }

  return summarizedCount;
}

/**
 * Process summarization for all users who have it enabled.
 */
export async function processAllUsersSummarization(): Promise<{ usersProcessed: number; totalSummarized: number }> {
  // Get all users with summarization enabled
  const usersWithSummarization = await db.userSettings.findMany({
    where: {
      attentionSummarizationEnabled: true,
    },
    select: {
      userId: true,
    },
  });

  let totalSummarized = 0;

  for (const { userId } of usersWithSummarization) {
    try {
      const count = await processUserSummarization(userId);
      totalSummarized += count;
    } catch (error) {
      console.error(`Failed to process summarization for user ${userId}:`, error);
    }
  }

  return {
    usersProcessed: usersWithSummarization.length,
    totalSummarized,
  };
}
