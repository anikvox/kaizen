/**
 * Task Handlers
 *
 * Individual handlers for each task type in the queue.
 * Each handler processes a specific task type and returns a result.
 */

import { db } from "../db.js";
import { fetchRawAttentionData } from "../attention.js";
import { runFocusAgent, checkAndEndInactiveFocuses } from "../focus/agent.js";
import {
  extractFocusSettings,
  hashAttentionData,
  hasMinimalContent,
  getEarliestTimestamp,
  getLatestTimestamp,
} from "../focus/utils.js";
import { MAX_ATTENTION_WINDOW_MS } from "../focus/types.js";
import {
  processUserSummarization,
  processUserImageSummarization,
} from "../summarization.js";
import { generateQuiz } from "../quiz/service.js";
import { registerTaskHandler } from "./worker.js";
import {
  TASK_TYPES,
  type TaskQueueItem,
  type FocusCalculationResult,
  type QuizGenerationResult,
  type SummarizationResult,
  type ImageSummarizationResult,
  type FocusCalculationPayload,
  type QuizGenerationPayload,
  type SummarizationPayload,
  type ImageSummarizationPayload,
} from "./types.js";

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

// ============================================================================
// Focus Calculation Handler
// ============================================================================

async function handleFocusCalculation(task: TaskQueueItem): Promise<FocusCalculationResult> {
  const { userId } = task;
  const payload = task.payload as FocusCalculationPayload;

  const result: FocusCalculationResult = {
    focusCreated: false,
    focusUpdated: false,
    focusEnded: false,
    inactivityDetected: false,
    skippedNoNewData: false,
  };

  // Clean expired hash cache entries
  cleanHashCache();

  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const focusSettings = extractFocusSettings(settings);

  // Check if focus calculation is enabled (unless forced)
  if (!focusSettings.focusCalculationEnabled && !payload.force) {
    result.skippedNoNewData = true;
    return result;
  }

  const now = new Date();

  // First, check and end any inactive focuses
  const endedCount = await checkAndEndInactiveFocuses(userId, focusSettings.focusInactivityThresholdMs);
  if (endedCount > 0) {
    result.focusEnded = true;
    result.focusesEnded = endedCount;
    result.inactivityDetected = true;
  }

  // Use user-level marker for attention window
  const lastCalculatedAt = settings?.lastFocusCalculatedAt || new Date(now.getTime() - MAX_ATTENTION_WINDOW_MS);

  // Fetch attention data only since last calculation
  const attentionData = await fetchRawAttentionData(userId, {
    from: lastCalculatedAt,
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

  // Check if this attention data was already processed (unless forced)
  if (!payload.force) {
    const attentionHash = hashAttentionData(attentionData);
    if (processedHashes.has(attentionHash)) {
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      result.skippedNoNewData = true;
      return result;
    }

    // Cache will be updated after successful processing
    processedHashes.set(attentionHash, Date.now());
  }

  // Get timestamps from attention data
  const earliestAttentionTime = getEarliestTimestamp(attentionData);
  const latestAttentionTime = getLatestTimestamp(attentionData);

  // Run the focus agent to cluster attention into focuses
  const agentResult = await runFocusAgent(userId, attentionData, settings, earliestAttentionTime, latestAttentionTime);

  if (agentResult.success) {
    // Update results based on agent actions
    if (agentResult.focusesCreated > 0) {
      result.focusCreated = true;
      result.focusesCreated = agentResult.focusesCreated;
    }
    if (agentResult.focusesUpdated > 0 || agentResult.focusesMerged > 0 || agentResult.focusesResumed > 0) {
      result.focusUpdated = true;
      result.focusesUpdated = (agentResult.focusesUpdated || 0) + (agentResult.focusesMerged || 0) + (agentResult.focusesResumed || 0);
    }
    if (agentResult.focusesEnded > 0) {
      result.focusEnded = true;
      result.focusesEnded = (result.focusesEnded || 0) + agentResult.focusesEnded;
    }
  } else if (agentResult.error) {
    throw new Error(agentResult.error);
  }

  // Update user-level marker
  await db.userSettings.update({
    where: { userId },
    data: { lastFocusCalculatedAt: now },
  });

  return result;
}

// ============================================================================
// Quiz Generation Handler
// ============================================================================

async function handleQuizGeneration(task: TaskQueueItem): Promise<QuizGenerationResult> {
  const { userId } = task;
  const payload = task.payload as QuizGenerationPayload;

  // Use the quiz service to generate the quiz
  const quiz = await generateQuiz(userId, {
    answerOptionsCount: payload.answerOptionsCount,
    activityDays: payload.activityDays,
  });

  if (!quiz) {
    throw new Error("Not enough activity data to generate quiz");
  }

  return {
    questionCount: quiz.questions.length,
    generatedAt: quiz.generatedAt,
  };
}

// ============================================================================
// Summarization Handler
// ============================================================================

async function handleSummarization(task: TaskQueueItem): Promise<SummarizationResult> {
  const { userId } = task;
  const payload = task.payload as SummarizationPayload;

  // Get user settings to check if enabled
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  if (!settings?.attentionSummarizationEnabled && payload.isScheduled) {
    return { visitsSummarized: 0, skippedNoContent: 0 };
  }

  const visitsSummarized = await processUserSummarization(userId);

  // Update the marker
  await db.userSettings.update({
    where: { userId },
    data: { lastSummarizationCalculatedAt: new Date() },
  });

  return {
    visitsSummarized,
    skippedNoContent: 0, // We don't track this separately for now
  };
}

// ============================================================================
// Image Summarization Handler
// ============================================================================

async function handleImageSummarization(task: TaskQueueItem): Promise<ImageSummarizationResult> {
  const { userId } = task;
  const payload = task.payload as ImageSummarizationPayload;

  // Get user settings to check if enabled
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  if (!settings?.attentionSummarizationEnabled && payload.isScheduled) {
    return { imagesSummarized: 0, skippedOrFailed: 0 };
  }

  const imagesSummarized = await processUserImageSummarization(userId);

  return {
    imagesSummarized,
    skippedOrFailed: 0, // We don't track this separately for now
  };
}

// ============================================================================
// Register All Handlers
// ============================================================================

export function registerAllHandlers(): void {
  registerTaskHandler(TASK_TYPES.FOCUS_CALCULATION, handleFocusCalculation);
  registerTaskHandler(TASK_TYPES.QUIZ_GENERATION, handleQuizGeneration);
  registerTaskHandler(TASK_TYPES.SUMMARIZATION, handleSummarization);
  registerTaskHandler(TASK_TYPES.IMAGE_SUMMARIZATION, handleImageSummarization);

  console.log("[TaskQueue] All handlers registered");
}
