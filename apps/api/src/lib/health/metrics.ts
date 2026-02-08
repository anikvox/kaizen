/**
 * Cognitive Health Metrics Module
 *
 * Provides deterministic SQL-based metrics for understanding user's
 * cognitive performance and well-being patterns.
 *
 * All metrics are designed to be informative, not diagnostic.
 * Uses soft language and avoids medical terminology.
 */

import { db } from "../db.js";
import { Prisma } from "@prisma/client";

// Time ranges in days
export type TimeRange = 7 | 14 | 30 | 90;

// Late night hours (23:00 - 05:00)
const LATE_NIGHT_START_HOUR = 23;
const LATE_NIGHT_END_HOUR = 5;

// Fragmentation threshold (visits under 60 seconds)
const FRAGMENTATION_THRESHOLD_MS = 60000;

export interface DailyActiveMinutes {
  date: string;
  activeMinutes: number;
}

export interface DailyActivityTimes {
  date: string;
  firstActivityTime: string | null;
  lastActivityTime: string | null;
  firstActivityHour: number | null;
  lastActivityHour: number | null;
}

export interface DailyLateNightMinutes {
  date: string;
  lateNightMinutes: number;
}

export interface FragmentationRate {
  totalVisits: number;
  fragmentedVisits: number;
  fragmentationPercentage: number;
}

export interface DailyFragmentation {
  date: string;
  fragmentationPercentage: number;
}

export interface DailyFocusMinutes {
  date: string;
  focusMinutes: number;
  sessionsCount: number;
}

export interface LongestFocusBlock {
  date: string;
  longestBlockMinutes: number;
  focusItem: string | null;
}

export interface NudgeFrequency {
  date: string;
  totalNudges: number;
  doomscrollNudges: number;
  distractionNudges: number;
  breakNudges: number;
  focusDriftNudges: number;
  encouragementNudges: number;
}

export interface MediaDiet {
  youtubeMinutes: number;
  readingMinutes: number;
  audioMinutes: number;
  youtubePercentage: number;
  readingPercentage: number;
  audioPercentage: number;
}

export interface DailyMediaDiet {
  date: string;
  youtubeMinutes: number;
  readingMinutes: number;
  audioMinutes: number;
}

export interface AttentionEntropy {
  entropy: number;
  topDomains: Array<{ domain: string; percentage: number }>;
  uniqueDomains: number;
}

export interface QuizRetention {
  totalQuizzes: number;
  totalQuestions: number;
  correctAnswers: number;
  overallAccuracy: number;
  averageAccuracyPerQuiz: number;
  trend: number; // percentage change in accuracy
}

export interface DailyQuizPerformance {
  date: string;
  quizzesCompleted: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
}

export interface HealthMetricsSummary {
  timeRange: TimeRange;
  // Activity
  averageDailyActiveMinutes: number;
  activeMinutesTrend: number; // percentage change
  dailyActiveMinutes: DailyActiveMinutes[];

  // Sleep proxy
  averageFirstActivityHour: number | null;
  averageLastActivityHour: number | null;
  dailyActivityTimes: DailyActivityTimes[];

  // Late night
  averageLateNightMinutes: number;
  lateNightTrend: number;
  dailyLateNightMinutes: DailyLateNightMinutes[];

  // Focus
  averageFocusMinutes: number;
  focusTrend: number;
  dailyFocusMinutes: DailyFocusMinutes[];
  longestFocusBlocks: LongestFocusBlock[];

  // Fragmentation
  overallFragmentationRate: FragmentationRate;
  dailyFragmentation: DailyFragmentation[];

  // Nudges
  averageNudgesPerDay: number;
  nudgeTrend: number;
  dailyNudges: NudgeFrequency[];

  // Media diet
  mediaDiet: MediaDiet;
  dailyMediaDiet: DailyMediaDiet[];

  // Attention
  attentionEntropy: AttentionEntropy;

  // Quiz Retention
  quizRetention: QuizRetention;
  dailyQuizPerformance: DailyQuizPerformance[];
}

/**
 * Get the date range for a given time period
 */
function getDateRange(days: TimeRange): { from: Date; to: Date } {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - days);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

/**
 * 1) Daily Active Minutes
 * SUM(activeTime) per day from WebsiteVisit
 */
