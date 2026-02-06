import type { Focus, UserSettings } from "@prisma/client";
import { db } from "../db.js";
import { events, type FocusData } from "../events.js";
import { fetchRawAttentionData, type RawAttentionData } from "../attention.js";
import { createLLMService } from "../llm/service.js";
import {
  createFocusAreaPrompt,
  createFocusDriftPrompt,
  createKeywordSummaryPrompt,
  formatAttentionForPrompt,
  FOCUS_SYSTEM_PROMPT,
} from "./prompts.js";
import {
  extractFocusSettings,
  formatAttentionData,
  hashAttentionData,
  sanitizeFocusItem,
  parseDriftResponse,
  deduplicateKeywords,
  hasMinimalContent,
  getEarliestTimestamp,
  getLatestTimestamp,
} from "./utils.js";
import {
  MAX_ATTENTION_WINDOW_MS,
  MAX_KEYWORDS_BEFORE_SUMMARIZATION,
  type ProcessUserFocusResult,
  type ProcessAllUsersResult,
} from "./types.js";

// Track users currently being processed to prevent concurrent processing
const processingUsers = new Set<string>();

// Cache processed attention hashes to avoid reprocessing
const processedHashes = new Map<string, number>(); // hash -> timestamp
const HASH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Convert Focus model to FocusData for events
 */
function focusToEventData(focus: Focus): FocusData {
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
function emitFocusChange(
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
 * Clean expired hashes from the cache
 */
function cleanHashCache(): void {
  const now = Date.now();
  for (const [hash, timestamp] of processedHashes) {
    if (now - timestamp > HASH_CACHE_TTL_MS) {
      processedHashes.delete(hash);
    }
  }
}

/**
 * Get the active focus for a user
 */
export async function getActiveFocus(userId: string): Promise<Focus | null> {
  return db.focus.findFirst({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });
}

/**
 * Detect focus area from attention data using LLM
 */
async function detectFocusArea(
  attentionData: RawAttentionData,
  settings: UserSettings | null
): Promise<string | null> {
  const formattedItems = formatAttentionData(attentionData);
  if (formattedItems.length === 0) return null;

  const formattedAttention = formatAttentionForPrompt(formattedItems);
  const prompt = createFocusAreaPrompt(formattedAttention);

  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: FOCUS_SYSTEM_PROMPT,
      maxTokens: 50,
      temperature: 0,
    });

    await provider.flush();

    return sanitizeFocusItem(response.content);
  } catch (error) {
    console.error("[Focus] Failed to detect focus area:", error);
    return null;
  }
}

/**
 * Detect if user's focus has drifted from the current focus
 */
async function detectFocusDrift(
  currentFocus: Focus,
  attentionData: RawAttentionData,
  settings: UserSettings | null
): Promise<boolean> {
  const formattedItems = formatAttentionData(attentionData);
  if (formattedItems.length === 0) return false;

  const formattedAttention = formatAttentionForPrompt(formattedItems);
  const prompt = createFocusDriftPrompt(
    currentFocus.item,
    currentFocus.keywords,
    formattedAttention
  );

  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: FOCUS_SYSTEM_PROMPT,
      maxTokens: 10,
      temperature: 0,
    });

    await provider.flush();

    return parseDriftResponse(response.content);
  } catch (error) {
    console.error("[Focus] Failed to detect focus drift:", error);
    // Default to no drift on error (conservative approach)
    return false;
  }
}

/**
 * Summarize keywords into a consolidated focus item
 */
async function summarizeKeywords(
  keywords: string[],
  settings: UserSettings | null
): Promise<string> {
  if (keywords.length === 0) return "";
  if (keywords.length === 1) return keywords[0];

  const prompt = createKeywordSummaryPrompt(keywords);
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  try {
    const response = await provider.generate({
      messages: [{ role: "user", content: prompt }],
      systemPrompt: FOCUS_SYSTEM_PROMPT,
      maxTokens: 50,
      temperature: 0,
    });

    await provider.flush();

    const summarized = sanitizeFocusItem(response.content);
    return summarized || keywords[0]; // Fall back to first keyword if summarization fails
  } catch (error) {
    console.error("[Focus] Failed to summarize keywords:", error);
    return keywords[0];
  }
}

/**
 * Check and handle inactivity for a user's active focus
 */
async function checkAndHandleInactivity(
  userId: string,
  activeFocus: Focus,
  settings: UserSettings | null
): Promise<boolean> {
  const focusSettings = extractFocusSettings(settings);
  const now = new Date();

  // Get recent attention data within the inactivity threshold
  const thresholdTime = new Date(now.getTime() - focusSettings.focusInactivityThresholdMs);

  const recentAttention = await fetchRawAttentionData(userId, {
    from: thresholdTime,
    to: now,
  });

  // Check if there's any recent activity
  const hasRecentActivity =
    recentAttention.visits.length > 0 ||
    recentAttention.textAttentions.length > 0 ||
    recentAttention.imageAttentions.length > 0 ||
    recentAttention.audioAttentions.length > 0 ||
    recentAttention.youtubeAttentions.length > 0;

  if (!hasRecentActivity) {
    // Mark focus as inactive due to inactivity
    const endedFocus = await db.focus.update({
      where: { id: activeFocus.id },
      data: {
        isActive: false,
        endedAt: now,
      },
    });

    // Emit focus ended event
    emitFocusChange(userId, endedFocus, "ended");

    console.log(`[Focus] User ${userId} focus ended due to inactivity`);
    return true;
  }

  return false;
}

