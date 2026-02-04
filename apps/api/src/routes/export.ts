import { Hono } from "hono";
import { db } from "../lib/index.js";
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

// Helper to format duration in human-readable format
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

// Helper to extract domain from URL
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
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

interface AttentionSummary {
  url: string;
  domain: string;
  title: string | null;
  visitedAt: string;
  activeTime: number;
  activeTimeFormatted: string;
  attention: {
    text: {
      totalWordsRead: number;
      excerpts: { text: string; wordsRead: number; timestamp: string }[];
    };
    images: {
      count: number;
      items: {
        src: string;
        alt: string;
        hoverDuration: number;
        hoverDurationFormatted: string;
        timestamp: string;
      }[];
    };
    audio: {
      count: number;
      items: {
        src: string;
        title: string;
        playbackDuration: number;
        playbackDurationFormatted: string;
        timestamp: string;
      }[];
    };
    youtube: {
      videos: {
        videoId: string | null;
        title: string | null;
        channelName: string | null;
        activeWatchTime: number | null;
        activeWatchTimeFormatted: string | null;
        captions: string[];
        timestamp: string;
      }[];
    };
  };
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
  const { from, to } = parseTimeRange(c);

  const user = await getUserByClerkId(clerkUserId);
  if (!user) {
    return c.json({ error: "User not found" }, 404);
  }

