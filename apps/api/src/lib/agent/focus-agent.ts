/**
 * Focus Guardian Agent
 *
 * An autonomous agent that monitors user activity and sends helpful nudges
 * when it detects unfocused behavior like doomscrolling.
 *
 * The agent learns from user feedback to improve over time.
 */

import { db } from "../db.js";
import { createLLMService } from "../llm/service.js";
import { events } from "../events.js";

const ANALYSIS_WINDOW_MS = 15 * 60 * 1000; // Look at last 15 minutes
const MIN_ACTIVITY_FOR_ANALYSIS = 5; // Need at least 5 attention events to analyze

export interface NudgeContext {
  recentDomains: string[];
  domainSwitchCount: number;
  averageDwellTime: number;
  hasActiveFocus: boolean;
  focusTopics: string[];
  sessionDuration: number;
  socialMediaTime: number;
  readingTime: number;
}

export interface AgentDecision {
  shouldNudge: boolean;
  nudgeType: "doomscroll" | "distraction" | "break" | "focus_drift" | "encouragement";
  message: string;
  confidence: number;
  reasoning: string;
  context: NudgeContext;
}

// Social media and entertainment domains
const SOCIAL_MEDIA_DOMAINS = [
  "twitter.com", "x.com", "facebook.com", "instagram.com", "tiktok.com",
  "reddit.com", "linkedin.com/feed", "threads.net", "bsky.app",
  "youtube.com/shorts", "youtube.com/feed"
];

const ENTERTAINMENT_DOMAINS = [
  "netflix.com", "hulu.com", "disneyplus.com", "primevideo.com",
  "twitch.tv", "9gag.com", "imgur.com", "buzzfeed.com"
];

/**
 * Run the focus guardian agent for a user
 */
export async function runFocusAgent(userId: string): Promise<AgentDecision | null> {
  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  if (!settings?.focusAgentEnabled) {
    return null;
  }

  // Check cooldown - don't nudge too frequently
  const lastNudge = await db.agentNudge.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });

  if (lastNudge) {
    const timeSinceLastNudge = Date.now() - lastNudge.createdAt.getTime();
    if (timeSinceLastNudge < settings.focusAgentCooldownMs) {
      return null;
    }
  }

  // Gather context
  const context = await gatherContext(userId);

  if (!context) {
    return null; // Not enough data to analyze
  }

  // Get past feedback to inform the decision
  const recentFeedback = await getRecentFeedback(userId);

  // Make decision using LLM
  const decision = await makeDecision(userId, context, recentFeedback, settings.focusAgentSensitivity);

  if (!decision.shouldNudge) {
    return null;
  }

  // Store the nudge
  const nudge = await db.agentNudge.create({
    data: {
      userId,
      type: decision.nudgeType,
      message: decision.message,
      context: context as object,
      confidence: decision.confidence,
      reasoning: decision.reasoning,
    },
  });

  // Emit event for real-time delivery
  events.emitAgentNudge({
    userId,
    nudge: {
      id: nudge.id,
      type: nudge.type,
      message: nudge.message,
      createdAt: nudge.createdAt,
    },
  });

  // Update last run time
  await db.userSettings.update({
    where: { userId },
    data: { focusAgentLastRunAt: new Date() },
  });

  return decision;
}

/**
 * Gather context about recent user activity
 */
async function gatherContext(userId: string): Promise<NudgeContext | null> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - ANALYSIS_WINDOW_MS);

  // Get recent attention data
  const [textAttentions, websiteVisits, focuses] = await Promise.all([
    db.textAttention.findMany({
      where: { userId, timestamp: { gte: windowStart } },
      orderBy: { timestamp: "desc" },
    }),
    db.websiteVisit.findMany({
      where: { userId, openedAt: { gte: windowStart } },
      orderBy: { openedAt: "desc" },
    }),
    db.focus.findMany({
      where: { userId, isActive: true },
    }),
  ]);

  const totalEvents = textAttentions.length + websiteVisits.length;
  if (totalEvents < MIN_ACTIVITY_FOR_ANALYSIS) {
    return null;
  }

  // Analyze domains
  const domains = new Set<string>();
  let socialMediaTime = 0;

  for (const visit of websiteVisits) {
    try {
      const domain = new URL(visit.url).hostname;
      domains.add(domain);

      const activeTime = visit.activeTime || 0;

      if (SOCIAL_MEDIA_DOMAINS.some((sm) => visit.url.includes(sm)) ||
          ENTERTAINMENT_DOMAINS.some((ent) => visit.url.includes(ent))) {
        socialMediaTime += activeTime;
      }
    } catch {
      // Invalid URL
    }
  }

  // Calculate reading time from text attention
  let readingTime = 0;
  for (const ta of textAttentions) {
    // Estimate reading time: ~200 words per minute
    readingTime += (ta.wordsRead / 200) * 60 * 1000;
  }

  // Calculate average dwell time
  const totalActiveTime = websiteVisits.reduce((sum, v) => sum + (v.activeTime || 0), 0);
  const averageDwellTime = websiteVisits.length > 0
    ? totalActiveTime / websiteVisits.length
    : 0;

  // Session duration (from first event to now)
  const earliestEvent = websiteVisits.length > 0
    ? websiteVisits[websiteVisits.length - 1].openedAt
    : now;
  const sessionDuration = now.getTime() - earliestEvent.getTime();

  return {
    recentDomains: Array.from(domains),
    domainSwitchCount: domains.size,
    averageDwellTime,
    hasActiveFocus: focuses.length > 0,
    focusTopics: focuses.map((f) => f.item),
    sessionDuration,
    socialMediaTime,
    readingTime,
  };
}

