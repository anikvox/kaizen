/**
 * Job Handlers
 *
 * Individual handlers for each job type.
 */

import type PgBoss from "pg-boss";
import type { Job } from "pg-boss";
import { db } from "../db.js";
import { fetchRawAttentionData } from "../attention.js";
import { runFocusAgent, checkAndEndInactiveFocuses } from "../focus/agent.js";
import { getActiveFocuses } from "../focus/service.js";
import {
  extractFocusSettings,
  hashAttentionData,
  hasMinimalContent,
  getEarliestTimestamp,
  getLatestTimestamp,
} from "../focus/utils.js";
import { MAX_ATTENTION_WINDOW_MS, NO_FOCUS_ATTENTION_WINDOW_MS } from "../focus/types.js";
import { processUserSummarization } from "../summarization.js";
import { generateQuiz } from "../quiz/service.js";
import { events } from "../events.js";
import {
  JOB_NAMES,
  type FocusCalculationPayload,
  type FocusCalculationResult,
  type QuizGenerationPayload,
  type QuizGenerationResult,
  type SummarizationPayload,
  type SummarizationResult,
} from "./types.js";

// Cache processed attention hashes to avoid reprocessing
const processedHashes = new Map<string, number>();
const HASH_CACHE_TTL_MS = 5 * 60 * 1000;

function cleanHashCache(): void {
  const now = Date.now();
  for (const [hash, timestamp] of processedHashes) {
    if (now - timestamp > HASH_CACHE_TTL_MS) {
      processedHashes.delete(hash);
    }
  }
}

/**
 * Handle focus calculation job
 */
async function handleFocusCalculation(
  job: Job<FocusCalculationPayload>
): Promise<FocusCalculationResult> {
  const { userId, force } = job.data;

  const result: FocusCalculationResult = {
    focusCreated: false,
    focusUpdated: false,
    focusEnded: false,
  };

  cleanHashCache();

  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const focusSettings = extractFocusSettings(settings);

  // Check if focus calculation is enabled (unless forced)
  if (!focusSettings.focusCalculationEnabled && !force) {
    return result;
  }

  const now = new Date();

  // Check and end inactive focuses
  const endedCount = await checkAndEndInactiveFocuses(userId, focusSettings.focusInactivityThresholdMs);
  if (endedCount > 0) {
    result.focusEnded = true;
    result.focusesEnded = endedCount;
  }

  // Determine attention window based on active focus status
  const activeFocuses = await getActiveFocuses(userId);
  const hasActiveFocus = activeFocuses.length > 0;

  let attentionFrom: Date;

  if (hasActiveFocus) {
    attentionFrom = settings?.lastFocusCalculatedAt || new Date(now.getTime() - MAX_ATTENTION_WINDOW_MS);
  } else {
    const lastEndedFocus = await db.focus.findFirst({
      where: { userId, isActive: false, endedAt: { not: null } },
      orderBy: { endedAt: "desc" },
      select: { endedAt: true },
    });

    attentionFrom = lastEndedFocus?.endedAt || new Date(now.getTime() - NO_FOCUS_ATTENTION_WINDOW_MS);
  }

  // Fetch attention data
  const attentionData = await fetchRawAttentionData(userId, {
    from: attentionFrom,
    to: now,
  });

  // Skip if no attention data
  if (!hasMinimalContent(attentionData)) {
    await db.userSettings.update({
      where: { userId },
      data: { lastFocusCalculatedAt: now },
    });
    return result;
  }

  // Check if already processed (unless forced)
  if (!force) {
    const attentionHash = hashAttentionData(attentionData);
    if (processedHashes.has(attentionHash)) {
      await db.userSettings.update({
        where: { userId },
        data: { lastFocusCalculatedAt: now },
      });
      return result;
    }
    processedHashes.set(attentionHash, Date.now());
  }

  // Run focus agent
  const earliestAttentionTime = getEarliestTimestamp(attentionData);
  const latestAttentionTime = getLatestTimestamp(attentionData);

  const agentResult = await runFocusAgent(userId, attentionData, settings, earliestAttentionTime, latestAttentionTime);

  if (agentResult.success) {
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

  await db.userSettings.update({
    where: { userId },
    data: { lastFocusCalculatedAt: now },
  });

  return result;
}

/**
 * Handle quiz generation job
 */
async function handleQuizGeneration(
  job: Job<QuizGenerationPayload>
): Promise<QuizGenerationResult> {
  const { userId, answerOptionsCount, activityDays } = job.data;

  const quiz = await generateQuiz(userId, { answerOptionsCount, activityDays });

  if (!quiz) {
    throw new Error("Not enough activity data to generate quiz");
  }

  return {
    questionCount: quiz.questions.length,
    generatedAt: quiz.generatedAt,
  };
}

/**
 * Handle summarization job
 */
async function handleSummarization(
  job: Job<SummarizationPayload>
): Promise<SummarizationResult> {
  const { userId } = job.data;

  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  if (!settings?.attentionSummarizationEnabled) {
    return { visitsSummarized: 0 };
  }

  const visitsSummarized = await processUserSummarization(userId);

  await db.userSettings.update({
    where: { userId },
    data: { lastSummarizationCalculatedAt: new Date() },
  });

  return { visitsSummarized };
}

/**
 * Register all job handlers with pg-boss
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Focus calculation - process one at a time per user
  await boss.work<FocusCalculationPayload, FocusCalculationResult>(
    JOB_NAMES.FOCUS_CALCULATION,
    { teamConcurrency: 1, teamSize: 5 },
    async (job) => {
      console.log(`[Jobs] Processing focus calculation for user ${job.data.userId}`);
      try {
        const result = await handleFocusCalculation(job);

        // Emit event for SSE
        events.emitJobCompleted({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.FOCUS_CALCULATION,
          result,
        });

        return result;
      } catch (error) {
        events.emitJobFailed({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.FOCUS_CALCULATION,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }
  );

  // Quiz generation - one at a time globally (expensive LLM calls)
  await boss.work<QuizGenerationPayload, QuizGenerationResult>(
    JOB_NAMES.QUIZ_GENERATION,
    { teamConcurrency: 1, teamSize: 2 },
    async (job) => {
      console.log(`[Jobs] Processing quiz generation for user ${job.data.userId}`);
      try {
        const result = await handleQuizGeneration(job);

        events.emitJobCompleted({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.QUIZ_GENERATION,
          result,
        });

        return result;
      } catch (error) {
        events.emitJobFailed({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.QUIZ_GENERATION,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }
  );

  // Summarization
  await boss.work<SummarizationPayload, SummarizationResult>(
    JOB_NAMES.SUMMARIZATION,
    { teamConcurrency: 1, teamSize: 5 },
    async (job) => {
      console.log(`[Jobs] Processing summarization for user ${job.data.userId}`);
      try {
        const result = await handleSummarization(job);

        events.emitJobCompleted({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.SUMMARIZATION,
          result,
        });

        return result;
      } catch (error) {
        events.emitJobFailed({
          userId: job.data.userId,
          jobId: job.id,
          name: JOB_NAMES.SUMMARIZATION,
          error: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    }
  );

  console.log("[Jobs] All handlers registered");
}