export async function getDailyActiveMinutes(
  userId: string,
  days: TimeRange
): Promise<DailyActiveMinutes[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{ date: Date; active_minutes: bigint }>>`
    SELECT
      DATE("openedAt") as date,
      COALESCE(SUM("activeTime") / 60000, 0) as active_minutes
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
    GROUP BY DATE("openedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    activeMinutes: Number(row.active_minutes),
  }));
}

/**
 * 2) First/Last Activity Time per Day
 * MIN(openedAt), MAX(closedAt) for sleep pattern proxy
 */
export async function getDailyActivityTimes(
  userId: string,
  days: TimeRange
): Promise<DailyActivityTimes[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    first_activity: Date | null;
    last_activity: Date | null;
  }>>`
    SELECT
      DATE("openedAt") as date,
      MIN("openedAt") as first_activity,
      MAX(COALESCE("closedAt", "openedAt")) as last_activity
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
    GROUP BY DATE("openedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    firstActivityTime: row.first_activity?.toISOString() || null,
    lastActivityTime: row.last_activity?.toISOString() || null,
    firstActivityHour: row.first_activity?.getHours() ?? null,
    lastActivityHour: row.last_activity?.getHours() ?? null,
  }));
}

/**
 * 3) Late-Night Activity Minutes (23:00 - 05:00)
 */
export async function getDailyLateNightMinutes(
  userId: string,
  days: TimeRange
): Promise<DailyLateNightMinutes[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{ date: Date; late_night_minutes: bigint }>>`
    SELECT
      DATE("openedAt") as date,
      COALESCE(SUM("activeTime") / 60000, 0) as late_night_minutes
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
      AND (
        EXTRACT(HOUR FROM "openedAt") >= ${LATE_NIGHT_START_HOUR}
        OR EXTRACT(HOUR FROM "openedAt") < ${LATE_NIGHT_END_HOUR}
      )
    GROUP BY DATE("openedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    lateNightMinutes: Number(row.late_night_minutes),
  }));
}

/**
 * 4) Fragmentation Rate
 * Percentage of visits with activeTime < 60000ms
 */
export async function getFragmentationRate(
  userId: string,
  days: TimeRange
): Promise<FragmentationRate> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    total_visits: bigint;
    fragmented_visits: bigint;
  }>>`
    SELECT
      COUNT(*) as total_visits,
      COUNT(*) FILTER (WHERE "activeTime" < ${FRAGMENTATION_THRESHOLD_MS}) as fragmented_visits
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
  `;

  const total = Number(result[0]?.total_visits || 0);
  const fragmented = Number(result[0]?.fragmented_visits || 0);

  return {
    totalVisits: total,
    fragmentedVisits: fragmented,
    fragmentationPercentage: total > 0 ? (fragmented / total) * 100 : 0,
  };
}

/**
 * Daily fragmentation for trend analysis
 */
export async function getDailyFragmentation(
  userId: string,
  days: TimeRange
): Promise<DailyFragmentation[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    total_visits: bigint;
    fragmented_visits: bigint;
  }>>`
    SELECT
      DATE("openedAt") as date,
      COUNT(*) as total_visits,
      COUNT(*) FILTER (WHERE "activeTime" < ${FRAGMENTATION_THRESHOLD_MS}) as fragmented_visits
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
    GROUP BY DATE("openedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => {
    const total = Number(row.total_visits);
    const fragmented = Number(row.fragmented_visits);
    return {
      date: row.date.toISOString().split("T")[0],
      fragmentationPercentage: total > 0 ? (fragmented / total) * 100 : 0,
    };
  });
}

/**
 * 5) Focused Work Minutes
 * SUM(endedAt - startedAt) from Focus sessions
 */
export async function getDailyFocusMinutes(
  userId: string,
  days: TimeRange
): Promise<DailyFocusMinutes[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    focus_minutes: number;
    sessions_count: bigint;
  }>>`
    SELECT
      DATE("startedAt") as date,
      COALESCE(
        SUM(
          EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt")) / 60
        ),
        0
      ) as focus_minutes,
      COUNT(*) as sessions_count
    FROM focuses
    WHERE "userId" = ${userId}
      AND "startedAt" >= ${from}
      AND "startedAt" <= ${to}
    GROUP BY DATE("startedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    focusMinutes: Math.round(row.focus_minutes),
    sessionsCount: Number(row.sessions_count),
  }));
}

/**
 * 6) Longest Focus Block per Day
 */
export async function getLongestFocusBlocks(
  userId: string,
  days: TimeRange
): Promise<LongestFocusBlock[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    longest_minutes: number;
    focus_item: string | null;
  }>>`
    WITH focus_durations AS (
      SELECT
        DATE("startedAt") as date,
        "item" as focus_item,
        EXTRACT(EPOCH FROM (COALESCE("endedAt", NOW()) - "startedAt")) / 60 as duration_minutes
      FROM focuses
      WHERE "userId" = ${userId}
        AND "startedAt" >= ${from}
        AND "startedAt" <= ${to}
    ),
    ranked AS (
      SELECT
        date,
        focus_item,
        duration_minutes,
        ROW_NUMBER() OVER (PARTITION BY date ORDER BY duration_minutes DESC) as rn
      FROM focus_durations
    )
    SELECT date, duration_minutes as longest_minutes, focus_item
    FROM ranked
    WHERE rn = 1
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    longestBlockMinutes: Math.round(row.longest_minutes),
    focusItem: row.focus_item,
  }));
}