/**
 * Process focus calculation for a single user
 */
export async function processUserFocus(userId: string): Promise<ProcessUserFocusResult> {
  const result: ProcessUserFocusResult = {
    focusCreated: false,
    focusUpdated: false,
    focusEnded: false,
    inactivityDetected: false,
    skippedNoNewData: false,
  };

  // Prevent concurrent processing for the same user
  if (processingUsers.has(userId)) {
    return result;
  }

  processingUsers.add(userId);

  try {
    // Get user settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const focusSettings = extractFocusSettings(settings);

    // Check if focus calculation is enabled
    if (!focusSettings.focusCalculationEnabled) {
      return result;
    }

    const now = new Date();

    // Get active focus for the user
    const activeFocus = await getActiveFocus(userId);

    // Check for inactivity if there's an active focus
    if (activeFocus) {
      const wasInactive = await checkAndHandleInactivity(userId, activeFocus, settings);
      if (wasInactive) {
        // Update the marker even when ending due to inactivity
        await db.userSettings.update({
          where: { userId },
          data: { lastFocusCalculatedAt: now },
        });
        result.focusEnded = true;
        result.inactivityDetected = true;
        return result;
      }
    }

    // Use user-level marker for attention window (not focus-level)
    // This ensures we only process new attention data since last calculation
    const lastCalculatedAt = settings?.lastFocusCalculatedAt || new Date(now.getTime() - MAX_ATTENTION_WINDOW_MS);

    // Fetch attention data only since last calculation
    const attentionData = await fetchRawAttentionData(userId, {
      from: lastCalculatedAt,
      to: now,
    });

    // Skip if no new attention data - no need to call LLM
    if (!hasMinimalContent(attentionData)) {
      // Update lastActivityAt if there's an active focus
      if (activeFocus) {
        const latestActivity = getLatestTimestamp(attentionData);
        if (latestActivity.getTime() > 0) {
          await db.focus.update({
            where: { id: activeFocus.id },
            data: { lastActivityAt: latestActivity },
          });
        }
      }
      // Update the marker so we don't re-check the same empty window
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      result.skippedNoNewData = true;
      return result;
    }

    // Check if this attention data was already processed (backup check)
    const attentionHash = hashAttentionData(attentionData);
    if (processedHashes.has(attentionHash)) {
      // Update marker anyway
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      result.skippedNoNewData = true;
      return result;
    }

    // Detect new focus area from attention
    const newFocusItem = await detectFocusArea(attentionData, settings);
    if (!newFocusItem) {
      // Update marker even if no focus detected
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      return result;
    }

    if (!activeFocus) {
      // No active focus - create a new one
      const earliestTimestamp = getEarliestTimestamp(attentionData);

      const newFocus = await db.focus.create({
        data: {
          userId,
          item: newFocusItem,
          keywords: [newFocusItem],
          isActive: true,
          startedAt: earliestTimestamp,
          lastCalculatedAt: now,
          lastActivityAt: now,
        },
      });

      // Update user-level marker
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });

      // Emit focus created event
      emitFocusChange(userId, newFocus, "created");

      result.focusCreated = true;
      console.log(`[Focus] Created new focus for user ${userId}: "${newFocusItem}"`);
    } else {
      // Check for drift
      const hasDrifted = await detectFocusDrift(activeFocus, attentionData, settings);

      if (hasDrifted) {
        // Check if focus has been active long enough to allow drift
        const focusDurationMs = now.getTime() - activeFocus.startedAt.getTime();

        if (focusDurationMs >= focusSettings.focusMinDurationMs) {
          // End current focus and create new one
          const endedFocus = await db.focus.update({
            where: { id: activeFocus.id },
            data: {
              isActive: false,
              endedAt: now,
            },
          });

          // Emit focus ended event
          emitFocusChange(userId, endedFocus, "ended");

          const earliestTimestamp = getEarliestTimestamp(attentionData);

          const newFocus = await db.focus.create({
            data: {
              userId,
              item: newFocusItem,
              keywords: [newFocusItem],
              isActive: true,
              startedAt: earliestTimestamp,
              lastCalculatedAt: now,
              lastActivityAt: now,
            },
          });

          // Update user-level marker
          await db.userSettings.update({
            where: { userId },
            data: { lastFocusCalculatedAt: now },
          });

          // Emit focus created event
          emitFocusChange(userId, newFocus, "created");

          result.focusEnded = true;
          result.focusCreated = true;
          console.log(`[Focus] Drift detected for user ${userId}: "${activeFocus.item}" -> "${newFocusItem}"`);
        } else {
          // Focus too new, just add keyword instead
          const newKeywords = deduplicateKeywords([newFocusItem, ...activeFocus.keywords]);

          let updatedItem = activeFocus.item;
          if (newKeywords.length >= MAX_KEYWORDS_BEFORE_SUMMARIZATION) {
            updatedItem = await summarizeKeywords(newKeywords.slice(0, 10), settings);
          }

          const updatedFocus = await db.focus.update({
            where: { id: activeFocus.id },
            data: {
              item: updatedItem,
              keywords: newKeywords,
              lastCalculatedAt: now,
              lastActivityAt: now,
            },
          });

          // Update user-level marker
          await db.userSettings.update({
            where: { userId },
            data: { lastFocusCalculatedAt: now },
          });

          // Emit focus updated event
          emitFocusChange(userId, updatedFocus, "updated");

          result.focusUpdated = true;
        }
      } else {
        // No drift - update existing focus with new keyword
        const newKeywords = deduplicateKeywords([newFocusItem, ...activeFocus.keywords]);

        let updatedItem = activeFocus.item;
        if (newKeywords.length >= MAX_KEYWORDS_BEFORE_SUMMARIZATION) {
          updatedItem = await summarizeKeywords(newKeywords.slice(0, 10), settings);
        }

        const updatedFocus = await db.focus.update({
          where: { id: activeFocus.id },
          data: {
            item: updatedItem,
            keywords: newKeywords,
            lastCalculatedAt: now,
            lastActivityAt: now,
          },
        });

        // Update user-level marker
        await db.userSettings.update({
          where: { userId },
          data: { lastFocusCalculatedAt: now },
        });

        // Emit focus updated event
        emitFocusChange(userId, updatedFocus, "updated");

        result.focusUpdated = true;
      }
    }

    // Cache the processed hash
    processedHashes.set(attentionHash, Date.now());

    return result;
  } catch (error) {
    console.error(`[Focus] Error processing focus for user ${userId}:`, error);
    result.error = error instanceof Error ? error.message : "Unknown error";
    return result;
  } finally {
    processingUsers.delete(userId);
  }
}

