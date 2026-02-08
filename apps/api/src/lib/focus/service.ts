import type { Focus, UserSettings } from "@prisma/client";
import { db } from "../db.js";
import { fetchRawAttentionData } from "../attention.js";
import { runFocusAgent, checkAndEndInactiveFocuses } from "./agent.js";
import {
  extractFocusSettings,
  hashAttentionData,
  hasMinimalContent,
  emitFocusChange,
  getEarliestTimestamp,
  getLatestTimestamp,
} from "./utils.js";
import {
  MAX_ATTENTION_WINDOW_MS,
  NO_FOCUS_ATTENTION_WINDOW_MS,
  type ProcessUserFocusResult,
  type ProcessAllUsersResult,
} from "./types.js";

// Track users currently being processed to prevent concurrent processing
const processingUsers = new Set<string>();

// Cache processed attention hashes to avoid reprocessing
const processedHashes = new Map<string, number>(); // hash -> timestamp
const HASH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

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
 * Get all active focuses for a user (multi-focus support)
 */
export async function getActiveFocuses(userId: string): Promise<Focus[]> {
  return db.focus.findMany({
    where: {
      userId,
      isActive: true,
    },
    orderBy: {
      lastActivityAt: "desc",
    },
  });
}

/**
 * Get the most recent active focus for a user (legacy single-focus compatibility)
 * @deprecated Use getActiveFocuses for multi-focus support
 */
export async function getActiveFocus(userId: string): Promise<Focus | null> {
  const focuses = await getActiveFocuses(userId);
  return focuses[0] || null;
}

/**
 * Process focus calculation for a single user using agentic multi-focus clustering.
 */
export async function processUserFocus(
  userId: string,
): Promise<ProcessUserFocusResult> {
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

    // First, check and end any inactive focuses
    const endedCount = await checkAndEndInactiveFocuses(
      userId,
      focusSettings.focusInactivityThresholdMs,
    );
    if (endedCount > 0) {
      result.focusEnded = true;
      result.inactivityDetected = true;
    }

    // Check if user has any active focuses
    const activeFocuses = await getActiveFocuses(userId);
    const hasActiveFocus = activeFocuses.length > 0;

    let attentionFrom: Date;

    if (hasActiveFocus) {
      // If there's an active focus, use the standard calculation window
      attentionFrom =
        settings?.lastFocusCalculatedAt ||
        new Date(now.getTime() - MAX_ATTENTION_WINDOW_MS);
    } else {
      // No active focus - get activity since last focus ended (or all activity if no previous focus)
      const lastEndedFocus = await db.focus.findFirst({
        where: {
          userId,
          isActive: false,
          endedAt: { not: null },
        },
        orderBy: {
          endedAt: "desc",
        },
        select: {
          endedAt: true,
        },
      });

      if (lastEndedFocus?.endedAt) {
        // Use the time when the last focus ended
        attentionFrom = lastEndedFocus.endedAt;
      } else {
        // No previous focus - use extended window to get more context for initial focus detection
        attentionFrom = new Date(now.getTime() - NO_FOCUS_ATTENTION_WINDOW_MS);
      }
    }

    // Fetch attention data
    const attentionData = await fetchRawAttentionData(userId, {
      from: attentionFrom,
      to: now,
    });

    // Skip if no new attention data
    if (!hasMinimalContent(attentionData)) {
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      result.skippedNoNewData = true;
      return result;
    }

    // Check if this attention data was already processed
    const attentionHash = hashAttentionData(attentionData);
    if (processedHashes.has(attentionHash)) {
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      result.skippedNoNewData = true;
      return result;
    }

    // Get timestamps from attention data
    // - earliest: used as startedAt for new focuses (when user actually started focusing)
    // - latest: used as lastActivityAt (when the most recent activity occurred)
    const earliestAttentionTime = getEarliestTimestamp(attentionData);
    const latestAttentionTime = getLatestTimestamp(attentionData);

    // Run the focus agent to cluster attention into focuses
    const agentResult = await runFocusAgent(
      userId,
      attentionData,
      settings,
      earliestAttentionTime,
      latestAttentionTime,
    );

    if (agentResult.success) {
      // Update results based on agent actions
      if (agentResult.focusesCreated > 0) result.focusCreated = true;
      if (
        agentResult.focusesUpdated > 0 ||
        agentResult.focusesMerged > 0 ||
        agentResult.focusesResumed > 0
      ) {
        result.focusUpdated = true;
      }
      if (agentResult.focusesEnded > 0) result.focusEnded = true;

      // Log activity
      if (
        agentResult.focusesCreated > 0 ||
        agentResult.focusesUpdated > 0 ||
        agentResult.focusesMerged > 0
      ) {
        console.log(
          `[Focus] Agent processed for user ${userId}: ` +
            `created=${agentResult.focusesCreated}, updated=${agentResult.focusesUpdated}, ` +
            `merged=${agentResult.focusesMerged}, resumed=${agentResult.focusesResumed}`,
        );
      }
    } else if (agentResult.error) {
      result.error = agentResult.error;
    }

    // Update user-level marker
    await db.userSettings.update({
      where: { userId },
      data: { lastFocusCalculatedAt: now },
    });

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
    const { userId, focusCalculationIntervalMs, lastFocusCalculatedAt } =
      userSettings;

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
  } = {},
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