/**
 * 7) Nudge Frequency and Trend
 */
export async function getDailyNudges(
  userId: string,
  days: TimeRange
): Promise<NudgeFrequency[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    total: bigint;
    doomscroll: bigint;
    distraction: bigint;
    break_count: bigint;
    focus_drift: bigint;
    encouragement: bigint;
  }>>`
    SELECT
      DATE("createdAt") as date,
      COUNT(*) FILTER (WHERE type != 'all_clear') as total,
      COUNT(*) FILTER (WHERE type = 'doomscroll') as doomscroll,
      COUNT(*) FILTER (WHERE type = 'distraction') as distraction,
      COUNT(*) FILTER (WHERE type = 'break') as break_count,
      COUNT(*) FILTER (WHERE type = 'focus_drift') as focus_drift,
      COUNT(*) FILTER (WHERE type = 'encouragement') as encouragement
    FROM agent_nudges
    WHERE "userId" = ${userId}
      AND "createdAt" >= ${from}
      AND "createdAt" <= ${to}
    GROUP BY DATE("createdAt")
    ORDER BY date ASC
  `;

  return result.map((row) => ({
    date: row.date.toISOString().split("T")[0],
    totalNudges: Number(row.total),
    doomscrollNudges: Number(row.doomscroll),
    distractionNudges: Number(row.distraction),
    breakNudges: Number(row.break_count),
    focusDriftNudges: Number(row.focus_drift),
    encouragementNudges: Number(row.encouragement),
  }));
}

/**
 * 8) Media Diet
 * YouTube: SUM(activeWatchTime)
 * Audio: SUM(playbackDuration)
 * Reading: Estimated from wordsRead (200 wpm)
 */
export async function getMediaDiet(
  userId: string,
  days: TimeRange
): Promise<MediaDiet> {
  const { from, to } = getDateRange(days);

  // YouTube watch time
  const youtubeResult = await db.$queryRaw<Array<{ total_minutes: number }>>`
    SELECT COALESCE(SUM("activeWatchTime") / 60000.0, 0) as total_minutes
    FROM youtube_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
      AND event = 'active-watch-time-update'
  `;

  // Audio playback time
  const audioResult = await db.$queryRaw<Array<{ total_minutes: number }>>`
    SELECT COALESCE(SUM("playbackDuration") / 60000.0, 0) as total_minutes
    FROM audio_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
  `;

  // Reading time (200 words per minute)
  const readingResult = await db.$queryRaw<Array<{ total_minutes: number }>>`
    SELECT COALESCE(SUM("wordsRead") / 200.0, 0) as total_minutes
    FROM text_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
  `;

  const youtube = youtubeResult[0]?.total_minutes || 0;
  const audio = audioResult[0]?.total_minutes || 0;
  const reading = readingResult[0]?.total_minutes || 0;
  const total = youtube + audio + reading;

  return {
    youtubeMinutes: Math.round(youtube),
    readingMinutes: Math.round(reading),
    audioMinutes: Math.round(audio),
    youtubePercentage: total > 0 ? (youtube / total) * 100 : 0,
    readingPercentage: total > 0 ? (reading / total) * 100 : 0,
    audioPercentage: total > 0 ? (audio / total) * 100 : 0,
  };
}

/**
 * Daily media diet breakdown
 */
