import { Hono } from "hono";
import { db, formatDuration, extractDomain, getAttentionData } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: AuthVariables }>();

// Helper to parse time range query params
function parseTimeRange(c: { req: { query: (key: string) => string | undefined } }) {
  const from = c.req.query("from");
  const to = c.req.query("to");

  return {
    from: from ? new Date(from) : new Date(Date.now() - 24 * 60 * 60 * 1000), // Default: last 24 hours
    to: to ? new Date(to) : new Date(),
  };
}

// Helper to get user by clerk ID
async function getUserByClerkId(clerkUserId: string) {
  return db.user.findUnique({
    where: { clerkId: clerkUserId },
  });
}

interface WebsiteActivitySummary {
  domain: string;
  totalVisits: number;
  totalActiveTime: number;
  totalActiveTimeFormatted: string;
  pages: {
    url: string;
    title: string;
    visitCount: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
    firstVisit: string;
    lastVisit: string;
  }[];
}

/**
 * GET /export/website-activity
 *
 * Fetches all website activity for a time range in a clean, structured format.
 *
 * Query params:
 * - from: ISO date string (default: 24 hours ago)
 * - to: ISO date string (default: now)
 *
 * Returns aggregated website activity grouped by domain.
 */
app.get("/website-activity", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const { from, to } = parseTimeRange(c);

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const visits = await db.websiteVisit.findMany({
    where: {
      userId: user.id,
      openedAt: {
        gte: from,
        lte: to,
      },
    },
    orderBy: { openedAt: "desc" },
  });

  // Aggregate by domain
  const domainMap = new Map<string, WebsiteActivitySummary>();

  for (const visit of visits) {
    const domain = extractDomain(visit.url);

    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        totalVisits: 0,
        totalActiveTime: 0,
        totalActiveTimeFormatted: "",
        pages: [],
      });
    }

    const summary = domainMap.get(domain)!;
    summary.totalVisits++;
    summary.totalActiveTime += visit.activeTime;

    // Find or create page entry
    let page = summary.pages.find((p) => p.url === visit.url);
    if (!page) {
      page = {
        url: visit.url,
        title: visit.title,
        visitCount: 0,
        totalActiveTime: 0,
        totalActiveTimeFormatted: "",
        firstVisit: visit.openedAt.toISOString(),
        lastVisit: visit.openedAt.toISOString(),
      };
      summary.pages.push(page);
    }

    page.visitCount++;
    page.totalActiveTime += visit.activeTime;
    if (visit.openedAt < new Date(page.firstVisit)) {
      page.firstVisit = visit.openedAt.toISOString();
    }
    if (visit.openedAt > new Date(page.lastVisit)) {
      page.lastVisit = visit.openedAt.toISOString();
    }
  }

  // Format durations and sort
  const websites = Array.from(domainMap.values())
    .map((summary) => ({
      ...summary,
      totalActiveTimeFormatted: formatDuration(summary.totalActiveTime),
      pages: summary.pages
        .map((page) => ({
          ...page,
          totalActiveTimeFormatted: formatDuration(page.totalActiveTime),
        }))
        .sort((a, b) => b.totalActiveTime - a.totalActiveTime),
    }))
    .sort((a, b) => b.totalActiveTime - a.totalActiveTime);

  return c.json({
    timeRange: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    summary: {
      totalWebsites: websites.length,
      totalVisits: visits.length,
      totalActiveTime: visits.reduce((sum, v) => sum + v.activeTime, 0),
      totalActiveTimeFormatted: formatDuration(
        visits.reduce((sum, v) => sum + v.activeTime, 0)
      ),
    },
    websites,
  });
});

/**
 * GET /export/attention
 *
 * Fetches all attention data for a time range in a clean, structured format.
 * Combines website visits with text, image, audio, and YouTube attention data.
 *
 * Query params:
 * - from: ISO date string (default: 24 hours ago)
 * - to: ISO date string (default: now)
 *
 * Returns attention data grouped by URL/page.
 */
app.get("/attention", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const timeRange = parseTimeRange(c);

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const data = await getAttentionData(user.id, timeRange);
  return c.json(data);
});

export default app;