  // Fetch all data in parallel
  const [visits, textAttentions, imageAttentions, audioAttentions, youtubeAttentions] =
    await Promise.all([
      db.websiteVisit.findMany({
        where: {
          userId: user.id,
          openedAt: { gte: from, lte: to },
        },
        orderBy: { openedAt: "desc" },
      }),
      db.textAttention.findMany({
        where: {
          userId: user.id,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.imageAttention.findMany({
        where: {
          userId: user.id,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.audioAttention.findMany({
        where: {
          userId: user.id,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.youtubeAttention.findMany({
        where: {
          userId: user.id,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
    ]);

  // Build attention summaries keyed by URL
  const urlMap = new Map<string, AttentionSummary>();

  // Initialize from website visits
  for (const visit of visits) {
    if (!urlMap.has(visit.url)) {
      urlMap.set(visit.url, {
        url: visit.url,
        domain: extractDomain(visit.url),
        title: visit.title,
        visitedAt: visit.openedAt.toISOString(),
        activeTime: 0,
        activeTimeFormatted: "",
        attention: {
          text: { totalWordsRead: 0, excerpts: [] },
          images: { count: 0, items: [] },
          audio: { count: 0, items: [] },
          youtube: { videos: [] },
        },
      });
    }
    const summary = urlMap.get(visit.url)!;
    summary.activeTime += visit.activeTime;
    if (visit.openedAt < new Date(summary.visitedAt)) {
      summary.visitedAt = visit.openedAt.toISOString();
    }
  }

  // Add text attention
  for (const text of textAttentions) {
    if (!urlMap.has(text.url)) {
      urlMap.set(text.url, {
        url: text.url,
        domain: extractDomain(text.url),
        title: null,
        visitedAt: text.timestamp.toISOString(),
        activeTime: 0,
        activeTimeFormatted: "",
        attention: {
          text: { totalWordsRead: 0, excerpts: [] },
          images: { count: 0, items: [] },
          audio: { count: 0, items: [] },
          youtube: { videos: [] },
        },
      });
    }
    const summary = urlMap.get(text.url)!;
    summary.attention.text.totalWordsRead += text.wordsRead;
    summary.attention.text.excerpts.push({
      text: text.text.length > 500 ? text.text.slice(0, 500) + "..." : text.text,
      wordsRead: text.wordsRead,
      timestamp: text.timestamp.toISOString(),
    });
  }

  // Add image attention
  for (const image of imageAttentions) {
    if (!urlMap.has(image.url)) {
      urlMap.set(image.url, {
        url: image.url,
        domain: extractDomain(image.url),
        title: null,
        visitedAt: image.timestamp.toISOString(),
        activeTime: 0,
        activeTimeFormatted: "",
        attention: {
          text: { totalWordsRead: 0, excerpts: [] },
          images: { count: 0, items: [] },
          audio: { count: 0, items: [] },
          youtube: { videos: [] },
        },
      });
    }
    const summary = urlMap.get(image.url)!;
    summary.attention.images.count++;
    summary.attention.images.items.push({
      src: image.src,
      alt: image.alt,
      hoverDuration: image.hoverDuration,
      hoverDurationFormatted: formatDuration(image.hoverDuration),
      timestamp: image.timestamp.toISOString(),
    });
  }

  // Add audio attention
  for (const audio of audioAttentions) {
    if (!urlMap.has(audio.url)) {
      urlMap.set(audio.url, {
        url: audio.url,
        domain: extractDomain(audio.url),
        title: null,
        visitedAt: audio.timestamp.toISOString(),
        activeTime: 0,
        activeTimeFormatted: "",
        attention: {
          text: { totalWordsRead: 0, excerpts: [] },
          images: { count: 0, items: [] },
          audio: { count: 0, items: [] },
          youtube: { videos: [] },
        },
      });
    }
    const summary = urlMap.get(audio.url)!;
    summary.attention.audio.count++;
    summary.attention.audio.items.push({
      src: audio.src,
      title: audio.title,
      playbackDuration: audio.playbackDuration,
      playbackDurationFormatted: formatDuration(audio.playbackDuration),
      timestamp: audio.timestamp.toISOString(),
    });
  }

  // Add YouTube attention (group by video ID)
  const youtubeVideoMap = new Map<
    string,
    {
      videoId: string | null;
      title: string | null;
      channelName: string | null;
      url: string | null;
      activeWatchTime: number | null;
      captions: string[];
      timestamp: string;
    }
  >();

  for (const yt of youtubeAttentions) {
    const key = yt.videoId || yt.url || `unknown-${yt.id}`;
    if (!youtubeVideoMap.has(key)) {
      youtubeVideoMap.set(key, {
        videoId: yt.videoId,
        title: yt.title,
        channelName: yt.channelName,
        url: yt.url,
        activeWatchTime: null,
        captions: [],
        timestamp: yt.timestamp.toISOString(),
      });
    }
    const video = youtubeVideoMap.get(key)!;

    if (yt.event === "active-watch-time-update" && yt.activeWatchTime !== null) {
      video.activeWatchTime = Math.max(video.activeWatchTime || 0, yt.activeWatchTime);
    }
    if (yt.event === "caption" && yt.caption) {
      video.captions.push(yt.caption);
    }
    if (yt.title && !video.title) video.title = yt.title;
    if (yt.channelName && !video.channelName) video.channelName = yt.channelName;
    if (yt.url && !video.url) video.url = yt.url;
  }

  // Add YouTube videos to URL map
  for (const video of youtubeVideoMap.values()) {
    const url = video.url || `https://www.youtube.com/watch?v=${video.videoId}`;
    if (!urlMap.has(url)) {
      urlMap.set(url, {
        url,
        domain: "youtube.com",
        title: video.title,
        visitedAt: video.timestamp,
        activeTime: 0,
        activeTimeFormatted: "",
        attention: {
          text: { totalWordsRead: 0, excerpts: [] },
          images: { count: 0, items: [] },
          audio: { count: 0, items: [] },
          youtube: { videos: [] },
        },
      });
    }
    const summary = urlMap.get(url)!;
    summary.attention.youtube.videos.push({
      videoId: video.videoId,
      title: video.title,
      channelName: video.channelName,
      activeWatchTime: video.activeWatchTime,
      activeWatchTimeFormatted: video.activeWatchTime
        ? formatDuration(video.activeWatchTime)
        : null,
      captions: video.captions,
      timestamp: video.timestamp,
    });
  }

  // Format and sort results
  const pages = Array.from(urlMap.values())
    .map((summary) => ({
      ...summary,
      activeTimeFormatted: formatDuration(summary.activeTime),
    }))
    .sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime());

  // Calculate totals
  const totalWordsRead = pages.reduce(
    (sum, p) => sum + p.attention.text.totalWordsRead,
    0
  );
  const totalImages = pages.reduce((sum, p) => sum + p.attention.images.count, 0);
  const totalAudio = pages.reduce((sum, p) => sum + p.attention.audio.count, 0);
  const totalYoutubeVideos = pages.reduce(
    (sum, p) => sum + p.attention.youtube.videos.length,
    0
  );
  const totalActiveTime = pages.reduce((sum, p) => sum + p.activeTime, 0);

  return c.json({
    timeRange: {
      from: from.toISOString(),
      to: to.toISOString(),
    },
    summary: {
      totalPages: pages.length,
      totalActiveTime,
      totalActiveTimeFormatted: formatDuration(totalActiveTime),
      totalWordsRead,
      totalImagesViewed: totalImages,
      totalAudioListened: totalAudio,
      totalYoutubeVideos,
    },
    pages,
  });
});

export default app;
