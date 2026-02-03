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
    tags: ["kaizen", "focus-session"],
  },
  generationName: "focus-session-detection",
});

const MODEL_NAME = "gemini-2.5-flash-lite";

// Time threshold for concatenating text attention (5 minutes)
const TEXT_CONCAT_THRESHOLD_MS = 5 * 60 * 1000;

// Default time window for new users with no previous focus (10 minutes)
const RECENT_ACTIVITY_WINDOW_MS = 10 * 60 * 1000;

interface ConcatenatedTextAttention {
  url: string;
  texts: string[];
  concatenatedText: string;
  timestamps: Date[];
}

interface RecentActivityData {
  websiteVisits: Array<{
    id: number;
    url: string;
    title: string;
    summary: string | null;
    activeTime: number;
    openedAt: Date;
  }>;
  textActivities: ConcatenatedTextAttention[];
  imageActivities: Array<{
    id: number;
    url: string;
    title: string;
    caption: string;
  }>;
  youtubeActivities: Array<{
    videoId: string;
    title: string;
    channelName: string;
    caption: string | null;
  }>;
  audioActivities: Array<{
    url: string;
    title: string;
    summary: string;
  }>;
}

interface FocusDetectionResult {
  keyword: string | null; // e.g., "React", "Machine Learning"
}

interface TimeSpentSegment {
  start: number;
  end: number | null;
}

/**
 * Concatenates text attention entries from the same URL if they're close in time
 */
export function concatenateTextAttention(
  textActivities: Array<{
    id: number;
    url: string;
    text: string;
    timestamp: Date;
  }>
): ConcatenatedTextAttention[] {
  // Group by URL
  const groupedByUrl = new Map<
    string,
    Array<{ text: string; timestamp: Date }>
  >();

  for (const activity of textActivities) {
    if (!groupedByUrl.has(activity.url)) {
      groupedByUrl.set(activity.url, []);
    }
    groupedByUrl.get(activity.url)!.push({
      text: activity.text,
      timestamp: activity.timestamp,
    });
  }

  const result: ConcatenatedTextAttention[] = [];

  // For each URL, concatenate texts that are close in time
  for (const [url, activities] of groupedByUrl.entries()) {
    // Sort by timestamp
    activities.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const texts: string[] = [];
    const timestamps: Date[] = [];
    let lastTimestamp: Date | null = null;

    for (const activity of activities) {
      if (
        lastTimestamp === null ||
        activity.timestamp.getTime() - lastTimestamp.getTime() <=
          TEXT_CONCAT_THRESHOLD_MS
      ) {
        texts.push(activity.text);
        timestamps.push(activity.timestamp);
        lastTimestamp = activity.timestamp;
      } else {
        // Gap is too large, this would start a new concatenation group
        // For simplicity, we'll just add it to the current group
        // In a more sophisticated version, we could split into multiple groups
        texts.push(activity.text);
        timestamps.push(activity.timestamp);
        lastTimestamp = activity.timestamp;
      }
    }

    result.push({
      url,
      texts,
      concatenatedText: texts.join("\n\n"),
      timestamps,
    });
  }

  return result;
}

/**
 * Fetches recent activity data for focus session detection
 */
export async function fetchRecentActivity(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  parentTrace?: Trace
): Promise<RecentActivityData> {
  const fetchData = async () => {

    const [websiteVisits, textActivities, imageActivities, youtubeActivities, audioActivities] =
      await Promise.all([
        prisma.websiteVisit.findMany({
          where: {
            userId,
            openedAt: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            id: true,
            url: true,
            title: true,
            summary: true,
            activeTime: true,
            openedAt: true,
          },
          orderBy: { openedAt: "desc" },
        }),
        prisma.textAttention.findMany({
          where: {
            userId,
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            id: true,
            url: true,
            text: true,
            timestamp: true,
          },
          orderBy: { timestamp: "desc" },
        }),
        prisma.imageAttention.findMany({
          where: {
            userId,
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            id: true,
            url: true,
            title: true,
            caption: true,
          },
          orderBy: { timestamp: "desc" },
          take: 10, // Limit images to most recent 10
        }),
        prisma.youtubeAttention.findMany({
          where: {
            userId,
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            videoId: true,
            title: true,
            channelName: true,
            caption: true,
          },
          orderBy: { timestamp: "desc" },
          take: 5, // Limit videos to most recent 5
        }),
        prisma.audioAttention.findMany({
          where: {
            userId,
            timestamp: {
              gte: windowStart,
              lte: windowEnd,
            },
          },
          select: {
            url: true,
            title: true,
            summary: true,
          },
          orderBy: { timestamp: "desc" },
          take: 5, // Limit audio to most recent 5
        }),
      ]);

    // Concatenate text attention entries from same URL
    const concatenatedTextActivities = concatenateTextAttention(textActivities);

    return {
      websiteVisits,
      textActivities: concatenatedTextActivities,
      imageActivities,
      youtubeActivities,
      audioActivities,
    };
  };

  if (parentTrace) {
    return withSpan(parentTrace, fetchData, {
      name: "fetchRecentActivity",
      type: "general",
      metadata: {
        userId,
        windowStart: windowStart.toISOString(),
        windowEnd: windowEnd.toISOString(),
      },
    });
  }

  return fetchData();
}