export async function getDailyMediaDiet(
  userId: string,
  days: TimeRange
): Promise<DailyMediaDiet[]> {
  const { from, to } = getDateRange(days);

  // Get all dates in range
  const dates: string[] = [];
  const current = new Date(from);
  while (current <= to) {
    dates.push(current.toISOString().split("T")[0]);
    current.setDate(current.getDate() + 1);
  }

  // YouTube by day
  const youtubeByDay = await db.$queryRaw<Array<{ date: Date; minutes: number }>>`
    SELECT
      DATE("timestamp") as date,
      COALESCE(SUM("activeWatchTime") / 60000.0, 0) as minutes
    FROM youtube_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
      AND event = 'active-watch-time-update'
    GROUP BY DATE("timestamp")
  `;

  // Audio by day
  const audioByDay = await db.$queryRaw<Array<{ date: Date; minutes: number }>>`
    SELECT
      DATE("timestamp") as date,
      COALESCE(SUM("playbackDuration") / 60000.0, 0) as minutes
    FROM audio_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
    GROUP BY DATE("timestamp")
  `;

  // Reading by day
  const readingByDay = await db.$queryRaw<Array<{ date: Date; minutes: number }>>`
    SELECT
      DATE("timestamp") as date,
      COALESCE(SUM("wordsRead") / 200.0, 0) as minutes
    FROM text_attentions
    WHERE "userId" = ${userId}
      AND "timestamp" >= ${from}
      AND "timestamp" <= ${to}
    GROUP BY DATE("timestamp")
  `;

  // Merge results
  const youtubeMap = new Map(youtubeByDay.map((r) => [r.date.toISOString().split("T")[0], r.minutes]));
  const audioMap = new Map(audioByDay.map((r) => [r.date.toISOString().split("T")[0], r.minutes]));
  const readingMap = new Map(readingByDay.map((r) => [r.date.toISOString().split("T")[0], r.minutes]));

  return dates.map((date) => ({
    date,
    youtubeMinutes: Math.round(youtubeMap.get(date) || 0),
    readingMinutes: Math.round(readingMap.get(date) || 0),
    audioMinutes: Math.round(audioMap.get(date) || 0),
  }));
}

/**
 * 9) Attention Entropy / Scatter
 * Measures how spread out attention is across domains
 * Higher entropy = more scattered attention
 */
export async function getAttentionEntropy(
  userId: string,
  days: TimeRange
): Promise<AttentionEntropy> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{ domain: string; visit_count: bigint }>>`
    SELECT
      SUBSTRING(url FROM '://([^/]+)') as domain,
      COUNT(*) as visit_count
    FROM website_visits
    WHERE "userId" = ${userId}
      AND "openedAt" >= ${from}
      AND "openedAt" <= ${to}
    GROUP BY SUBSTRING(url FROM '://([^/]+)')
    ORDER BY visit_count DESC
  `;

  const total = result.reduce((sum, r) => sum + Number(r.visit_count), 0);

  if (total === 0) {
    return {
      entropy: 0,
      topDomains: [],
      uniqueDomains: 0,
    };
  }

  // Calculate Shannon entropy
  let entropy = 0;
  for (const row of result) {
    const p = Number(row.visit_count) / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize to 0-100 scale (assuming max 1000 domains)
  const maxEntropy = Math.log2(Math.min(result.length, 1000));
  const normalizedEntropy = maxEntropy > 0 ? (entropy / maxEntropy) * 100 : 0;

  return {
    entropy: Math.round(normalizedEntropy),
    topDomains: result.slice(0, 10).map((r) => ({
      domain: r.domain,
      percentage: (Number(r.visit_count) / total) * 100,
    })),
    uniqueDomains: result.length,
  };
}

/**
 * 10) Quiz Retention Metrics
 * Accuracy and retention from quiz results
 */
