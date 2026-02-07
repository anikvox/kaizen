import { createHash } from "crypto";
import type { UserSettings, Focus } from "@prisma/client";
import type { RawAttentionData } from "../attention.js";
import { extractDomain } from "../attention.js";
import { events, type FocusData } from "../events.js";
import {
  DEFAULT_FOCUS_SETTINGS,
  NON_ANSWER_PATTERNS,
  type FocusSettings,
  type FormattedAttentionItem,
} from "./types.js";

/**
 * Convert Focus model to FocusData for events
 */
export function focusToEventData(focus: Focus): FocusData {
  return {
    id: focus.id,
    item: focus.item,
    keywords: focus.keywords,
    isActive: focus.isActive,
    startedAt: focus.startedAt.toISOString(),
    endedAt: focus.endedAt?.toISOString() || null,
    lastActivityAt: focus.lastActivityAt.toISOString(),
  };
}

/**
 * Emit focus changed event
 */
export function emitFocusChange(
  userId: string,
  focus: Focus | null,
  changeType: "created" | "updated" | "ended"
): void {
  events.emitFocusChanged({
    userId,
    focus: focus ? focusToEventData(focus) : null,
    changeType,
  });
}

/**
 * Extract focus settings from UserSettings, using defaults where needed.
 */
export function extractFocusSettings(settings: UserSettings | null): FocusSettings {
  if (!settings) {
    return DEFAULT_FOCUS_SETTINGS;
  }

  return {
    focusCalculationEnabled: settings.focusCalculationEnabled ?? DEFAULT_FOCUS_SETTINGS.focusCalculationEnabled,
    focusCalculationIntervalMs: settings.focusCalculationIntervalMs ?? DEFAULT_FOCUS_SETTINGS.focusCalculationIntervalMs,
    focusInactivityThresholdMs: settings.focusInactivityThresholdMs ?? DEFAULT_FOCUS_SETTINGS.focusInactivityThresholdMs,
    focusMinDurationMs: settings.focusMinDurationMs ?? DEFAULT_FOCUS_SETTINGS.focusMinDurationMs,
  };
}

/**
 * Generate a hash for attention data to detect duplicates.
 * Used to avoid processing the same attention data multiple times.
 */