/**
 * Formats recent activity into a content string for AI analysis
 */
function formatActivityContent(data: RecentActivityData): string {
  const sections: string[] = [];

  if (data.websiteVisits.length > 0) {
    sections.push("Websites:");
    data.websiteVisits.forEach((w) => {
      const activeMinutes = Math.round(w.activeTime / 60000);
      sections.push(`- "${w.title}" (${activeMinutes}min)`);
      if (w.summary) {
        sections.push(`  ${w.summary}`);
      }
    });
  }

  if (data.textActivities.length > 0) {
    sections.push("\nText Content:");
    data.textActivities.forEach((t) => {
      sections.push(`- From ${t.url}:`);
      sections.push(`  ${t.concatenatedText.substring(0, 500)}...`);
    });
  }

  if (data.imageActivities.length > 0) {
    sections.push("\nImages:");
    data.imageActivities.forEach((img) => {
      sections.push(`- ${img.title}: ${img.caption}`);
    });
  }

  if (data.youtubeActivities.length > 0) {
    sections.push("\nYouTube:");
    data.youtubeActivities.forEach((yt) => {
      sections.push(`- "${yt.title}" by ${yt.channelName}`);
      if (yt.caption) {
        sections.push(`  ${yt.caption.substring(0, 200)}...`);
      }
    });
  }

  if (data.audioActivities.length > 0) {
    sections.push("\nAudio:");
    data.audioActivities.forEach((a) => {
      sections.push(`- "${a.title}": ${a.summary}`);
    });
  }

  return sections.join("\n");
}

/**
 * Detects focus drift - returns true if user switched to a different topic
 * Based on neuropilot's approach
 */
export async function detectFocusDrift(
  previousFocus: { item: string; keywords: string[] },
  recentActivity: RecentActivityData,
  parentTrace?: Trace
): Promise<boolean> {
  const doDetection = async (): Promise<boolean> => {
    const attentionContent = formatActivityContent(recentActivity);

    const prompt = `You are performing focus analysis to check if the user's attention has shifted to a new topic from their previous topic.

Previous focus: ${previousFocus.item}
Previous keywords: ${previousFocus.keywords.join(", ")}

Current attention:
${attentionContent}

---

Keep the order in context while returning inference.

Question:
Does the Current attention clearly belong to a different subject (for example, moving from tech to cooking or fashion)?
Or is it still about the same general topic or subtopic, and related concepts within the same domain?
Be sensitive to context - similar words might have different meanings in different contexts.

If it is even related or still part of the same domain then answer no (still focused).
Otherwise, if you don't find a relation between the previous focus and current attention, then answer yes (shifted).

Answer in one word (yes/no) only, no reasoning.`;

    try {
      const response = await trackedGenAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt.trim(),
      });

      const answer = response.text?.trim().toLowerCase() || "no";

      await trackedGenAI.flush();

      return answer === "yes";
    } catch (error) {
      console.error("Error detecting focus drift:", error);
      return false;
    }
  };

  if (parentTrace) {
    return withSpan(parentTrace, doDetection, {
      name: "detectFocusDrift",
      type: "llm",
      metadata: {
        model: MODEL_NAME,
        previousItem: previousFocus.item,
      },
    });
  }

  return doDetection();
}

