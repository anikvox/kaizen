/**
 * Quiz service - Generates quiz questions on-demand via task queue
 *
 * This service has been refactored to use the persistent task queue
 * instead of the in-memory p-queue.
 */

import { db } from "../db.js";
import { getAttentionData } from "../attention.js";
import { serializeAttentionCompact } from "../llm/prompts.js";
import { createLLMService } from "../llm/service.js";
import { getUserFocusHistory } from "../focus/index.js";
import type { UserSettings } from "@prisma/client";
import type { QuizSettings, GeneratedQuiz, QuizGenerationContext } from "./types.js";
import { DEFAULT_QUIZ_SETTINGS } from "./types.js";
import { createQuizPrompt, parseQuizResponse } from "./prompts.js";
import { LLM_CONFIG, getPrompt, PROMPT_NAMES } from "../llm/index.js";
import {
  sendQuizGeneration,
  getJob,
  getUserJobsStatus,
} from "../jobs/index.js";
import { JOB_NAMES } from "../jobs/types.js";

const QUESTION_COUNT = 10;

/**
 * Extract quiz settings from user settings
 */
export function extractQuizSettings(settings: UserSettings | null): QuizSettings {
  return {
    answerOptionsCount: settings?.quizAnswerOptionsCount ?? DEFAULT_QUIZ_SETTINGS.answerOptionsCount,
    activityDays: settings?.quizActivityDays ?? DEFAULT_QUIZ_SETTINGS.activityDays,
  };
}

/**
 * Start quiz generation via job queue.
 * Returns the job ID immediately, client should poll for status.
 */
export async function startQuizGeneration(userId: string): Promise<{
  jobId: string | null;
  status: string;
}> {
  const jobId = await sendQuizGeneration(userId);

  console.log(`[Quiz] Created job ${jobId} for user ${userId}`);

  return {
    jobId,
    status: "created",
  };
}

/**
 * Get quiz job status and result.
 */
export async function getQuizJobStatus(jobId: string, userId: string): Promise<{
  status: string;
  quiz?: GeneratedQuiz;
  error?: string;
} | null> {
  const job = await getJob(jobId);

  if (!job) {
    return null;
  }

  // Check that job belongs to user
  const data = job.data as { userId?: string };
  if (data.userId !== userId) {
    return null;
  }

  if (job.state === "completed" && job.output) {
    return {
      status: job.state,
      quiz: job.output as unknown as GeneratedQuiz,
    };
  }

  if (job.state === "failed") {
    return {
      status: job.state,
      error: "Quiz generation failed",
    };
  }

  return {
    status: job.state,
  };
}

/**
 * Generate quiz directly (used by task handler)
 * This is the core generation logic without queue management.
 */
export async function generateQuiz(
  userId: string,
  options?: { answerOptionsCount?: number; activityDays?: number }
): Promise<GeneratedQuiz | null> {
  console.log(`[Quiz] Starting generation for user ${userId}`);

  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const answerOptionsCount = options?.answerOptionsCount ?? settings?.quizAnswerOptionsCount ?? DEFAULT_QUIZ_SETTINGS.answerOptionsCount;
  const activityDays = options?.activityDays ?? settings?.quizActivityDays ?? DEFAULT_QUIZ_SETTINGS.activityDays;

  console.log(`[Quiz] Settings: answerOptionsCount=${answerOptionsCount}, activityDays=${activityDays}`);

  // Gather context for quiz generation
  const context = await gatherQuizContext(userId, activityDays);

  if (!context) {
    console.log(`[Quiz] Not enough activity data to generate quiz`);
    return null;
  }

  // Generate questions using LLM
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  const prompt = createQuizPrompt(context, answerOptionsCount, QUESTION_COUNT);

  console.log(`[Quiz] Calling LLM to generate ${QUESTION_COUNT} questions`);

  // Fetch prompt from Opik (with local fallback)
  const systemPrompt = await getPrompt(PROMPT_NAMES.QUIZ_GENERATION);

  const response = await provider.generate({
    messages: [{ role: "user", content: prompt }],
    systemPrompt,
    maxTokens: LLM_CONFIG.quizGeneration.maxTokens,
    temperature: LLM_CONFIG.quizGeneration.temperature,
  });

  await provider.flush();

  const parsed = parseQuizResponse(
    response.content,
    QUESTION_COUNT,
    answerOptionsCount
  );

  if (!parsed.success || !parsed.questions) {
    console.error(`[Quiz] Failed to parse LLM response:`, parsed.error);
    throw new Error(parsed.error || "Failed to parse quiz response");
  }

  console.log(`[Quiz] Successfully generated ${parsed.questions.length} questions`);

  return {
    questions: parsed.questions.map((q, index) => ({
      id: `q-${index}`,
      questionIndex: index,
      question: q.question,
      options: q.options,
      correctIndex: q.correct_index,
    })),
    generatedAt: new Date().toISOString(),
    activityDays,
    optionsCount: answerOptionsCount,
  };
}

/**
 * Gather context data for quiz generation
 */
export async function gatherQuizContext(
  userId: string,
  activityDays: number
): Promise<QuizGenerationContext | null> {
  const now = new Date();
  const from = new Date(now.getTime() - activityDays * 24 * 60 * 60 * 1000);

  // Get attention data
  const attentionData = await getAttentionData(userId, { from, to: now });

  // Need at least some content
  if (attentionData.pages.length === 0) {
    return null;
  }

  // Get focus topics
  const focuses = await getUserFocusHistory(userId, { limit: 10, includeActive: true });
  const focusTopics = focuses.map((f) => f.item);

  // Serialize attention data
  const serializedAttention = serializeAttentionCompact(attentionData);

  return {
    focusTopics,
    websiteCount: attentionData.summary.totalPages,
    totalWordsRead: attentionData.summary.totalWordsRead,
    serializedAttention,
  };
}

/**
 * Get queue status for debugging (using job queue)
 */
export async function getQueueStatus(userId?: string) {
  if (userId) {
    const status = await getUserJobsStatus(userId);
    const quizPending = status.pending.filter(j => j.name === JOB_NAMES.QUIZ_GENERATION);
    const quizActive = status.active.filter(j => j.name === JOB_NAMES.QUIZ_GENERATION);

    return {
      pending: quizPending.length,
      processing: quizActive.length,
      total: quizPending.length + quizActive.length,
    };
  }

  // Global status (would need admin access)
  return {
    pending: 0,
    processing: 0,
    total: 0,
  };
}

// ============================================================================
// Legacy compatibility (deprecated - use task queue directly)
// ============================================================================

/**
 * @deprecated Use startQuizGeneration instead
 */
export function getJobStatus(jobId: string, userId: string): null {
  console.warn("[Quiz] getJobStatus is deprecated. Use getQuizTaskStatus or task queue API.");
  return null;
}
