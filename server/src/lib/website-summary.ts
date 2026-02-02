import { GoogleGenAI } from "@google/genai";
import { trackGemini } from "opik-gemini";
import { prisma } from "./prisma";
import { opikClient, createTrace, withSpan, type Trace } from "./opik";

// Initialize Google GenAI client
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY!,
});

// Wrap the client with Opik tracking for observability
const trackedGenAI = trackGemini(genAI, {
  client: opikClient,
  traceMetadata: {
    tags: ["kaizen", "website-summary"],
  },
  generationName: "website-summary-generation",
});

const MODEL_NAME = "gemini-2.5-flash-lite";

interface WebsiteSummaryInput {
  url: string;
  title: string;
  textContent?: string; // Concatenated text attention from this URL
}

/**
 * Generates a summary of a website using AI
 */
export async function generateWebsiteSummary(
  input: WebsiteSummaryInput,
  parentTrace?: Trace
): Promise<string> {
  const doGeneration = async (): Promise<string> => {
    const prompt = `You are an AI that generates concise summaries of websites based on their URL, title, and content.

# Website Information
URL: ${input.url}
Title: ${input.title}
${input.textContent ? `\nText Content (user read from this page):\n${input.textContent.substring(0, 2000)}...` : ""}

# Task
Generate a brief 1-2 sentence summary of what this website is about and what content it contains.

Focus on:
- What is the main topic/purpose of this website?
- What type of content does it contain?
- If text content is available, what did the user read about?

Keep it concise and informative.

Respond with ONLY the summary text (no JSON, no markdown).`;

    try {
      const response = await trackedGenAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
      });

      const summary = response.text?.trim() || "";

      // Flush traces
      await trackedGenAI.flush();

      return summary || "No summary available";
    } catch (error) {
      console.error("Error generating website summary:", error);
      return "Unable to generate summary";
    }
  };

  if (parentTrace) {
    return withSpan(parentTrace, doGeneration, {
      name: "generateWebsiteSummary",
      type: "llm",
      metadata: {
        model: MODEL_NAME,
        url: input.url,
      },
    });
  }

  return doGeneration();
}

/**
 * Processes website visits that don't have summaries yet
 * Generates summaries for them using AI
 */
export async function processWebsiteSummaries(
  userId: string,
  limit: number = 10
): Promise<{
  processed: number;
  errors: number;
}> {
  const trace = createTrace({
    name: "processWebsiteSummaries",
    tags: ["kaizen", "website-summary", "batch"],
    metadata: {
      userId,
      limit,
    },
  });

  try {
    // Find website visits without summaries
    const visitsWithoutSummary = await prisma.websiteVisit.findMany({
      where: {
        userId,
        summary: null,
      },
      orderBy: {
        openedAt: "desc",
      },
      take: limit,
    });

    if (visitsWithoutSummary.length === 0) {
      console.log(
        `[WebsiteSummary] No websites without summaries for user ${userId}`
      );
      trace.update({
        output: { processed: 0, errors: 0, message: "No websites to process" },
      });
      trace.end();
      return { processed: 0, errors: 0 };
    }

    console.log(
      `[WebsiteSummary] Processing ${visitsWithoutSummary.length} websites for user ${userId}`
    );

    let processed = 0;
    let errors = 0;

    // Process each website visit
    for (const visit of visitsWithoutSummary) {
      try {
        // Get related text attention for this URL
        const textAttention = await prisma.textAttention.findMany({
          where: {
            userId,
            url: visit.url,
          },
          orderBy: {
            timestamp: "asc",
          },
          take: 10, // Get up to 10 text entries for context
        });

        const concatenatedText = textAttention
          .map((t) => t.text)
          .join("\n\n");

        // Generate summary
        const summary = await generateWebsiteSummary(
          {
            url: visit.url,
            title: visit.title,
            textContent: concatenatedText || undefined,
          },
          trace
        );

        // Update website visit with summary
        await withSpan(
          trace,
          async () => {
            await prisma.websiteVisit.update({
              where: { id: visit.id },
              data: {
                summary,
                summaryGeneratedAt: new Date(),
              },
            });
          },
          {
            name: "saveWebsiteSummary",
            type: "tool",
            metadata: {
              websiteId: visit.id,
              url: visit.url,
            },
          }
        );

        processed++;
        console.log(
          `[WebsiteSummary] Generated summary for: ${visit.title} (${visit.url})`
        );
      } catch (error) {
        console.error(
          `[WebsiteSummary] Error processing ${visit.url}:`,
          error
        );
        errors++;
      }
    }

    console.log(
      `[WebsiteSummary] Completed: ${processed} processed, ${errors} errors`
    );

    trace.update({
      output: { processed, errors },
    });
    trace.end();

    return { processed, errors };
  } catch (error) {
    console.error("[WebsiteSummary] Error in batch processing:", error);
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { error: true },
    });
    trace.end();
    throw error;
  }
}

/**
 * Gets all websites with summaries for a user
 */
export async function getWebsitesWithSummaries(
  userId: string,
  limit: number = 20,
  offset: number = 0
) {
  return prisma.websiteVisit.findMany({
    where: {
      userId,
      summary: { not: null },
    },
    orderBy: {
      summaryGeneratedAt: "desc",
    },
    take: limit,
    skip: offset,
    select: {
      id: true,
      url: true,
      title: true,
      summary: true,
      summaryGeneratedAt: true,
      openedAt: true,
      activeTime: true,
    },
  });
}