/**
 * Detects the current focus area based on recent activity
 * Returns a keyword (1-2 words) or null if no clear focus
 */
export async function detectFocusArea(
  recentActivity: RecentActivityData,
  parentTrace?: Trace
): Promise<string | null> {
  const doDetection = async (): Promise<string | null> => {
    const attentionContent = formatActivityContent(recentActivity);

    const prompt = `You are an attention analysis model. Based on the following reading sessions,
determine the user's primary (current) focus area.

Each session represents what the user has been reading recently.

Sessions:
---
${attentionContent}
---

Think about the most recent and dominant (prominent) topic or theme the user is focusing on.

- Respond with only one or two words that best represent this topic.
- If multiple topics exist, identify the most recent or dominant one
- Consider both explicit mentions and implied context.
- Do not include punctuation, explanations, or any extra text.

If you cannot determine the user's current main focus area (probably because
the user is not reading anything), return "null"`;

    try {
      const response = await trackedGenAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt.trim(),
      });

      const focus = response.text?.trim() || "null";

      await trackedGenAI.flush();

      if (focus === "null" || focus.toLowerCase() === "null") {
        return null;
      }

      return focus.replace(".", "").trim();
    } catch (error) {
      console.error("Error detecting focus area:", error);
      return null;
    }
  };

  if (parentTrace) {
    return withSpan(parentTrace, doDetection, {
      name: "detectFocusArea",
      type: "llm",
      metadata: {
        model: MODEL_NAME,
      },
    });
  }

  return doDetection();
}

/**
 * Summarizes a list of keywords into a single focus item (1-2 words)
 */
export async function summarizeFocus(
  keywords: string[],
  parentTrace?: Trace
): Promise<string> {
  const doSummarization = async (): Promise<string> => {
    const prompt = `Reply in one or two words.
What is the single greatest common factor between the given keywords.

Note: Be specific enough to be meaningful. Consider both direct and indirect relationships.
If no clear commonality exists, identify the most significant or dominant term.

Keywords: ${keywords.join(", ")}`;

    try {
      const response = await trackedGenAI.models.generateContent({
        model: MODEL_NAME,
        contents: prompt.trim(),
      });

      const summary = response.text?.trim() || keywords[0] || "Unknown";

      await trackedGenAI.flush();

      return summary.replace(".", "").trim();
    } catch (error) {
      console.error("Error summarizing focus:", error);
      return keywords[0] || "Unknown";
    }
  };

  if (parentTrace) {
    return withSpan(parentTrace, doSummarization, {
      name: "summarizeFocus",
      type: "llm",
      metadata: {
        model: MODEL_NAME,
        keywordCount: keywords.length,
      },
    });
  }

  return doSummarization();
}

/**
 * Gets the earliest activity timestamp from recent activity
 */
function getEarliestTimestamp(data: RecentActivityData): number {
  let earliest = Date.now();

  for (const activity of data.textActivities) {
    for (const timestamp of activity.timestamps) {
      earliest = Math.min(earliest, timestamp.getTime());
    }
  }

  for (const activity of data.imageActivities) {
    // Note: imageActivities don't have timestamps in our select, skip for now
  }

  for (const visit of data.websiteVisits) {
    earliest = Math.min(earliest, visit.openedAt.getTime());
  }

  return earliest;
}

/**
 * Main function to process focus session detection and management
 * Based on neuropilot's approach
 */
