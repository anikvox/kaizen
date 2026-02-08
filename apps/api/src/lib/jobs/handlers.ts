/**
 * Job Handlers
 *
 * Individual handlers for each job type.
 */

import type { PgBoss, Job } from "pg-boss";
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
import {
  MAX_ATTENTION_WINDOW_MS,
  NO_FOCUS_ATTENTION_WINDOW_MS,
} from "../focus/types.js";
import { processUserSummarization } from "../summarization.js";
import { generateQuiz } from "../quiz/service.js";
import { generatePulses } from "../pulse/index.js";
import { getBoss } from "./boss.js";
import {
  JOB_NAMES,
  type FocusCalculationPayload,
  type FocusCalculationResult,
  type QuizGenerationPayload,
  type QuizGenerationResult,
  type VisitSummarizationPayload,
  type VisitSummarizationResult,
  type PulseGenerationPayload,
  type PulseGenerationResult,
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
  job: Job<FocusCalculationPayload>,
): Promise<FocusCalculationResult> {
  const { userId, force } = job.data;

  const result: FocusCalculationResult = {
    focusCreated: false,
    focusUpdated: false,
    focusEnded: false,
  };

  try {
    cleanHashCache();

    // Get user settings
    const settings = await db.userSettings.findUnique({
      where: { userId },
    });

    const focusSettings = extractFocusSettings(settings);

    const now = new Date();

    // Check and end inactive focuses
    const endedCount = await checkAndEndInactiveFocuses(
      userId,
      focusSettings.focusInactivityThresholdMs,
    );
    if (endedCount > 0) {
      result.focusEnded = true;
      result.focusesEnded = endedCount;
    }

    // Determine attention window based on active focus status
    const activeFocuses = await getActiveFocuses(userId);
    const hasActiveFocus = activeFocuses.length > 0;

    let attentionFrom: Date;

    if (hasActiveFocus) {
      attentionFrom =
        settings?.lastFocusCalculatedAt ||
        new Date(now.getTime() - MAX_ATTENTION_WINDOW_MS);
    } else {
      const lastEndedFocus = await db.focus.findFirst({
        where: { userId, isActive: false, endedAt: { not: null } },
        orderBy: { endedAt: "desc" },
        select: { endedAt: true },
      });

      attentionFrom =
        lastEndedFocus?.endedAt ||
        new Date(now.getTime() - NO_FOCUS_ATTENTION_WINDOW_MS);
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

    const agentResult = await runFocusAgent(
      userId,
      attentionData,
      settings,
      earliestAttentionTime,
      latestAttentionTime,
    );

    if (agentResult.success) {
      if (agentResult.focusesCreated > 0) {
        result.focusCreated = true;
        result.focusesCreated = agentResult.focusesCreated;
      }
      if (
        agentResult.focusesUpdated > 0 ||
        agentResult.focusesMerged > 0 ||
        agentResult.focusesResumed > 0
      ) {
        result.focusUpdated = true;
        result.focusesUpdated =
          (agentResult.focusesUpdated || 0) +
          (agentResult.focusesMerged || 0) +
          (agentResult.focusesResumed || 0);
      }
      if (agentResult.focusesEnded > 0) {
        result.focusEnded = true;
        result.focusesEnded =
          (result.focusesEnded || 0) + agentResult.focusesEnded;
      }
    } else if (agentResult.error) {
      throw new Error(agentResult.error);
    }

    await db.userSettings.update({
      where: { userId },
      data: { lastFocusCalculatedAt: now },
    });

    return result;
  } finally {
    // Self-schedule next run (unless this was a forced run)
    // Use finally to ensure this always runs, even if the job returns early
    if (!force) {
      try {
        const settings = await db.userSettings.findUnique({
          where: { userId },
        });
        const boss = await getBoss();
        const interval = settings?.focusCalculationIntervalMs || 30000;

        await boss.send(
          JOB_NAMES.FOCUS_CALCULATION,
          { userId },
          {
            singletonKey: `focus-${userId}`,
            startAfter: Math.floor(interval / 1000), // Convert ms to seconds
            singletonSeconds: Math.floor(interval / 1000), // Prevent duplicates within interval window
          },
        );
      } catch (error) {
        console.error(
          `[Jobs] Failed to schedule next focus calculation for user ${userId}:`,
          error,
        );
      }
    }
  }
}

/**
 * Handle quiz generation job
 */
async function handleQuizGeneration(
  job: Job<QuizGenerationPayload>,
): Promise<QuizGenerationResult> {
  const { userId, answerOptionsCount, activityDays } = job.data;

  const quiz = await generateQuiz(userId, { answerOptionsCount, activityDays });

  if (!quiz) {
    const error = new Error("NO_ACTIVITY_DATA");
    (error as any).code = "NO_ACTIVITY_DATA";
    throw error;
  }

  return {
    quizId: quiz.id,
    questionCount: quiz.questions.length,
    generatedAt: quiz.generatedAt,
  };
}

/**
 * Handle visit summarization job
 */
async function handleVisitSummarization(
  job: Job<VisitSummarizationPayload>,
): Promise<VisitSummarizationResult> {
  const { userId, visitIds } = job.data;

  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const visitsSummarized = await processUserSummarization(userId);

  await db.userSettings.update({
    where: { userId },
    data: { lastSummarizationCalculatedAt: new Date() },
  });

  // Self-schedule next run (unless this was a specific visit job)
  if (!visitIds) {
    const boss = await getBoss();
    const interval = settings?.attentionSummarizationIntervalMs || 60000;

    await boss.send(
      JOB_NAMES.VISIT_SUMMARIZATION,
      { userId },
      {
        singletonKey: `visit-summarize-${userId}`,
        startAfter: Math.floor(interval / 1000), // Convert ms to seconds
        singletonSeconds: Math.floor(interval / 1000), // Prevent duplicates within interval window
      },
    );
  }

  return { visitsSummarized };
}

// Pulse generation interval: 15 minutes
const PULSE_GENERATION_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Handle pulse generation job
 */
async function handlePulseGeneration(
  job: Job<PulseGenerationPayload>,
): Promise<PulseGenerationResult> {
  const { userId } = job.data;

  try {
    const pulsesGenerated = await generatePulses(userId);
    return { pulsesGenerated };
  } finally {
    // Self-schedule next run
    try {
      const boss = await getBoss();
      await boss.send(
        JOB_NAMES.PULSE_GENERATION,
        { userId },
        {
          singletonKey: `pulse-${userId}`,
          startAfter: Math.floor(PULSE_GENERATION_INTERVAL_MS / 1000),
          singletonSeconds: Math.floor(PULSE_GENERATION_INTERVAL_MS / 1000),
        },
      );
    } catch (error) {
      console.error(
        `[Jobs] Failed to schedule next pulse generation for user ${userId}:`,
        error,
      );
    }
  }
}

/**
 * Register all job handlers with pg-boss
 */
export async function registerHandlers(boss: PgBoss): Promise<void> {
  // Focus calculation
  await boss.work<FocusCalculationPayload, FocusCalculationResult>(
    JOB_NAMES.FOCUS_CALCULATION,
    async ([job]) => {
      console.log(
        `[Jobs] Processing focus calculation for user ${job.data.userId}`,
      );
      return handleFocusCalculation(job);
    },
  );

  // Quiz generation
  await boss.work<QuizGenerationPayload, QuizGenerationResult>(
    JOB_NAMES.QUIZ_GENERATION,
    async ([job]) => {
      console.log(
        `[Jobs] Processing quiz generation for user ${job.data.userId}`,
      );
      return handleQuizGeneration(job);
    },
  );

  // Visit summarization
  await boss.work<VisitSummarizationPayload, VisitSummarizationResult>(
    JOB_NAMES.VISIT_SUMMARIZATION,
    async ([job]) => {
      console.log(
        `[Jobs] Processing visit summarization for user ${job.data.userId}`,
      );
      return handleVisitSummarization(job);
    },
  );

  // Pulse generation
  await boss.work<PulseGenerationPayload, PulseGenerationResult>(
    JOB_NAMES.PULSE_GENERATION,
    async ([job]) => {
      console.log(
        `[Jobs] Processing pulse generation for user ${job.data.userId}`,
      );
      return handlePulseGeneration(job);
    },
  );

  console.log("[Jobs] All handlers registered");
}
