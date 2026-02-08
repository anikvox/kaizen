/**
 * Pulse Generation
 *
 * Generates motivational/reminder messages based on user's recent activity.
 * Pulses are short (under 15 words) personalized updates that help users
 * stay on track and remind them of their progress.
 */

import { db } from "../db.js";
import { createLLMService } from "../llm/service.js";
import { events } from "../events.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const PULSE_COUNT = 5;

export interface Pulse {
  id: string;
  userId: string;
  message: string;
  createdAt: Date;
}

/**
 * Get recent pulses for a user
 */
export async function getUserPulses(userId: string): Promise<Pulse[]> {
  const pulses = await db.pulse.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: PULSE_COUNT,
  });

  return pulses.map((p) => ({
    id: p.id,
    userId: p.userId,
    message: p.message,
    createdAt: p.createdAt,
  }));
}

/**
 * Generate new pulses for a user based on their last 24 hours of activity
 */
export async function generatePulses(userId: string): Promise<number> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - ONE_DAY_MS);

  // Fetch recent activity data
  const [websiteVisits, focuses, textAttentions] = await Promise.all([
    db.websiteVisit.findMany({
      where: {
        userId,
        openedAt: { gte: oneDayAgo },
      },
      orderBy: { openedAt: "desc" },
      take: 20,
    }),
    db.focus.findMany({
      where: {
        userId,
        updatedAt: { gte: oneDayAgo },
      },
      orderBy: { updatedAt: "desc" },
    }),
    db.textAttention.findMany({
      where: {
        userId,
        timestamp: { gte: oneDayAgo },
      },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
  ]);

  // If no activity, skip generation
  if (websiteVisits.length === 0 && focuses.length === 0) {
    return 0;
  }

  // Prepare activity summary
  const focusTopics = focuses.length > 0
    ? focuses.map((f) => f.item).join(", ")
    : "various topics";

  const totalActiveTime = websiteVisits.reduce(
    (sum, visit) => sum + (visit.activeTime || 0),
    0
  );
  const minutesSpent = Math.round(totalActiveTime / (1000 * 60));
  const hoursSpent = (totalActiveTime / (1000 * 60 * 60)).toFixed(1);

  const websiteCount = websiteVisits.length;
  const recentWebsiteTitles = websiteVisits
    .slice(0, 5)
    .map((v) => v.title)
    .filter(Boolean);

  const websiteSummaries = websiteVisits
    .filter((v) => v.summary)
    .map((v) => v.summary)
    .slice(0, 5)
    .join("\n");

  const keyTextLearnings = textAttentions
    .map((ta) => ta.text)
    .filter((text) => text && text.length > 20)
    .slice(0, 10)
    .join("\n");

  const keyLearnings = websiteSummaries
    ? `Website Summaries:\n${websiteSummaries}\n\nKey Text Content:\n${keyTextLearnings}`
    : `Key Text Content:\n${keyTextLearnings}`;

  const PROMPT = `Generate ${PULSE_COUNT} personalized learning progress updates using this data:

Focus Topics: ${focusTopics}
Total Hours: ${hoursSpent}h
Total Minutes: ${minutesSpent} mins
Resources Explored: ${websiteCount}
Recent Pages: ${recentWebsiteTitles.join(", ")}

Key Quotes from Learning:
${keyLearnings}

Create ${PULSE_COUNT} diverse updates using these patterns:
  1. Progress celebration: "You've spent Xtime [X mins OR Xh, whichever is more appropriate] on [topic] - great progress!"
  2. Content reminder: "Remember: [quote first 60 chars from Key Quotes]..."
  3. Topic connection: "Connect [topic1] with [topic2] for deeper understanding"
  4. Resource count: "You've explored X resources - try practicing what you learned"
  5. Page review: "Review your notes on [specific page title]"

Rules:
  - Use ACTUAL data from above (exact hours, real quotes, specific titles, true counts)
  - Under 15 words each
  - No generic advice or teaching
  - Casual, encouraging tone
  - Each item unique type
  - No semicolons or colons except after "Remember"

Return ONLY valid JSON array: ["Update 1", "Update 2", "Update 3", "Update 4", "Update 5"]`;

  try {
    // Get user settings for LLM config
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const llmService = createLLMService(settings);
    const provider = llmService.getProvider();

    const response = await provider.generate({
      messages: [{ role: "user", content: PROMPT }],
    });

    // Parse the response
    const jsonResponse = response.content
      .replace(/```json\n?/g, "")
      .replace(/\n?```/g, "")
      .trim();

    const pulseMessages = JSON.parse(jsonResponse);

    if (!Array.isArray(pulseMessages) || pulseMessages.length === 0) {
      console.error("[Pulse] Invalid response format:", pulseMessages);
      return 0;
    }

    // Delete old pulses for this user
    await db.pulse.deleteMany({
      where: { userId },
    });

    // Create new pulses
    const createdPulses = await db.pulse.createMany({
      data: pulseMessages.slice(0, PULSE_COUNT).map((message: string) => ({
        userId,
        message,
      })),
    });

    // Emit event for real-time updates
    const newPulses = await getUserPulses(userId);
    events.emitPulsesUpdated({ userId, pulses: newPulses });

    return createdPulses.count;
  } catch (error) {
    console.error("[Pulse] Generation failed:", error);
    return 0;
  }
}