export async function getQuizRetention(
  userId: string,
  days: TimeRange
): Promise<QuizRetention> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    total_quizzes: bigint;
    total_questions: bigint;
    correct_answers: bigint;
  }>>`
    SELECT
      COUNT(DISTINCT qr.id) as total_quizzes,
      COALESCE(SUM(qr."totalQuestions"), 0) as total_questions,
      COALESCE(SUM(qr."correctAnswers"), 0) as correct_answers
    FROM quiz_results qr
    WHERE qr."userId" = ${userId}
      AND qr."completedAt" >= ${from}
      AND qr."completedAt" <= ${to}
  `;

  const totalQuizzes = Number(result[0]?.total_quizzes || 0);
  const totalQuestions = Number(result[0]?.total_questions || 0);
  const correctAnswers = Number(result[0]?.correct_answers || 0);
  const overallAccuracy = totalQuestions > 0 ? (correctAnswers / totalQuestions) * 100 : 0;
  const averageAccuracyPerQuiz = totalQuizzes > 0 ? overallAccuracy : 0;

  // Calculate trend by comparing first half vs second half
  const midDate = new Date((from.getTime() + to.getTime()) / 2);

  const firstHalfResult = await db.$queryRaw<Array<{
    total_questions: bigint;
    correct_answers: bigint;
  }>>`
    SELECT
      COALESCE(SUM(qr."totalQuestions"), 0) as total_questions,
      COALESCE(SUM(qr."correctAnswers"), 0) as correct_answers
    FROM quiz_results qr
    WHERE qr."userId" = ${userId}
      AND qr."completedAt" >= ${from}
      AND qr."completedAt" < ${midDate}
  `;

  const secondHalfResult = await db.$queryRaw<Array<{
    total_questions: bigint;
    correct_answers: bigint;
  }>>`
    SELECT
      COALESCE(SUM(qr."totalQuestions"), 0) as total_questions,
      COALESCE(SUM(qr."correctAnswers"), 0) as correct_answers
    FROM quiz_results qr
    WHERE qr."userId" = ${userId}
      AND qr."completedAt" >= ${midDate}
      AND qr."completedAt" <= ${to}
  `;

  const firstHalfQuestions = Number(firstHalfResult[0]?.total_questions || 0);
  const firstHalfCorrect = Number(firstHalfResult[0]?.correct_answers || 0);
  const firstHalfAccuracy = firstHalfQuestions > 0 ? (firstHalfCorrect / firstHalfQuestions) * 100 : 0;

  const secondHalfQuestions = Number(secondHalfResult[0]?.total_questions || 0);
  const secondHalfCorrect = Number(secondHalfResult[0]?.correct_answers || 0);
  const secondHalfAccuracy = secondHalfQuestions > 0 ? (secondHalfCorrect / secondHalfQuestions) * 100 : 0;

  let trend = 0;
  if (firstHalfAccuracy > 0) {
    trend = ((secondHalfAccuracy - firstHalfAccuracy) / firstHalfAccuracy) * 100;
  } else if (secondHalfAccuracy > 0) {
    trend = 100;
  }

  return {
    totalQuizzes,
    totalQuestions,
    correctAnswers,
    overallAccuracy: Math.round(overallAccuracy * 10) / 10,
    averageAccuracyPerQuiz: Math.round(averageAccuracyPerQuiz * 10) / 10,
    trend: Math.round(trend),
  };
}

/**
 * Daily quiz performance for trend visualization
 */
export async function getDailyQuizPerformance(
  userId: string,
  days: TimeRange
): Promise<DailyQuizPerformance[]> {
  const { from, to } = getDateRange(days);

  const result = await db.$queryRaw<Array<{
    date: Date;
    quizzes_completed: bigint;
    total_questions: bigint;
    correct_answers: bigint;
  }>>`
    SELECT
      DATE(qr."completedAt") as date,
      COUNT(*) as quizzes_completed,
      COALESCE(SUM(qr."totalQuestions"), 0) as total_questions,
      COALESCE(SUM(qr."correctAnswers"), 0) as correct_answers
    FROM quiz_results qr
    WHERE qr."userId" = ${userId}
      AND qr."completedAt" >= ${from}
      AND qr."completedAt" <= ${to}
    GROUP BY DATE(qr."completedAt")
    ORDER BY date ASC
  `;

  return result.map((row) => {
    const total = Number(row.total_questions);
    const correct = Number(row.correct_answers);
    return {
      date: row.date.toISOString().split("T")[0],
      quizzesCompleted: Number(row.quizzes_completed),
      totalQuestions: total,
      correctAnswers: correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100 * 10) / 10 : 0,
    };
  });
}

/**
 * Calculate trend (percentage change) between two halves of a period
 */
function calculateTrend(values: number[]): number {
  if (values.length < 2) return 0;

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);

  const avgFirst = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

  if (avgFirst === 0) return avgSecond > 0 ? 100 : 0;
  return ((avgSecond - avgFirst) / avgFirst) * 100;
}

/**
 * Get all health metrics for a user
 */