export async function processFocusSession(
  userId: string,
  lastCalculationTimestamp?: number
): Promise<{
  action: "created" | "updated" | "closed" | "no_activity";
  sessionId?: number;
  item?: string;
  keywords?: string[];
}> {
  const trace = createTrace({
    name: "processFocusSession",
    tags: ["kaizen", "focus-session", "detection"],
    metadata: {
      userId,
      lastCalculationTimestamp,
    },
  });

  try {
    const now = Date.now();

    // 1. Get previous/active focus to determine the window start
    const previousFocus = await prisma.focus.findFirst({
      where: { userId },
      orderBy: { lastUpdated: "desc" },
    });

    // Determine window start: use last focus update time, or default to 10 minutes ago
    let windowStart: Date;
    if (previousFocus) {
      // Fetch activity from when the focus was last updated
      windowStart = new Date(previousFocus.lastUpdated);
    } else if (lastCalculationTimestamp) {
      // Fallback to lastCalculationTimestamp if provided
      windowStart = new Date(lastCalculationTimestamp);
    } else {
      // Default to 10 minutes ago for first-time users
      windowStart = new Date(now - RECENT_ACTIVITY_WINDOW_MS);
    }

    const windowEnd = new Date(now);

    // 2. Fetch recent activity from the determined window
    const recentActivity = await fetchRecentActivity(userId, windowStart, windowEnd, trace);

    // Count total activities
    const totalActivities =
      recentActivity.websiteVisits.length +
      recentActivity.textActivities.length +
      recentActivity.imageActivities.length +
      recentActivity.youtubeActivities.length +
      recentActivity.audioActivities.length;

    // 3. If no activity, return early (don't create idle focus)
    if (totalActivities === 0) {
      console.log(`[FocusSession] No recent activity for user ${userId}`);
      trace.update({
        output: { action: "no_activity", reason: "No recent activity" },
      });
      trace.end();
      return { action: "no_activity" };
    }

    // 4. Check for focus drift if previous focus exists
    let focusDrifted = false;
    if (previousFocus) {
      focusDrifted = await detectFocusDrift(
        {
          item: previousFocus.item,
          keywords: previousFocus.keywords,
        },
        recentActivity,
        trace
      );

      console.log(
        `[FocusSession] Focus drift detected for user ${userId}: ${focusDrifted}`
      );
    }

    // 5. Detect current focus area
    const detectedKeyword = await detectFocusArea(recentActivity, trace);

    if (!detectedKeyword) {
      console.log(
        `[FocusSession] Could not detect focus area for user ${userId}`
      );
      trace.update({
        output: { action: "no_activity", reason: "No clear focus detected" },
      });
      trace.end();
      return { action: "no_activity" };
    }

    console.log(
      `[FocusSession] Detected keyword for user ${userId}: ${detectedKeyword}`
    );

    // 6. Handle focus drift (close previous focus)
    if (focusDrifted && previousFocus) {
      const timeSpent = previousFocus.timeSpent as unknown as TimeSpentSegment[];
      const lastSegment = timeSpent[timeSpent.length - 1];

      if (lastSegment && lastSegment.end === null) {
        lastSegment.end = now;
      }

      await withSpan(
        trace,
        async () => {
          await prisma.focus.update({
            where: { id: previousFocus.id },
            data: {
              timeSpent: timeSpent as any,
              lastUpdated: new Date(now),
            },
          });
        },
        {
          name: "closePreviousFocus",
          type: "tool",
          metadata: {
            sessionId: previousFocus.id,
            item: previousFocus.item,
          },
        }
      );

      console.log(
        `[FocusSession] Closed previous focus session ${previousFocus.id} due to drift`
      );

      trace.update({
        output: {
          action: "closed",
          sessionId: previousFocus.id,
          item: previousFocus.item,
        },
      });
      trace.end();

      return {
        action: "closed",
        sessionId: previousFocus.id,
        item: previousFocus.item,
      };
    }

    // 7. Update existing focus (no drift)
    if (previousFocus && !focusDrifted) {
      // Merge keywords (add new keyword if not exists)
      const newKeywords = [detectedKeyword, ...previousFocus.keywords];
      const uniqueKeywords = Array.from(new Set(newKeywords));

      // Summarize keywords to get updated focus item
      const summarizedItem = await summarizeFocus(uniqueKeywords, trace);

      const updatedSession = await withSpan(
        trace,
        async () => {
          return prisma.focus.update({
            where: { id: previousFocus.id },
            data: {
              item: summarizedItem,
              keywords: uniqueKeywords,
              lastUpdated: new Date(now),
            },
          });
        },
        {
          name: "updateFocusSession",
          type: "tool",
          metadata: {
            sessionId: previousFocus.id,
            newKeyword: detectedKeyword,
          },
        }
      );

      console.log(
        `[FocusSession] Updated focus session ${updatedSession.id}: ${updatedSession.item}`
      );

      trace.update({
        output: {
          action: "updated",
          sessionId: updatedSession.id,
          item: updatedSession.item,
          keywords: updatedSession.keywords,
        },
      });
      trace.end();

      return {
        action: "updated",
        sessionId: updatedSession.id,
        item: updatedSession.item,
        keywords: updatedSession.keywords,
      };
    }

    // 8. Create new focus session (no previous focus or after drift closed)
    const startTimestamp = getEarliestTimestamp(recentActivity);
    const initialKeywords = [detectedKeyword];

    const newSession = await withSpan(
      trace,
      async () => {
        return prisma.focus.create({
          data: {
            userId,
            item: detectedKeyword,
            keywords: initialKeywords,
            timeSpent: [{ start: startTimestamp, end: null }],
            lastUpdated: new Date(now),
            modelUsed: MODEL_NAME,
          },
        });
      },
      {
        name: "createNewFocusSession",
        type: "tool",
        metadata: {
          item: detectedKeyword,
          keywords: initialKeywords,
        },
      }
    );

    console.log(
      `[FocusSession] Created new focus session ${newSession.id}: ${newSession.item}`
    );

    trace.update({
      output: {
        action: "created",
        sessionId: newSession.id,
        item: newSession.item,
        keywords: newSession.keywords,
      },
    });
    trace.end();

    return {
      action: "created",
      sessionId: newSession.id,
      item: newSession.item,
      keywords: newSession.keywords,
    };
  } catch (error) {
    console.error(`[FocusSession] Error processing focus session:`, error);
    trace.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: { error: true },
    });
    trace.end();
    throw error;
  }
}

