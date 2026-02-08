/**
 * Cognitive Health Routes
 *
 * API endpoints for cognitive wellness tracking and report generation.
 */

import { Hono } from "hono";
import { db } from "../lib/index.js";
import {
  getHealthMetrics,
  getRecentNudges,
  generateHealthReport,
  type TimeRange,
} from "../lib/health/index.js";

// Combined variables type for routes that support both auth methods
type CombinedAuthVariables = {
  userId?: string;
  deviceTokenId?: string;
  clerkUserId?: string;
};

const app = new Hono<{ Variables: CombinedAuthVariables }>();

// Helper to get userId from either auth method
async function getUserIdFromContext(c: {
  get: (key: string) => string | undefined;
}): Promise<string | null> {
  const deviceUserId = c.get("userId");
  if (deviceUserId) {
    return deviceUserId;
  }

  const clerkUserId = c.get("clerkUserId");
  if (clerkUserId) {
    const user = await db.user.findUnique({
      where: { clerkId: clerkUserId },
    });
    return user?.id || null;
  }

  return null;
}

// Middleware that supports both device token and Clerk auth
async function dualAuthMiddleware(c: any, next: () => Promise<void>) {
  const authHeader = c.req.header("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.slice(7);

  // First try device token auth
  const deviceToken = await db.deviceToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (deviceToken) {
    await db.deviceToken.update({
      where: { id: deviceToken.id },
      data: { lastUsedAt: new Date() },
    });
    c.set("userId", deviceToken.user.id);
    c.set("deviceTokenId", deviceToken.id);
    return next();
  }

  // Try Clerk auth
  try {
    const { verifyToken } = await import("@clerk/backend");
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    c.set("clerkUserId", payload.sub);
    return next();
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
}

/**
 * GET /cognitive-health/metrics
 * Get health metrics for a time range
 */
app.get("/metrics", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const daysParam = c.req.query("days") || "7";
  const days = parseInt(daysParam, 10);

  // Validate time range
  if (![7, 14, 30, 90].includes(days)) {
    return c.json({ error: "Invalid time range. Must be 7, 14, 30, or 90 days." }, 400);
  }

  try {
    const metrics = await getHealthMetrics(userId, days as TimeRange);

    return c.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error("[CognitiveHealth] Metrics error:", error);
    return c.json({
      error: "Failed to fetch health metrics",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

/**
 * GET /cognitive-health/nudges
 * Get recent nudge history
 */
app.get("/nudges", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const limitParam = c.req.query("limit") || "20";
  const limit = Math.min(Math.max(parseInt(limitParam, 10), 1), 100);

  try {
    const nudges = await getRecentNudges(userId, limit);

    return c.json({
      success: true,
      nudges: nudges.map((n) => ({
        id: n.id,
        type: n.type,
        message: n.message,
        confidence: n.confidence,
        reasoning: n.reasoning,
        response: n.response,
        createdAt: n.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("[CognitiveHealth] Nudges error:", error);
    return c.json({
      error: "Failed to fetch nudge history",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

/**
 * POST /cognitive-health/report
 * Generate a health report using the agent
 */
app.post("/report", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const body = await c.req.json().catch(() => ({}));
  const days = body.days || 7;

  // Validate time range
  if (![7, 14, 30, 90].includes(days)) {
    return c.json({ error: "Invalid time range. Must be 7, 14, 30, or 90 days." }, 400);
  }

  try {
    const report = await generateHealthReport(userId, days as TimeRange);

    return c.json({
      success: true,
      report: {
        id: report.id,
        timeRange: report.timeRange,
        content: report.report,
        generationSteps: report.generationSteps.map((s) => ({
          step: s.step,
          message: s.message,
          toolName: s.toolName,
          toolResult: s.toolResult,
          timestamp: s.timestamp.toISOString(),
        })),
        createdAt: report.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("[CognitiveHealth] Report generation error:", error);
    return c.json({
      error: "Failed to generate health report",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

/**
 * GET /cognitive-health/summary
 * Get a quick summary for display in cards
 */
app.get("/summary", dualAuthMiddleware, async (c) => {
  const userId = await getUserIdFromContext(c);

  if (!userId) {
    return c.json({ error: "User not found" }, 404);
  }

  const daysParam = c.req.query("days") || "7";
  const days = parseInt(daysParam, 10);

  if (![7, 14, 30, 90].includes(days)) {
    return c.json({ error: "Invalid time range. Must be 7, 14, 30, or 90 days." }, 400);
  }

  try {
    const metrics = await getHealthMetrics(userId, days as TimeRange);

    // Create a simplified summary for card display
    const summary = {
      timeRange: days,

      // Activity card
      activity: {
        averageActiveMinutes: metrics.averageDailyActiveMinutes,
        trend: metrics.activeMinutesTrend,
        trendLabel: metrics.activeMinutesTrend > 5 ? "up" : metrics.activeMinutesTrend < -5 ? "down" : "stable",
      },

      // Sleep proxy card
      sleepProxy: {
        avgFirstActivityHour: metrics.averageFirstActivityHour,
        avgLastActivityHour: metrics.averageLastActivityHour,
        lateNightMinutes: metrics.averageLateNightMinutes,
        lateNightTrend: metrics.lateNightTrend,
      },

      // Focus card
      focus: {
        averageFocusMinutes: metrics.averageFocusMinutes,
        trend: metrics.focusTrend,
        fragmentationRate: Math.round(metrics.overallFragmentationRate.fragmentationPercentage),
      },

      // Nudges card
      nudges: {
        averagePerDay: metrics.averageNudgesPerDay,
        trend: metrics.nudgeTrend,
        // Get breakdown from daily nudges
        breakdown: metrics.dailyNudges.reduce(
          (acc, day) => ({
            doomscroll: acc.doomscroll + day.doomscrollNudges,
            distraction: acc.distraction + day.distractionNudges,
            break: acc.break + day.breakNudges,
            focusDrift: acc.focusDrift + day.focusDriftNudges,
          }),
          { doomscroll: 0, distraction: 0, break: 0, focusDrift: 0 }
        ),
      },

      // Media diet card
      mediaDiet: {
        youtube: metrics.mediaDiet.youtubeMinutes,
        reading: metrics.mediaDiet.readingMinutes,
        audio: metrics.mediaDiet.audioMinutes,
        youtubePercentage: Math.round(metrics.mediaDiet.youtubePercentage),
        readingPercentage: Math.round(metrics.mediaDiet.readingPercentage),
        audioPercentage: Math.round(metrics.mediaDiet.audioPercentage),
      },

      // Attention card
      attention: {
        entropy: metrics.attentionEntropy.entropy,
        uniqueDomains: metrics.attentionEntropy.uniqueDomains,
        topDomains: metrics.attentionEntropy.topDomains.slice(0, 5),
      },
    };

    return c.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error("[CognitiveHealth] Summary error:", error);
    return c.json({
      error: "Failed to fetch summary",
      details: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

export default app;