/**
 * Process focus calculation for all users who have it enabled
 */
export async function processAllUsersFocus(): Promise<ProcessAllUsersResult> {
  // Clean expired hash cache entries
  cleanHashCache();

  const result: ProcessAllUsersResult = {
    usersProcessed: 0,
    focusesCreated: 0,
    focusesUpdated: 0,
    focusesEnded: 0,
    skippedNoNewData: 0,
    skippedIntervalNotElapsed: 0,
    errors: 0,
  };

  const now = new Date();

  // Get all users with focus calculation enabled, including their interval settings
  const usersWithFocus = await db.userSettings.findMany({
    where: {
      focusCalculationEnabled: true,
    },
    select: {
      userId: true,
      focusCalculationIntervalMs: true,
      lastFocusCalculatedAt: true,
    },
  });

  for (const userSettings of usersWithFocus) {
    const { userId, focusCalculationIntervalMs, lastFocusCalculatedAt } = userSettings;

    // Check if user's individual interval has elapsed
    if (lastFocusCalculatedAt) {
      const timeSinceLastCalc = now.getTime() - lastFocusCalculatedAt.getTime();
      if (timeSinceLastCalc < focusCalculationIntervalMs) {
        // User's interval hasn't elapsed yet, skip
        result.skippedIntervalNotElapsed++;
        continue;
      }
    }

    try {
      const userResult = await processUserFocus(userId);

      result.usersProcessed++;

      if (userResult.focusCreated) result.focusesCreated++;
      if (userResult.focusUpdated) result.focusesUpdated++;
      if (userResult.focusEnded) result.focusesEnded++;
      if (userResult.skippedNoNewData) result.skippedNoNewData++;
      if (userResult.error) result.errors++;
    } catch (error) {
      console.error(`[Focus] Failed to process user ${userId}:`, error);
      result.errors++;
    }
  }

  return result;
}

/**
 * Get focus history for a user
 */
export async function getUserFocusHistory(
  userId: string,
  options: {
    limit?: number;
    includeActive?: boolean;
  } = {}
): Promise<Focus[]> {
  const { limit = 50, includeActive = true } = options;

  return db.focus.findMany({
    where: {
      userId,
      ...(includeActive ? {} : { isActive: false }),
    },
    orderBy: {
      startedAt: "desc",
    },
    take: limit,
  });
}

/**
 * Manually end a user's active focus
 */
export async function endUserFocus(userId: string): Promise<Focus | null> {
  const activeFocus = await getActiveFocus(userId);
  if (!activeFocus) return null;

  const endedFocus = await db.focus.update({
    where: { id: activeFocus.id },
    data: {
      isActive: false,
      endedAt: new Date(),
    },
  });

  // Emit focus ended event
  emitFocusChange(userId, endedFocus, "ended");

  return endedFocus;
}