/**
 * Gets the most recent focus for a user
 * Transforms to match frontend expectations
 */
export async function getActiveFocus(userId: string) {
  const session = await prisma.focus.findFirst({
    where: { userId },
    orderBy: { lastUpdated: "desc" },
  });

  if (!session) return null;

  const timeSpent = session.timeSpent as unknown as TimeSpentSegment[];
  const lastSegment = timeSpent[timeSpent.length - 1];
  const isActive = lastSegment && lastSegment.end === null;

  // Calculate window start and end from timeSpent
  const windowStart = timeSpent.length > 0 
    ? new Date(timeSpent[0].start) 
    : session.lastUpdated;
  
  const windowEnd = lastSegment?.end 
    ? new Date(lastSegment.end) 
    : new Date();

  // Transform to match frontend BackendFocus type
  return {
    id: session.id,
    score: 75, // Default score - could be calculated based on focus duration
    category: isActive ? "deep_work" : "shallow_work",
    summary: session.item, // Use item as summary
    insights: session.keywords.join(", "),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    textCount: 0, // These would need to be calculated from activity data
    imageCount: 0,
    youtubeCount: 0,
    audioCount: 0,
    modelUsed: session.modelUsed,
    traceId: session.traceId || undefined,
    timestamp: session.lastUpdated.toISOString(),
    updatedAt: session.lastUpdated.toISOString(),
    // Include original fields for backward compatibility
    item: session.item,
    keywords: session.keywords,
    timeSpent: timeSpent,
    lastUpdated: session.lastUpdated.getTime(),
    isActive,
  };
}

/**
 * Gets focus history
 * Transforms to match frontend expectations
 */
export async function getFocusHistory(
  userId: string,
  limit: number = 10,
  offset: number = 0
) {
  const sessions = await prisma.focus.findMany({
    where: { userId },
    orderBy: { lastUpdated: "desc" },
    take: limit,
    skip: offset,
  });

  // Transform each session to match frontend BackendFocus type
  return sessions.map((session) => {
    const timeSpent = session.timeSpent as unknown as TimeSpentSegment[];
    const lastSegment = timeSpent[timeSpent.length - 1];
    const isActive = lastSegment && lastSegment.end === null;

    // Calculate window start and end from timeSpent
    const windowStart = timeSpent.length > 0 
      ? new Date(timeSpent[0].start) 
      : session.lastUpdated;
    
    const windowEnd = lastSegment?.end 
      ? new Date(lastSegment.end) 
      : new Date();

    return {
      id: session.id,
      score: 75, // Default score
      category: isActive ? "deep_work" : "shallow_work",
      summary: session.item,
      insights: session.keywords.join(", "),
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
      textCount: 0,
      imageCount: 0,
      youtubeCount: 0,
      audioCount: 0,
      modelUsed: session.modelUsed,
      traceId: session.traceId || undefined,
      timestamp: session.lastUpdated.toISOString(),
      updatedAt: session.lastUpdated.toISOString(),
    };
  });
}
