/**
 * Quiz service - Generates quiz questions and stores them in database
 */

import { createHash } from "crypto";
import { db } from "../db.js";
import { getAttentionData } from "../attention.js";
import { serializeAttentionCompact } from "../llm/prompts.js";
import { createLLMService } from "../llm/service.js";
import { getUserFocusHistory } from "../focus/index.js";
import type { UserSettings } from "@prisma/client";
import type { QuizSettings, GeneratedQuiz, QuizGenerationContext, QuizQuestion, QuizWithAnswers } from "./types.js";
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
const QUIZ_VALIDITY_HOURS = 24; // Quiz is valid for 24 hours

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
 * Get the current quiz for a user (or null if none exists or expired)
 */
export async function getCurrentQuiz(userId: string): Promise<QuizWithAnswers | null> {
  const cutoffTime = new Date(Date.now() - QUIZ_VALIDITY_HOURS * 60 * 60 * 1000);

  const quiz = await db.quiz.findFirst({
    where: {
      userId,
      generatedAt: { gte: cutoffTime },
    },
    orderBy: { generatedAt: "desc" },
    include: {
      answers: {
        orderBy: { questionIndex: "asc" },
      },
      result: true,
    },
  });

  if (!quiz) return null;

  const questions = quiz.questions as QuizQuestion[];
  const correctCount = quiz.answers.filter(a => a.isCorrect).length;

  return {
    id: quiz.id,
    questions,
    generatedAt: quiz.generatedAt.toISOString(),
    activityDays: quiz.activityDays,
    optionsCount: quiz.optionsCount,
    answers: quiz.answers.map(a => ({
      questionIndex: a.questionIndex,
      selectedIndex: a.selectedIndex,
      isCorrect: a.isCorrect,
      answeredAt: a.answeredAt.toISOString(),
    })),
    completedAt: quiz.completedAt?.toISOString() || null,
    score: quiz.completedAt ? correctCount : null,
  };
}

/**
 * Submit an answer for a quiz question
 */
export async function submitAnswer(
  userId: string,
  quizId: string,
  questionIndex: number,
  selectedIndex: number
): Promise<{ success: boolean; isCorrect: boolean; error?: string }> {
  // Verify quiz belongs to user
  const quiz = await db.quiz.findUnique({
    where: { id: quizId },
    select: { userId: true, questions: true, completedAt: true },
  });

  if (!quiz || quiz.userId !== userId) {
    return { success: false, isCorrect: false, error: "Quiz not found" };
  }

  if (quiz.completedAt) {
    return { success: false, isCorrect: false, error: "Quiz already completed" };
  }

  const questions = quiz.questions as QuizQuestion[];
  const question = questions[questionIndex];

  if (!question) {
    return { success: false, isCorrect: false, error: "Question not found" };
  }

  const isCorrect = selectedIndex === question.correctIndex;

  // Upsert the answer (in case they change their answer)
  await db.quizAnswer.upsert({
    where: {
      quizId_questionIndex: { quizId, questionIndex },
    },
    create: {
      quizId,
      questionIndex,
      selectedIndex,
      isCorrect,
    },
    update: {
      selectedIndex,
      isCorrect,
      answeredAt: new Date(),
    },
  });

  // Check if all questions are answered
  const answerCount = await db.quizAnswer.count({ where: { quizId } });

  if (answerCount === questions.length) {
    // Mark quiz as completed and create result
    const answers = await db.quizAnswer.findMany({ where: { quizId } });
    const correctAnswers = answers.filter(a => a.isCorrect).length;

    await db.$transaction([
      db.quiz.update({
        where: { id: quizId },
        data: { completedAt: new Date() },
      }),
      db.quizResult.create({
        data: {
          userId,
          quizId,
          totalQuestions: questions.length,
          correctAnswers,
        },
      }),
    ]);
  }

  return { success: true, isCorrect };
}

/**
 * Start quiz generation via job queue.
 * Returns the job ID immediately, client should poll for status.
 * Pre-checks for activity data and returns error immediately if none.
 */
export async function startQuizGeneration(userId: string): Promise<{
  jobId: string | null;
  status: string;
  error?: string;
  code?: string;
}> {
  // Get user settings for activity days
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const activityDays = settings?.quizActivityDays ?? DEFAULT_QUIZ_SETTINGS.activityDays;

  // Pre-check for activity data before creating job
  const context = await gatherQuizContext(userId, activityDays);

  if (!context) {
    console.log(`[Quiz] No activity data for user ${userId}, skipping job creation`);
    return {
      jobId: null,
      status: "failed",
      error: "Not enough activity data to generate quiz",
      code: "NO_ACTIVITY_DATA",
    };
  }

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
    // The job output now contains the quiz ID
    const quizData = job.output as { quizId: string };
    const quiz = await getCurrentQuiz(userId);
    if (quiz) {
      return {
        status: job.state,
        quiz,
      };
    }
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
 * This is the core generation logic that saves to database.
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

  // Create content hash for deduplication tracking
  const contentHash = createHash("md5")
    .update(context.serializedAttention)
    .digest("hex");

  // Save quiz to database
  const questions: QuizQuestion[] = parsed.questions.map((q, index) => ({
    id: `q-${index}`,
    questionIndex: index,
    question: q.question,
    options: q.options,
    correctIndex: q.correct_index,
  }));

  const savedQuiz = await db.quiz.create({
    data: {
      userId,
      questions: questions as any,
      activityDays,
      optionsCount: answerOptionsCount,
      contentHash,
    },
  });

  console.log(`[Quiz] Saved quiz ${savedQuiz.id} to database`);

  return {
    id: savedQuiz.id,
    questions,
    generatedAt: savedQuiz.generatedAt.toISOString(),
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

  // Get previous quiz questions (last 3 quizzes) for deduplication
  const recentQuizzes = await db.quiz.findMany({
    where: { userId },
    orderBy: { generatedAt: "desc" },
    take: 3,
    select: { questions: true },
  });

  const previousQuestions: string[] = [];
  for (const quiz of recentQuizzes) {
    const questions = quiz.questions as QuizQuestion[];
    for (const q of questions) {
      previousQuestions.push(q.question);
    }
  }

  return {
    focusTopics,
    websiteCount: attentionData.summary.totalPages,
    totalWordsRead: attentionData.summary.totalWordsRead,
    serializedAttention,
    previousQuestions,
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
