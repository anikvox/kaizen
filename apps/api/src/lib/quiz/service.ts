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
  pushQuizGeneration,
  getTask,
  getUserQueueStatus,
  TASK_TYPES,
  type TaskQueueItem,
} from "../task-queue/index.js";

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
 * Start quiz generation via task queue.
 * Returns the task immediately, client should poll for status.
 */
export async function startQuizGeneration(userId: string): Promise<{
  taskId: string;
  status: string;
}> {
  const task = await pushQuizGeneration(userId);

  console.log(`[Quiz] Created task ${task.id} for user ${userId}`);

  return {
    taskId: task.id,
    status: task.status,
  };
}

/**
 * Get quiz task status and result.
 * Bridges the old job API to the new task queue.
 */
export async function getQuizTaskStatus(taskId: string, userId: string): Promise<{
  status: string;
  quiz?: GeneratedQuiz;
  error?: string;
} | null> {
  const task = await getTask(taskId);

  if (!task || task.userId !== userId) {
    return null;
  }

  if (task.status === "completed" && task.result) {
    // The task result contains quiz generation metadata
    // For full quiz, we need to re-generate or store in payload
    // For now, return the metadata
    return {
      status: task.status,
      quiz: task.result as unknown as GeneratedQuiz,
    };
  }

  if (task.status === "failed") {
    return {
      status: task.status,
      error: task.error || "Quiz generation failed",
    };
  }

  return {
    status: task.status,
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
 * Get queue status for debugging (using task queue)
 */
export async function getQueueStatus(userId?: string) {
  if (userId) {
    const status = await getUserQueueStatus(userId);
    const quizTasks = status.pendingTasks.filter(t => t.type === TASK_TYPES.QUIZ_GENERATION);
    const processingQuiz = status.processingTasks.filter(t => t.type === TASK_TYPES.QUIZ_GENERATION);

    return {
      pending: quizTasks.length,
      processing: processingQuiz.length,
      total: quizTasks.length + processingQuiz.length,
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