/**
 * Get recent feedback to learn from
 */
async function getRecentFeedback(userId: string) {
  const recentNudges = await db.agentNudge.findMany({
    where: {
      userId,
      response: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const falsePositiveRate = recentNudges.length > 0
    ? recentNudges.filter((n) => n.response === "false_positive").length / recentNudges.length
    : 0;

  const acknowledgedRate = recentNudges.length > 0
    ? recentNudges.filter((n) => n.response === "acknowledged").length / recentNudges.length
    : 0;

  return {
    totalFeedback: recentNudges.length,
    falsePositiveRate,
    acknowledgedRate,
    recentNudges: recentNudges.slice(0, 5),
  };
}

/**
 * Use LLM to make a decision about whether to nudge
 */
async function makeDecision(
  userId: string,
  context: NudgeContext,
  feedback: { falsePositiveRate: number; acknowledgedRate: number; totalFeedback: number },
  sensitivity: number
): Promise<AgentDecision> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  const prompt = `You are a focus guardian assistant. Analyze the user's recent activity and decide if they need a gentle nudge.

RECENT ACTIVITY (last 15 minutes):
- Domains visited: ${context.recentDomains.join(", ")}
- Number of different sites: ${context.domainSwitchCount}
- Average time per page: ${Math.round(context.averageDwellTime / 1000)}s
- Social media/entertainment time: ${Math.round(context.socialMediaTime / 1000)}s
- Reading time (estimated): ${Math.round(context.readingTime / 1000)}s
- Session duration: ${Math.round(context.sessionDuration / 60000)} minutes
- Has active focus: ${context.hasActiveFocus ? `Yes (${context.focusTopics.join(", ")})` : "No"}

USER FEEDBACK HISTORY:
- Total feedback received: ${feedback.totalFeedback}
- False positive rate: ${(feedback.falsePositiveRate * 100).toFixed(0)}%
- Acknowledged rate: ${(feedback.acknowledgedRate * 100).toFixed(0)}%
- Sensitivity setting: ${sensitivity} (0=less nudges, 1=more nudges)

DETECTION PATTERNS:
1. Doomscrolling: High social media time, rapid switching, low reading time
2. Distraction: Many domain switches, no focus, short dwell times
3. Focus drift: Has focus but activity doesn't match focus topics
4. Break needed: Long session with declining engagement

IMPORTANT GUIDELINES:
- Be CONSERVATIVE. Only nudge when clearly needed.
- High false positive rate = be MORE conservative
- If user is reading deeply, don't interrupt
- If they have an active focus and seem on-topic, don't nudge
- Prefer to NOT nudge unless behavior is clearly problematic

Respond with ONLY valid JSON:
{
  "shouldNudge": boolean,
  "nudgeType": "doomscroll" | "distraction" | "break" | "focus_drift" | "encouragement",
  "message": "A short, friendly message (under 100 chars). Use 'you' not 'the user'",
  "confidence": 0.0 to 1.0,
  "reasoning": "Brief explanation of why"
}`;

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
    });

    const jsonStr = response.content
      .replace(/```json\n?/g, "")
      .replace(/\n?```/g, "")
      .trim();

    const decision = JSON.parse(jsonStr);

    // Apply sensitivity adjustment
    // If sensitivity is low (0.3) and confidence is borderline (0.6), don't nudge
    const adjustedThreshold = 0.5 + (1 - sensitivity) * 0.3;
    if (decision.confidence < adjustedThreshold) {
      decision.shouldNudge = false;
      decision.reasoning += ` (confidence ${decision.confidence} below threshold ${adjustedThreshold.toFixed(2)})`;
    }

    return {
      ...decision,
      context,
    };
  } catch (error) {
    console.error("[FocusAgent] Decision failed:", error);
    return {
      shouldNudge: false,
      nudgeType: "doomscroll",
      message: "",
      confidence: 0,
      reasoning: "LLM call failed",
      context,
    };
  }
}

/**
 * Record user's response to a nudge and update sensitivity
 */
export async function recordNudgeResponse(
  nudgeId: string,
  userId: string,
  response: "acknowledged" | "false_positive" | "dismissed"
): Promise<void> {
  // Update the nudge
  await db.agentNudge.update({
    where: { id: nudgeId },
    data: {
      response,
      respondedAt: new Date(),
    },
  });

  // Adjust sensitivity based on feedback
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  if (settings) {
    let newSensitivity = settings.focusAgentSensitivity;

    if (response === "false_positive") {
      // Decrease sensitivity (fewer nudges)
      newSensitivity = Math.max(0.1, newSensitivity - 0.05);
    } else if (response === "acknowledged") {
      // Slightly increase sensitivity (nudge was helpful)
      newSensitivity = Math.min(0.9, newSensitivity + 0.02);
    }
    // "dismissed" doesn't change sensitivity

    if (newSensitivity !== settings.focusAgentSensitivity) {
      await db.userSettings.update({
        where: { userId },
        data: { focusAgentSensitivity: newSensitivity },
      });
    }
  }
}