export async function getHealthMetrics(
  userId: string,
  days: TimeRange = 7
): Promise<HealthMetricsSummary> {
  // Fetch all metrics in parallel
  const [
    dailyActiveMinutes,
    dailyActivityTimes,
    dailyLateNightMinutes,
    fragmentationRate,
    dailyFragmentation,
    dailyFocusMinutes,
    longestFocusBlocks,
    dailyNudges,
    mediaDiet,
    dailyMediaDiet,
    attentionEntropy,
    quizRetention,
    dailyQuizPerformance,
  ] = await Promise.all([
    getDailyActiveMinutes(userId, days),
    getDailyActivityTimes(userId, days),
    getDailyLateNightMinutes(userId, days),
    getFragmentationRate(userId, days),
    getDailyFragmentation(userId, days),
    getDailyFocusMinutes(userId, days),
    getLongestFocusBlocks(userId, days),
    getDailyNudges(userId, days),
    getMediaDiet(userId, days),
    getDailyMediaDiet(userId, days),
    getAttentionEntropy(userId, days),
    getQuizRetention(userId, days),
    getDailyQuizPerformance(userId, days),
  ]);

  // Calculate averages
  const avgActiveMinutes = dailyActiveMinutes.length > 0
    ? dailyActiveMinutes.reduce((sum, d) => sum + d.activeMinutes, 0) / dailyActiveMinutes.length
    : 0;

  const validFirstHours = dailyActivityTimes
    .filter((d) => d.firstActivityHour !== null)
    .map((d) => d.firstActivityHour!);
  const avgFirstHour = validFirstHours.length > 0
    ? validFirstHours.reduce((a, b) => a + b, 0) / validFirstHours.length
    : null;

  const validLastHours = dailyActivityTimes
    .filter((d) => d.lastActivityHour !== null)
    .map((d) => d.lastActivityHour!);
  const avgLastHour = validLastHours.length > 0
    ? validLastHours.reduce((a, b) => a + b, 0) / validLastHours.length
    : null;

  const avgLateNight = dailyLateNightMinutes.length > 0
    ? dailyLateNightMinutes.reduce((sum, d) => sum + d.lateNightMinutes, 0) / dailyLateNightMinutes.length
    : 0;

  const avgFocus = dailyFocusMinutes.length > 0
    ? dailyFocusMinutes.reduce((sum, d) => sum + d.focusMinutes, 0) / dailyFocusMinutes.length
    : 0;

  const avgNudges = dailyNudges.length > 0
    ? dailyNudges.reduce((sum, d) => sum + d.totalNudges, 0) / dailyNudges.length
    : 0;

  // Calculate trends
  const activeMinutesTrend = calculateTrend(dailyActiveMinutes.map((d) => d.activeMinutes));
  const lateNightTrend = calculateTrend(dailyLateNightMinutes.map((d) => d.lateNightMinutes));
  const focusTrend = calculateTrend(dailyFocusMinutes.map((d) => d.focusMinutes));
  const nudgeTrend = calculateTrend(dailyNudges.map((d) => d.totalNudges));

  return {
    timeRange: days,

    // Activity
    averageDailyActiveMinutes: Math.round(avgActiveMinutes),
    activeMinutesTrend: Math.round(activeMinutesTrend),
    dailyActiveMinutes,

    // Sleep proxy
    averageFirstActivityHour: avgFirstHour !== null ? Math.round(avgFirstHour * 10) / 10 : null,
    averageLastActivityHour: avgLastHour !== null ? Math.round(avgLastHour * 10) / 10 : null,
    dailyActivityTimes,

    // Late night
    averageLateNightMinutes: Math.round(avgLateNight),
    lateNightTrend: Math.round(lateNightTrend),
    dailyLateNightMinutes,

    // Focus
    averageFocusMinutes: Math.round(avgFocus),
    focusTrend: Math.round(focusTrend),
    dailyFocusMinutes,
    longestFocusBlocks,

    // Fragmentation
    overallFragmentationRate: fragmentationRate,
    dailyFragmentation,

    // Nudges
    averageNudgesPerDay: Math.round(avgNudges * 10) / 10,
    nudgeTrend: Math.round(nudgeTrend),
    dailyNudges,

    // Media diet
    mediaDiet,
    dailyMediaDiet,

    // Attention
    attentionEntropy,

    // Quiz Retention
    quizRetention,
    dailyQuizPerformance,
  };
}

/**
 * Get recent nudges for display
 */
export async function getRecentNudges(
  userId: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  type: string;
  message: string;
  confidence: number;
  reasoning: string | null;
  response: string | null;
  createdAt: Date;
}>> {
  const nudges = await db.agentNudge.findMany({
    where: {
      userId,
      type: { not: "all_clear" },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return nudges.map((n) => ({
    id: n.id,
    type: n.type,
    message: n.message,
    confidence: n.confidence,
    reasoning: n.reasoning,
    response: n.response,
    createdAt: n.createdAt,
  }));
}
