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
    tags: ["kaizen", "focus-inference"],
  },
  generationName: "focus-calculation",
});

const MODEL_NAME = "gemini-2.5-flash-lite";

interface AttentionData {
  textActivities: Array<{
    id: number;
    title: string;
    content: string;
    url: string | null;
    wordCount: number | null;
    readingTime: number | null;
    timestamp: Date;
  }>;
  imageActivities: Array<{
    id: number;
    title: string;
    description: string | null;
    url: string;
    timestamp: Date;
  }>;
  youtubeActivities: Array<{
    id: string;
    title: string;
    channelName: string | null;
    duration: number | null;
    watchedAt: Date;
  }>;
  audioActivities: Array<{
    id: number;
    title: string;
    artist: string | null;
    duration: number | null;
    timestamp: Date;
  }>;
}

interface FocusResult {
  score: number;
  category: "deep_work" | "shallow_work" | "distraction" | "rest";
  summary: string;
  insights: string;
}

/**
 * Fetches attention data from the database for a given time window
 */
export async function fetchAttentionData(
  windowStart: Date,
  windowEnd: Date,
  parentTrace?: Trace
): Promise<AttentionData> {
  const fetchData = async () => {
    const [textActivities, imageActivities, youtubeActivities, audioActivities] =
      await Promise.all([
        prisma.textAttention.findMany({
          where: {
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          orderBy: { timestamp: "desc" },
        }),
        prisma.imageAttention.findMany({
          where: {
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          orderBy: { timestamp: "desc" },
        }),
        prisma.youtubeAttention.findMany({
          where: {
            watchedAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          orderBy: { watchedAt: "desc" },
        }),
        prisma.audioAttention.findMany({
          where: {
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          orderBy: { timestamp: "desc" },
        }),
      ]);

    return {
      textActivities,
      imageActivities,
      youtubeActivities,
      audioActivities,
    };
  };

  // If parent trace provided, wrap in a span; otherwise execute directly
  if (parentTrace) {
    return withSpan(parentTrace, fetchData, {
      name: "fetchAttentionData",
      type: "general",
      metadata: {
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
    });
  }

  return fetchData();
}

/**
 * Formats attention data into a prompt for the AI model
 */
function formatAttentionForPrompt(data: AttentionData): string {
  const sections: string[] = [];

  if (data.textActivities.length > 0) {
    sections.push("## Text Content Consumed");
    data.textActivities.forEach((t, i) => {
      sections.push(
        `${i + 1}. "${t.title}" (${t.wordCount || "unknown"} words, ${t.readingTime || "unknown"} min read)`
      );
      sections.push(`   URL: ${t.url || "N/A"}`);
      sections.push(`   Content preview: ${t.content.substring(0, 200)}...`);
    });
  }

  if (data.imageActivities.length > 0) {
    sections.push("\n## Images Viewed");
    data.imageActivities.forEach((img, i) => {
      sections.push(`${i + 1}. "${img.title}"`);
      if (img.description) sections.push(`   Description: ${img.description}`);
    });
  }

  if (data.youtubeActivities.length > 0) {
    sections.push("\n## YouTube Videos Watched");
    data.youtubeActivities.forEach((yt, i) => {
      const duration = yt.duration
        ? `${Math.floor(yt.duration / 60)}m ${yt.duration % 60}s`
        : "unknown duration";
      sections.push(
        `${i + 1}. "${yt.title}" by ${yt.channelName || "Unknown"} (${duration})`
      );
    });
  }

  if (data.audioActivities.length > 0) {
    sections.push("\n## Audio Content");
    data.audioActivities.forEach((a, i) => {
      const duration = a.duration
        ? `${Math.floor(a.duration / 60)}m ${a.duration % 60}s`
        : "unknown duration";
      sections.push(
        `${i + 1}. "${a.title}" by ${a.artist || "Unknown"} (${duration})`
      );
    });
  }

  return sections.join("\n");
}

/**
 * Calculates focus score using Gemini AI with Opik tracking
 */
export async function calculateFocus(
  data: AttentionData,
  parentTrace?: Trace
): Promise<FocusResult> {
  const totalActivities =
    data.textActivities.length +
    data.imageActivities.length +
    data.youtubeActivities.length +
    data.audioActivities.length;

  // If no activities, return rest state
  if (totalActivities === 0) {
    return {
      score: 50,
      category: "rest",
      summary: "No attention data available for this time window.",
      insights:
        "Consider tracking your activities to get meaningful focus insights.",
    };
  }

  const attentionContext = formatAttentionForPrompt(data);

  const prompt = `You are a focus and productivity analyst. Analyze the following attention data to calculate a focus score and provide insights.

# Attention Data
${attentionContext}

# Task
Based on this attention data, provide a JSON response with:
1. score: A focus score from 0-100 (0 = completely distracted, 100 = deep focus)
2. category: One of "deep_work", "shallow_work", "distraction", or "rest"
3. summary: A 1-2 sentence summary of the focus state
4. insights: 2-3 actionable recommendations to improve focus

# Scoring Guidelines
- Deep work (80-100): Long-form reading, technical content, educational videos, focused audio
- Shallow work (50-79): Mixed content, some productive but fragmented attention
- Distraction (20-49): Entertainment-heavy, short-form content, frequent context switching
- Rest (0-19): Minimal activity, possibly on break

Respond ONLY with valid JSON matching this schema:
{
  "score": number,
  "category": "deep_work" | "shallow_work" | "distraction" | "rest",
  "summary": string,
  "insights": string
}`;

  const doCalculation = async (): Promise<FocusResult> => {
    try {
      const response = await trackedGenAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt,
      });

      const responseText = response.text || "";

      // Extract JSON from response (handle markdown code blocks)
      let jsonStr = responseText;
      const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const result = JSON.parse(jsonStr) as FocusResult;

      // Validate and clamp values
      result.score = Math.max(0, Math.min(100, result.score));
      if (
        !["deep_work", "shallow_work", "distraction", "rest"].includes(
          result.category
        )
      ) {
        result.category = "shallow_work";
      }

      // Flush traces to ensure they're sent to Comet
      await trackedGenAI.flush();

      return result;
    } catch (error) {
      console.error("Error calculating focus:", error);

      // Return a default result on error
      return {
        score: 50,
        category: "shallow_work",
        summary: "Unable to analyze focus at this time.",
        insights: "Please try again later.",
      };
    }
  };

  // If parent trace provided, wrap in a span
  if (parentTrace) {
    return withSpan(parentTrace, doCalculation, {
      name: "calculateFocus",
      type: "llm",
      metadata: {
        totalActivities,
        model: MODEL_NAME,
      },
    });
  }

  return doCalculation();
}

/**
 * Main function to compute focus from attention data and save to database
 */
export async function computeAndSaveFocus(
  windowStart: Date,
  windowEnd: Date
): Promise<{
  id: number;
  score: number;
  category: string;
  summary: string;
  insights: string | null;
}> {
  // Create a trace for the entire focus computation pipeline
  const trace = createTrace({
    name: "computeAndSaveFocus",
    tags: ["kaizen", "focus-pipeline"],
    metadata: {
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    },
  });

  try {
    // Fetch attention data (traced as a span)
    const attentionData = await fetchAttentionData(windowStart, windowEnd, trace);

    // Calculate focus using AI (traced as a span)
    const focusResult = await calculateFocus(attentionData, trace);

    // Save to database (traced as a span)
    const focus = await withSpan(
      trace,
      async () => {
        return prisma.focus.create({
          data: {
            score: focusResult.score,
            category: focusResult.category,
            summary: focusResult.summary,
            insights: focusResult.insights,
            windowStart,
            windowEnd,
            textCount: attentionData.textActivities.length,
            imageCount: attentionData.imageActivities.length,
            youtubeCount: attentionData.youtubeActivities.length,
            audioCount: attentionData.audioActivities.length,
            modelUsed: MODEL_NAME,
          },
        });
      },
      {
        name: "saveFocusToDatabase",
        type: "tool",
        metadata: {
          score: focusResult.score,
          category: focusResult.category,
        },
      }
    );

    const result = {
      id: focus.id,
      score: focus.score,
      category: focus.category,
      summary: focus.summary,
      insights: focus.insights,
    };

    // Update trace with final output
    trace.update({
      output: result,
    });
    trace.end();

    return result;
  } catch (error) {
    // Update trace with error
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { error: true },
    });
    trace.end();
    throw error;
  }
}

/**
 * Computes focus for the last N hours
 * This is a convenience wrapper that creates a time window and delegates to computeAndSaveFocus
 */
export async function computeFocusForLastHours(
  hours: number = 1
): Promise<ReturnType<typeof computeAndSaveFocus>> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - hours * 60 * 60 * 1000);

  // The actual tracing happens in computeAndSaveFocus
  return computeAndSaveFocus(windowStart, windowEnd);
}

/**
 * Gets focus history with pagination
 */
export async function getFocusHistory(limit: number = 10, offset: number = 0) {
  return prisma.focus.findMany({
    orderBy: { timestamp: "desc" },
    take: limit,
    skip: offset,
  });
}

/**
 * Gets average focus score for a time period
 */
export async function getAverageFocus(
  windowStart: Date,
  windowEnd: Date
): Promise<{ average: number; count: number }> {
  const result = await prisma.focus.aggregate({
    where: {
      timestamp: {
        gte: windowStart,
        lte: windowEnd,
      },
    },
    _avg: { score: true },
    _count: { id: true },
  });

  return {
    average: result._avg.score || 0,
    count: result._count.id,
  };
}