export function hashAttentionData(data: RawAttentionData): string {
  const content = JSON.stringify({
    visitIds: data.visits.map((v) => v.id).sort(),
    textIds: data.textAttentions.map((t) => t.id).sort(),
    imageIds: data.imageAttentions.map((i) => i.id).sort(),
    audioIds: data.audioAttentions.map((a) => a.id).sort(),
    youtubeIds: data.youtubeAttentions.map((y) => y.id).sort(),
  });

  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Format raw attention data into structured items for LLM prompts.
 * Groups attention by URL and extracts relevant content.
 */
export function formatAttentionData(raw: RawAttentionData): FormattedAttentionItem[] {
  const urlMap = new Map<string, FormattedAttentionItem>();

  // Helper to ensure URL entry exists
  const ensureUrl = (url: string, timestamp: Date, title?: string | null) => {
    if (!urlMap.has(url)) {
      urlMap.set(url, {
        url,
        title: title || null,
        domain: extractDomain(url),
        textContent: [],
        imageDescriptions: [],
        youtubeContent: [],
        timestamp,
      });
    }
    return urlMap.get(url)!;
  };

  // Process website visits
  for (const visit of raw.visits) {
    ensureUrl(visit.url, visit.openedAt, visit.title);
  }

  // Process text attentions
  for (const text of raw.textAttentions) {
    const item = ensureUrl(text.url, text.timestamp);
    if (text.text.trim().length > 0) {
      item.textContent.push(text.text.trim());
    }
    // Update timestamp if earlier
    if (text.timestamp < item.timestamp) {
      item.timestamp = text.timestamp;
    }
  }

  // Process image attentions
  for (const image of raw.imageAttentions) {
    const item = ensureUrl(image.url, image.timestamp);
    const description = image.summary || image.alt || image.title || "Image viewed";
    if (description.trim().length > 0) {
      item.imageDescriptions.push(description.trim());
    }
    if (image.timestamp < item.timestamp) {
      item.timestamp = image.timestamp;
    }
  }

  // Process YouTube attentions
  for (const yt of raw.youtubeAttentions) {
    const url = yt.url || `https://www.youtube.com/watch?v=${yt.videoId}`;
    const item = ensureUrl(url, yt.timestamp, yt.title);

    if (yt.event === "caption" && yt.caption) {
      item.youtubeContent.push(`Caption: ${yt.caption}`);
    } else if (yt.event === "opened" && yt.title) {
      item.youtubeContent.push(`Video: ${yt.title}${yt.channelName ? ` by ${yt.channelName}` : ""}`);
    }

    if (yt.timestamp < item.timestamp) {
      item.timestamp = yt.timestamp;
    }
  }

  // Convert to array and sort by timestamp (most recent first)
  return Array.from(urlMap.values()).sort(
    (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
  );
}

/**
 * Sanitize LLM response for focus item.
 * Handles common issues like extra words, punctuation, etc.
 */
export function sanitizeFocusItem(response: string): string | null {
  if (!response) return null;

  // Trim and clean
  let cleaned = response.trim().toLowerCase();

  // Remove common punctuation
  cleaned = cleaned.replace(/[.,!?;:'"]/g, "");

  // Check for non-answers
  for (const pattern of NON_ANSWER_PATTERNS) {
    if (cleaned === pattern || cleaned.includes(pattern)) {
      return null;
    }
  }

  // Take first 3 words if response is too long
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return null;
  if (words.length > 3) {
    cleaned = words.slice(0, 3).join(" ");
  } else {
    cleaned = words.join(" ");
  }

  // Capitalize first letter of each word for consistency
  cleaned = cleaned
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return cleaned;
}

/**
 * Parse drift detection response from LLM.
 * Expects "yes" or "no" response.
 */
export function parseDriftResponse(response: string): boolean {
  const cleaned = response.trim().toLowerCase();
  return cleaned === "yes";
}

/**
 * Deduplicate and limit keywords array.
 * Returns unique keywords with a maximum count.
 */
export function deduplicateKeywords(keywords: string[], maxCount: number = 20): string[] {
  // Normalize keywords for comparison
  const normalizedMap = new Map<string, string>();

  for (const keyword of keywords) {
    const normalized = keyword.toLowerCase().trim();
    if (!normalizedMap.has(normalized)) {
      normalizedMap.set(normalized, keyword);
    }
  }

  // Return unique keywords, limited to maxCount
  return Array.from(normalizedMap.values()).slice(0, maxCount);
}

/**
 * Check if attention data has meaningful content.
 * Returns false if there's not enough data to determine focus.
 */
export function hasMinimalContent(raw: RawAttentionData): boolean {
  // Check for any text content
  const totalTextLength = raw.textAttentions.reduce((sum, t) => sum + t.text.length, 0);
  if (totalTextLength >= 50) return true;

  // Check for meaningful images with descriptions
  const meaningfulImages = raw.imageAttentions.filter(
    (img) => (img.summary || img.alt || img.title) && img.hoverDuration > 1000
  );
  if (meaningfulImages.length >= 2) return true;

  // Check for YouTube captions
  const youtubeCaptions = raw.youtubeAttentions.filter(
    (yt) => yt.event === "caption" && yt.caption
  );
  if (youtubeCaptions.length >= 3) return true;

  // Check for visits with titles
  const titledVisits = raw.visits.filter((v) => v.title && v.activeTime > 5000);
  if (titledVisits.length >= 2) return true;

  return false;
}

/**
 * Get the earliest timestamp from attention data.
 */
export function getEarliestTimestamp(raw: RawAttentionData): Date {
  let earliest = new Date();

  for (const visit of raw.visits) {
    if (visit.openedAt < earliest) earliest = visit.openedAt;
  }
  for (const text of raw.textAttentions) {
    if (text.timestamp < earliest) earliest = text.timestamp;
  }
  for (const image of raw.imageAttentions) {
    if (image.timestamp < earliest) earliest = image.timestamp;
  }
  for (const audio of raw.audioAttentions) {
    if (audio.timestamp < earliest) earliest = audio.timestamp;
  }
  for (const yt of raw.youtubeAttentions) {
    if (yt.timestamp < earliest) earliest = yt.timestamp;
  }

  return earliest;
}

/**
 * Get the latest timestamp from attention data.
 */
export function getLatestTimestamp(raw: RawAttentionData): Date {
  let latest = new Date(0);

  for (const visit of raw.visits) {
    if (visit.openedAt > latest) latest = visit.openedAt;
    if (visit.closedAt && visit.closedAt > latest) latest = visit.closedAt;
  }
  for (const text of raw.textAttentions) {
    if (text.timestamp > latest) latest = text.timestamp;
  }
  for (const image of raw.imageAttentions) {
    if (image.timestamp > latest) latest = image.timestamp;
  }
  for (const audio of raw.audioAttentions) {
    if (audio.timestamp > latest) latest = audio.timestamp;
  }
  for (const yt of raw.youtubeAttentions) {
    if (yt.timestamp > latest) latest = yt.timestamp;
  }

  return latest.getTime() === 0 ? new Date() : latest;
}
