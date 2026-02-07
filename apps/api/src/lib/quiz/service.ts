/**
 * Quiz service - Generates quiz questions on-demand with background queue
 */

import PQueue from "p-queue";
import { db } from "../db.js";
import { getAttentionData } from "../attention.js";
import { serializeAttentionCompact } from "../llm/prompts.js";
import { createLLMService } from "../llm/service.js";
import { getUserFocusHistory } from "../focus/index.js";
import type { UserSettings } from "@prisma/client";
import type { QuizSettings, GeneratedQuiz, QuizGenerationContext, QuizJob } from "./types.js";
import { DEFAULT_QUIZ_SETTINGS } from "./types.js";
import { createQuizPrompt, parseQuizResponse } from "./prompts.js";
import { LLM_CONFIG, getPrompt, PROMPT_NAMES } from "../llm/index.js";

const QUESTION_COUNT = 10;

// Queue to manage concurrent quiz generation (max 3 concurrent)
const quizQueue = new PQueue({ concurrency: 3 });

// Store job status and results (in-memory, keyed by oderId)
const jobs = new Map<string, QuizJob>();

// Clean up old jobs after 10 minutes
const JOB_TTL_MS = 10 * 60 * 1000;

function generateJobId(): string {
  return `quiz-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function cleanupOldJobs() {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (now - new Date(job.createdAt).getTime() > JOB_TTL_MS) {
      jobs.delete(jobId);
    }
  }
}

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
 * Start quiz generation - returns job ID immediately, processes in background
 */
export function startQuizGeneration(userId: string): QuizJob {
  // Clean up old jobs periodically
  cleanupOldJobs();

  // Check if user already has a pending job
  for (const [jobId, job] of jobs.entries()) {
    if (job.userId === userId && job.status === "pending") {
      console.log(`[Quiz] Reusing existing pending job ${jobId} for user ${userId}`);
      return job;
    }
  }

  const jobId = generateJobId();
  const job: QuizJob = {
    id: jobId,
    userId,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Queue the generation
  quizQueue.add(async () => {
    const currentJob = jobs.get(jobId);
    if (!currentJob) return;

    try {
      currentJob.status = "processing";
      console.log(`[Quiz] Processing job ${jobId} for user ${userId}`);

      const result = await doGenerateQuiz(userId);

      if (result) {
        currentJob.status = "completed";
        currentJob.result = result;
        console.log(`[Quiz] Job ${jobId} completed successfully`);
      } else {
        currentJob.status = "failed";
        currentJob.error = "Not enough activity data to generate quiz";
        console.log(`[Quiz] Job ${jobId} failed: insufficient data`);
      }
    } catch (error) {
      currentJob.status = "failed";
      currentJob.error = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Quiz] Job ${jobId} failed:`, error);
    }
  });

  console.log(`[Quiz] Created job ${jobId} for user ${userId}, queue size: ${quizQueue.size}`);
  return job;
}

/**
 * Get job status and result
 */
export function getJobStatus(jobId: string, userId: string): QuizJob | null {
  const job = jobs.get(jobId);
  if (!job || job.userId !== userId) {
    return null;
  }
  return job;
}

/**
 * Actual quiz generation logic
 */
async function doGenerateQuiz(userId: string): Promise<GeneratedQuiz | null> {
  console.log(`[Quiz] Starting generation for user ${userId}`);

  // Get user settings
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const quizSettings = extractQuizSettings(settings);
  console.log(`[Quiz] Settings:`, quizSettings);

  // Gather context for quiz generation
  const context = await gatherQuizContext(userId, quizSettings.activityDays);

  if (!context) {
    console.log(`[Quiz] Not enough activity data to generate quiz`);
    return null;
  }

  // Generate questions using LLM
  const llmService = createLLMService(settings);
  const provider = llmService.getProvider();

  const prompt = createQuizPrompt(context, quizSettings.answerOptionsCount, QUESTION_COUNT);

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
    quizSettings.answerOptionsCount
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
    activityDays: quizSettings.activityDays,
    optionsCount: quizSettings.answerOptionsCount,
  };
}

/**
 * Gather context data for quiz generation
 */
async function gatherQuizContext(
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
 * Get queue status for debugging
 */
export function getQueueStatus() {
  return {
    pending: quizQueue.pending,
    size: quizQueue.size,
    jobCount: jobs.size,
  };
}
