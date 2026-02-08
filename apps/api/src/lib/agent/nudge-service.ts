/**
 * Agent Nudge Service
 *
 * Provides access to nudge history for visibility into agent decisions.
 */

import { db } from "../db.js";

export interface AgentNudgeDetail {
  id: string;
  type: string;
  message: string;
  confidence: number;
  reasoning: string | null;
  context: {
    recentDomains?: string[];
    domainSwitchCount?: number;
    averageDwellTime?: number;
    hasActiveFocus?: boolean;
    focusTopics?: string[];
    socialMediaTime?: number;
    readingTime?: number;
  };
  response: string | null;
  respondedAt: Date | null;
  createdAt: Date;
}

const MAX_NUDGES = 20;

/**
 * Get recent nudges for a user with full details
 */
export async function getUserNudges(userId: string): Promise<AgentNudgeDetail[]> {
  const nudges = await db.agentNudge.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: MAX_NUDGES,
  });

  return nudges.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    confidence: n.confidence,
    reasoning: n.reasoning,
    context: n.context as AgentNudgeDetail["context"],
    response: n.response,
    respondedAt: n.respondedAt,
    createdAt: n.createdAt,
  }));
}

/**
 * Get nudge stats for a user
 */
export async function getNudgeStats(userId: string): Promise<{
  totalNudges: number;
  acknowledgedCount: number;
  falsePositiveCount: number;
  dismissedCount: number;
  nudgesByType: Record<string, number>;
}> {
  const nudges = await db.agentNudge.findMany({
    where: { userId },
    select: {
      type: true,
      response: true,
    },
  });

  const stats = {
    totalNudges: nudges.length,
    acknowledgedCount: 0,
    falsePositiveCount: 0,
    dismissedCount: 0,
    nudgesByType: {} as Record<string, number>,
  };

  for (const nudge of nudges) {
    // Count responses
    if (nudge.response === "acknowledged") stats.acknowledgedCount++;
    else if (nudge.response === "false_positive") stats.falsePositiveCount++;
    else if (nudge.response === "dismissed") stats.dismissedCount++;

    // Count by type
    stats.nudgesByType[nudge.type] = (stats.nudgesByType[nudge.type] || 0) + 1;
  }

  return stats;
}
