import { Hono } from "hono";
import { db } from "../lib/index.js";
import { authMiddleware, type AuthVariables } from "../middleware/index.js";

const app = new Hono<{ Variables: AuthVariables }>();

// Helper to extract domain from URL
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

// Helper to extract domain from referrer URL
function extractReferrerDomain(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const urlObj = new URL(referrer);
    return urlObj.hostname;
  } catch {
    return null;
  }
}

// Get journey data - sites visited grouped by domain with stats
app.get("/", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const userId = user.id;
  const days = Number(c.req.query("days")) || 7;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all website visits in the time period
  const visits = await db.websiteVisit.findMany({
    where: {
      userId,
      openedAt: { gte: since },
    },
    orderBy: { openedAt: "desc" },
  });

  // Group visits by domain
  const domainMap = new Map<string, {
    domain: string;
    visits: typeof visits;
    totalVisits: number;
    totalActiveTime: number;
    titles: Set<string>;
    summaries: string[];
    referrers: Map<string, number>;
    lastVisitedAt: Date;
    firstVisitedAt: Date;
  }>();

  for (const visit of visits) {
    const domain = extractDomain(visit.url);

    if (!domainMap.has(domain)) {
      domainMap.set(domain, {
        domain,
        visits: [],
        totalVisits: 0,
        totalActiveTime: 0,
        titles: new Set(),
        summaries: [],
        referrers: new Map(),
        lastVisitedAt: visit.openedAt,
        firstVisitedAt: visit.openedAt,
      });
    }

    const data = domainMap.get(domain)!;
    data.visits.push(visit);
    data.totalVisits++;
    data.totalActiveTime += visit.activeTime;
    data.titles.add(visit.title);

    if (visit.summary) {
      data.summaries.push(visit.summary);
    }

    // Track referrer domains
    const referrerDomain = extractReferrerDomain(visit.referrer);
    if (referrerDomain && referrerDomain !== domain) {
      data.referrers.set(referrerDomain, (data.referrers.get(referrerDomain) || 0) + 1);
    }

    // Update time range
    if (visit.openedAt > data.lastVisitedAt) {
      data.lastVisitedAt = visit.openedAt;
    }
    if (visit.openedAt < data.firstVisitedAt) {
      data.firstVisitedAt = visit.openedAt;
    }
  }

  // Convert to array and sort by total visits
  const sites = Array.from(domainMap.values())
    .map((data) => ({
      domain: data.domain,
      totalVisits: data.totalVisits,
      totalActiveTimeMs: data.totalActiveTime,
      uniquePages: data.titles.size,
      titles: Array.from(data.titles).slice(0, 5),
      summaries: data.summaries.slice(0, 3),
      topReferrers: Array.from(data.referrers.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([domain, count]) => ({ domain, count })),
      lastVisitedAt: data.lastVisitedAt.toISOString(),
      firstVisitedAt: data.firstVisitedAt.toISOString(),
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits);

  // Get referrer flow data (which sites led to which)
  const referrerFlows: { from: string; to: string; count: number }[] = [];
  const flowMap = new Map<string, number>();

  for (const visit of visits) {
    const toDomain = extractDomain(visit.url);
    const fromDomain = extractReferrerDomain(visit.referrer);

    if (fromDomain && fromDomain !== toDomain) {
      const key = `${fromDomain}->${toDomain}`;
      flowMap.set(key, (flowMap.get(key) || 0) + 1);
    }
  }

  for (const [key, count] of flowMap.entries()) {
    const [from, to] = key.split("->") as [string, string];
    referrerFlows.push({ from, to, count });
  }

  referrerFlows.sort((a, b) => b.count - a.count);

  // Calculate summary stats
  const totalSites = sites.length;
  const totalVisits = visits.length;
  const totalActiveTimeMs = sites.reduce((sum, s) => sum + s.totalActiveTimeMs, 0);

  return c.json({
    period: {
      days,
      since: since.toISOString(),
      until: new Date().toISOString(),
    },
    summary: {
      totalSites,
      totalVisits,
      totalActiveTimeMs,
      avgVisitsPerSite: totalSites > 0 ? Math.round(totalVisits / totalSites * 10) / 10 : 0,
    },
    sites: sites.slice(0, 50),
    referrerFlows: referrerFlows.slice(0, 20),
  });
});

// Get detailed journey for a specific domain
app.get("/:domain", authMiddleware, async (c) => {
  const clerkUserId = c.get("clerkUserId");
  const domain = c.req.param("domain");

  const user = await db.user.findUnique({
    where: { clerkId: clerkUserId },
  });

  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  const userId = user.id;
  const days = Number(c.req.query("days")) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  // Get all visits to this domain
  const visits = await db.websiteVisit.findMany({
    where: {
      userId,
      openedAt: { gte: since },
      url: { contains: domain },
    },
    orderBy: { openedAt: "desc" },
  });

  // Filter to exact domain match
  const domainVisits = visits.filter((v) => extractDomain(v.url) === domain);

  // Group by page (URL path)
  const pageMap = new Map<string, {
    url: string;
    title: string;
    visits: number;
    totalActiveTime: number;
    summary: string | null;
    lastVisited: Date;
  }>();

  for (const visit of domainVisits) {
    if (!pageMap.has(visit.url)) {
      pageMap.set(visit.url, {
        url: visit.url,
        title: visit.title,
        visits: 0,
        totalActiveTime: 0,
        summary: visit.summary,
        lastVisited: visit.openedAt,
      });
    }

    const page = pageMap.get(visit.url)!;
    page.visits++;
    page.totalActiveTime += visit.activeTime;
    if (visit.openedAt > page.lastVisited) {
      page.lastVisited = visit.openedAt;
      page.title = visit.title;
      if (visit.summary) page.summary = visit.summary;
    }
  }

  const pages = Array.from(pageMap.values())
    .map((p) => ({
      ...p,
      lastVisited: p.lastVisited.toISOString(),
    }))
    .sort((a, b) => b.visits - a.visits);

  // Get referrer sources
  const referrerCounts = new Map<string, number>();
  for (const visit of domainVisits) {
    const referrerDomain = extractReferrerDomain(visit.referrer);
    if (referrerDomain && referrerDomain !== domain) {
      referrerCounts.set(referrerDomain, (referrerCounts.get(referrerDomain) || 0) + 1);
    }
  }

  const referrers = Array.from(referrerCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count }));

  // Activity by day
  const dailyActivity = new Map<string, { date: string; visits: number; activeTimeMs: number }>();
  for (const visit of domainVisits) {
    const dateKey = visit.openedAt.toISOString().split("T")[0]!;
    if (!dailyActivity.has(dateKey)) {
      dailyActivity.set(dateKey, { date: dateKey, visits: 0, activeTimeMs: 0 });
    }
    const day = dailyActivity.get(dateKey)!;
    day.visits++;
    day.activeTimeMs += visit.activeTime;
  }

  const activity = Array.from(dailyActivity.values()).sort((a, b) => a.date.localeCompare(b.date));

  return c.json({
    domain,
    period: { days, since: since.toISOString() },
    summary: {
      totalVisits: domainVisits.length,
      uniquePages: pages.length,
      totalActiveTimeMs: domainVisits.reduce((sum, v) => sum + v.activeTime, 0),
    },
    pages: pages.slice(0, 30),
    referrers: referrers.slice(0, 10),
    dailyActivity: activity,
  });
});

export default app;
