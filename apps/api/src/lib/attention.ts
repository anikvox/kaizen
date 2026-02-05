import { db } from "./db.js";

/**
 * Time range for attention data queries
 */
export interface AttentionTimeRange {
  from: Date;
  to: Date;
}

/**
 * Raw attention data fetched from the database
 */
export interface RawAttentionData {
  visits: Awaited<ReturnType<typeof db.websiteVisit.findMany>>;
  textAttentions: Awaited<ReturnType<typeof db.textAttention.findMany>>;
  imageAttentions: Awaited<ReturnType<typeof db.imageAttention.findMany>>;
  audioAttentions: Awaited<ReturnType<typeof db.audioAttention.findMany>>;
  youtubeAttentions: Awaited<ReturnType<typeof db.youtubeAttention.findMany>>;
}

/**
 * Structured attention summary for a single page
 */
export interface AttentionSummary {
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
 * Full attention response with time range and summary statistics
 */
export interface AttentionDataResponse {
  timeRange: {
    from: string;
    to: string;
  };
  summary: {
    totalPages: number;
    totalActiveTime: number;
    totalActiveTimeFormatted: string;
    totalWordsRead: number;
    totalImagesViewed: number;
    totalAudioListened: number;
    totalYoutubeVideos: number;
  };
  pages: AttentionSummary[];
}

/**
 * Format duration in milliseconds to human-readable format
 */
export function formatDuration(ms: number): string {
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

/**
 * Extract domain from a URL
 */
export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * Fetch raw attention data for a user within a time range
 */
export async function fetchRawAttentionData(
  userId: string,
  timeRange: AttentionTimeRange
): Promise<RawAttentionData> {
  const { from, to } = timeRange;

  const [visits, textAttentions, imageAttentions, audioAttentions, youtubeAttentions] =
    await Promise.all([
      db.websiteVisit.findMany({
        where: {
          userId,
          openedAt: { gte: from, lte: to },
        },
        orderBy: { openedAt: "desc" },
      }),
      db.textAttention.findMany({
        where: {
          userId,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.imageAttention.findMany({
        where: {
          userId,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.audioAttention.findMany({
        where: {
          userId,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
      db.youtubeAttention.findMany({
        where: {
          userId,
          timestamp: { gte: from, lte: to },
        },
        orderBy: { timestamp: "desc" },
      }),
    ]);

  return { visits, textAttentions, imageAttentions, audioAttentions, youtubeAttentions };
}

/**
 * Aggregate raw attention data into structured summaries grouped by URL
 */
export function aggregateAttentionData(
  raw: RawAttentionData,
  timeRange: AttentionTimeRange
): AttentionDataResponse {
  const { visits, textAttentions, imageAttentions, audioAttentions, youtubeAttentions } = raw;
  const { from, to } = timeRange;

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

  // Helper to ensure URL entry exists
  const ensureUrl = (url: string, timestamp: Date) => {
    if (!urlMap.has(url)) {
      urlMap.set(url, {
        url,
        domain: extractDomain(url),
        title: null,
        visitedAt: timestamp.toISOString(),
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
  };

  // Add text attention
  for (const text of textAttentions) {
    ensureUrl(text.url, text.timestamp);
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
    ensureUrl(image.url, image.timestamp);
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
    ensureUrl(audio.url, audio.timestamp);
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
    ensureUrl(url, new Date(video.timestamp));
    const summary = urlMap.get(url)!;
    if (!summary.title && video.title) {
      summary.title = video.title;
    }
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
  const totalWordsRead = pages.reduce((sum, p) => sum + p.attention.text.totalWordsRead, 0);
  const totalImages = pages.reduce((sum, p) => sum + p.attention.images.count, 0);
  const totalAudio = pages.reduce((sum, p) => sum + p.attention.audio.count, 0);
  const totalYoutubeVideos = pages.reduce(
    (sum, p) => sum + p.attention.youtube.videos.length,
    0
  );
  const totalActiveTime = pages.reduce((sum, p) => sum + p.activeTime, 0);

  return {
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
  };
}

/**
 * Fetch and aggregate attention data for a user within a time range
 */
export async function getAttentionData(
  userId: string,
  timeRange: AttentionTimeRange
): Promise<AttentionDataResponse> {
  const raw = await fetchRawAttentionData(userId, timeRange);
  return aggregateAttentionData(raw, timeRange);
}
