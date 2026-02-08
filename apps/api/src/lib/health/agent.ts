/**
 * Mental Health Assistant Agent
 *
 * An agentic assistant that generates comprehensive cognitive health reports.
 * Uses existing chat tools plus health metrics to provide insights.
 *
 * Key principles:
 * - Uses soft language ("may indicate", "possible signal", "worth noticing")
 * - Never uses: diagnose, disorder, illness, depression, anxiety, ADHD
 * - Cites metrics from data
 * - Calm and supportive tone
 * - No medical advice
 */

import { z } from "zod";
import { tool } from "ai";
import { db } from "../db.js";
import { createLLMService } from "../llm/service.js";
import { events } from "../events.js";
import {
  getHealthMetrics,
  getRecentNudges,
  type TimeRange,
  type HealthMetricsSummary,
} from "./metrics.js";
import { createChatTools } from "../chat/tools.js";

export interface ReportGenerationProgress {
  step: string;
  message: string;
  toolName?: string;
  toolResult?: unknown;
  timestamp: Date;
}

export interface HealthReport {
  id: string;
  userId: string;
  timeRange: TimeRange;
  metrics: HealthMetricsSummary;
  report: string;
  generationSteps: ReportGenerationProgress[];
  createdAt: Date;
}

/**
 * Create tools specific to the health report agent
 */
function createHealthReportTools(userId: string, timeRange: TimeRange) {
  // Get the base chat tools
  const chatTools = createChatTools(userId);

  // Add health-specific tools
  return {
    // Include relevant tools from chat
    get_browsing_patterns: chatTools.get_browsing_patterns,
    get_top_domains: chatTools.get_top_domains,
    get_media_stats: chatTools.get_media_stats,
    get_youtube_history: chatTools.get_youtube_history,
    get_reading_activity: chatTools.get_reading_activity,
    get_focus_history: chatTools.get_focus_history,
    compare_activity: chatTools.compare_activity,

    // Health-specific tools
    get_health_metrics: tool({
      description: "Get comprehensive health metrics for the specified time range including activity, focus, fragmentation, late-night usage, and media diet.",
      parameters: z.object({}),
      execute: async () => {
        const metrics = await getHealthMetrics(userId, timeRange);
        return {
          success: true,
          timeRange,
          metrics,
        };
      },
    }),

    get_nudge_history: tool({
      description: "Get the history of focus guardian nudges to understand patterns of distraction and doomscrolling.",
      parameters: z.object({
        limit: z.number().min(1).max(50).optional().describe("Number of nudges to retrieve. Default 20."),
      }),
      execute: async ({ limit = 20 }) => {
        const nudges = await getRecentNudges(userId, limit);
        return {
          success: true,
          count: nudges.length,
          nudges: nudges.map((n) => ({
            type: n.type,
            message: n.message,
            confidence: n.confidence,
            reasoning: n.reasoning,
            userResponse: n.response,
            createdAt: n.createdAt.toISOString(),
          })),
        };
      },
    }),

    analyze_sleep_patterns: tool({
      description: "Analyze sleep patterns based on first and last activity times. This is a PROXY based on digital activity, not actual sleep tracking.",
      parameters: z.object({}),
      execute: async () => {
        const metrics = await getHealthMetrics(userId, timeRange);

        const activityTimes = metrics.dailyActivityTimes.filter(
          (d) => d.firstActivityHour !== null && d.lastActivityHour !== null
        );

        if (activityTimes.length === 0) {
          return {
            success: false,
            message: "Not enough activity data to analyze patterns",
          };
        }

        // Calculate consistency (standard deviation of wake times)
        const firstHours = activityTimes.map((d) => d.firstActivityHour!);
        const avgFirst = firstHours.reduce((a, b) => a + b, 0) / firstHours.length;
        const variance = firstHours.reduce((sum, h) => sum + Math.pow(h - avgFirst, 2), 0) / firstHours.length;
        const stdDev = Math.sqrt(variance);

        // Analyze late night usage
        const lateNightDays = metrics.dailyLateNightMinutes.filter((d) => d.lateNightMinutes > 30);

        return {
          success: true,
          analysis: {
            averageFirstActivity: `${Math.floor(avgFirst)}:${Math.round((avgFirst % 1) * 60).toString().padStart(2, "0")}`,
            averageLastActivity: metrics.averageLastActivityHour !== null
              ? `${Math.floor(metrics.averageLastActivityHour)}:${Math.round((metrics.averageLastActivityHour % 1) * 60).toString().padStart(2, "0")}`
              : "Unknown",
            wakeTimeConsistency: stdDev < 1 ? "Very consistent" : stdDev < 2 ? "Fairly consistent" : "Variable",
            wakeTimeStdDevHours: Math.round(stdDev * 10) / 10,
            daysWithSignificantLateNightActivity: lateNightDays.length,
            averageLateNightMinutes: metrics.averageLateNightMinutes,
          },
          note: "This analysis is based on digital activity times, which may indicate but does not definitively reflect actual sleep patterns.",
        };
      },
    }),

    analyze_focus_quality: tool({
      description: "Analyze the quality of focus sessions including duration, consistency, and interruption patterns.",
      parameters: z.object({}),
      execute: async () => {
        const metrics = await getHealthMetrics(userId, timeRange);

        const focusDays = metrics.dailyFocusMinutes.filter((d) => d.focusMinutes > 0);

        if (focusDays.length === 0) {
          return {
            success: false,
            message: "No focus sessions found in this period",
          };
        }

        // Calculate focus session metrics
        const avgFocusPerSession = focusDays.reduce((sum, d) => sum + d.focusMinutes, 0) /
          focusDays.reduce((sum, d) => sum + d.sessionsCount, 0);

        const longestBlocks = metrics.longestFocusBlocks.filter((b) => b.longestBlockMinutes > 0);
        const avgLongestBlock = longestBlocks.length > 0
          ? longestBlocks.reduce((sum, b) => sum + b.longestBlockMinutes, 0) / longestBlocks.length
          : 0;

        // Compare focus to fragmentation
        const focusToFragmentationRatio = metrics.overallFragmentationRate.fragmentationPercentage > 0
          ? (100 - metrics.overallFragmentationRate.fragmentationPercentage) / metrics.overallFragmentationRate.fragmentationPercentage
          : 100;

        return {
          success: true,
          analysis: {
            daysWithFocusSessions: focusDays.length,
            totalDaysInPeriod: timeRange,
            averageFocusMinutesPerDay: Math.round(metrics.averageFocusMinutes),
            averageFocusMinutesPerSession: Math.round(avgFocusPerSession),
            averageLongestBlockMinutes: Math.round(avgLongestBlock),
            focusTrend: metrics.focusTrend > 0 ? "Improving" : metrics.focusTrend < -10 ? "Declining" : "Stable",
            focusTrendPercentage: metrics.focusTrend,
            fragmentationRate: Math.round(metrics.overallFragmentationRate.fragmentationPercentage),
            focusToFragmentationRatio: Math.round(focusToFragmentationRatio * 10) / 10,
            interpretation: focusToFragmentationRatio > 1
              ? "More sustained attention than fragmented browsing"
              : "More fragmented browsing than sustained focus",
          },
        };
      },
    }),

    analyze_media_balance: tool({
      description: "Analyze the balance of media consumption including video, reading, and audio.",
      parameters: z.object({}),
      execute: async () => {
        const metrics = await getHealthMetrics(userId, timeRange);
        const { mediaDiet } = metrics;

        const total = mediaDiet.youtubeMinutes + mediaDiet.readingMinutes + mediaDiet.audioMinutes;

        if (total === 0) {
          return {
            success: false,
            message: "No media consumption data found",
          };
        }

        // Determine dominant media type
        let dominant = "balanced";
        if (mediaDiet.youtubePercentage > 60) dominant = "video-heavy";
        else if (mediaDiet.readingPercentage > 60) dominant = "reading-focused";
        else if (mediaDiet.audioPercentage > 60) dominant = "audio-focused";

        // Reading depth analysis
        const readingToVideoRatio = mediaDiet.youtubeMinutes > 0
          ? mediaDiet.readingMinutes / mediaDiet.youtubeMinutes
          : mediaDiet.readingMinutes > 0 ? Infinity : 0;

        return {
          success: true,
          analysis: {
            totalMediaMinutes: total,
            breakdown: {
              youtube: {
                minutes: mediaDiet.youtubeMinutes,
                percentage: Math.round(mediaDiet.youtubePercentage),
              },
              reading: {
                minutes: mediaDiet.readingMinutes,
                percentage: Math.round(mediaDiet.readingPercentage),
              },
              audio: {
                minutes: mediaDiet.audioMinutes,
                percentage: Math.round(mediaDiet.audioPercentage),
              },
            },
            pattern: dominant,
            readingToVideoRatio: readingToVideoRatio === Infinity ? "All reading" : Math.round(readingToVideoRatio * 100) / 100,
            suggestion: readingToVideoRatio < 0.5
              ? "May benefit from more reading-based content"
              : readingToVideoRatio > 2
                ? "Good balance of reading activity"
                : "Balanced media consumption",
          },
        };
      },
    }),

    think_aloud: tool({
      description: "Use this tool to think through your analysis before writing the final report. This helps you organize insights and ensure comprehensive coverage. Call this multiple times as you develop your thinking.",
      parameters: z.object({
        thought: z.string().describe("Your current thinking or analysis step"),
        category: z.enum(["observation", "pattern", "concern", "positive", "recommendation"]).describe("Type of thought"),
      }),
      execute: async ({ thought, category }) => {
        return {
          recorded: true,
          category,
          thought,
          note: "Continue your analysis. Use this tool multiple times to develop a comprehensive understanding before writing the final report.",
        };
      },
    }),
  };
}

/**
 * System prompt for the health report agent
 */
const HEALTH_REPORT_SYSTEM_PROMPT = `You are a supportive cognitive wellness assistant. Your role is to analyze user activity data and generate a helpful, non-judgmental health report.

CRITICAL GUIDELINES:
1. Use SOFT LANGUAGE always:
   - Say "may indicate", "possible signal", "worth noticing", "pattern suggests"
   - Never say: diagnose, disorder, illness, depression, anxiety, ADHD, addiction, problem, issue

2. NEVER provide medical advice or suggest conditions

3. Be CALM and SUPPORTIVE:
   - Acknowledge effort and positive patterns
   - Frame challenges as opportunities
   - Be encouraging without being patronizing

4. CITE SPECIFIC METRICS:
   - Reference actual numbers from the data
   - Compare to their own trends (not external benchmarks)
   - Use relative language ("compared to your previous week")

5. THINK BEFORE WRITING:
   - Use the think_aloud tool multiple times to organize your analysis
   - Consider multiple angles before drawing conclusions
   - Look for both patterns and outliers

REPORT STRUCTURE (follow this exactly):

## Overview
2-3 paragraphs providing a warm, comprehensive summary of the analysis period. Acknowledge the user directly with "you/your".

## Key Signals
- Bulleted list of 4-6 notable observations
- Each backed by specific data
- Mix of positive and areas for attention

## What Improved
- 2-4 positive trends or patterns
- Celebrate progress, even small wins

## What May Need Attention
- 2-3 areas that might benefit from awareness
- Frame as opportunities, not problems
- Use soft language

## Recommendations
- Maximum 3 specific, actionable suggestions
- Based directly on the data patterns
- Realistic and achievable

## One Experiment for Next Week
A single, concrete thing to try. Frame it as an experiment, not a requirement.

## Closing
A supportive paragraph acknowledging their journey and effort in tracking their cognitive wellness.

---

Remember: Your goal is to help the user understand their patterns and make informed choices about their digital habits. You are NOT a medical professional and should never imply diagnosis or treatment.`;

/**
 * Generate a health report using the agentic approach
 */
export async function generateHealthReport(
  userId: string,
  timeRange: TimeRange = 7,
  onProgress?: (progress: ReportGenerationProgress) => void
): Promise<HealthReport> {
  const reportId = `report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const generationSteps: ReportGenerationProgress[] = [];

  const emitProgress = (step: string, message: string, toolName?: string, toolResult?: unknown) => {
    const progress: ReportGenerationProgress = {
      step,
      message,
      toolName,
      toolResult,
      timestamp: new Date(),
    };
    generationSteps.push(progress);
    if (onProgress) {
      onProgress(progress);
    }
    // Also emit via SSE for real-time updates
    events.emitHealthReportProgress({
      userId,
      reportId,
      progress,
    });
  };

  emitProgress("init", `Starting health report generation for ${timeRange} days`);

  // Get user settings for LLM
  const settings = await db.userSettings.findUnique({
    where: { userId },
  });

  const llmService = createLLMService(settings);

  // Get health metrics first
  emitProgress("metrics", "Gathering health metrics...");
  const metrics = await getHealthMetrics(userId, timeRange);
  emitProgress("metrics_complete", "Health metrics gathered", "get_health_metrics", { timeRange, metricsKeys: Object.keys(metrics) });

  // Create tools
  const tools = createHealthReportTools(userId, timeRange);

  // Build the initial prompt with metrics summary
  const initialPrompt = `Please generate a comprehensive cognitive wellness report for the past ${timeRange} days.

Here is the summary of my health metrics:

ACTIVITY SUMMARY:
- Average daily active minutes: ${metrics.averageDailyActiveMinutes} min (trend: ${metrics.activeMinutesTrend > 0 ? "+" : ""}${metrics.activeMinutesTrend}%)
- Average focus minutes per day: ${metrics.averageFocusMinutes} min (trend: ${metrics.focusTrend > 0 ? "+" : ""}${metrics.focusTrend}%)
- Fragmentation rate: ${Math.round(metrics.overallFragmentationRate.fragmentationPercentage)}% of visits under 60 seconds

TIMING PATTERNS:
- First activity hour (avg): ${metrics.averageFirstActivityHour !== null ? metrics.averageFirstActivityHour.toFixed(1) : "N/A"}
- Last activity hour (avg): ${metrics.averageLastActivityHour !== null ? metrics.averageLastActivityHour.toFixed(1) : "N/A"}
- Late night activity: ${metrics.averageLateNightMinutes} min/day avg (trend: ${metrics.lateNightTrend > 0 ? "+" : ""}${metrics.lateNightTrend}%)

FOCUS GUARDIAN NUDGES:
- Average nudges per day: ${metrics.averageNudgesPerDay} (trend: ${metrics.nudgeTrend > 0 ? "+" : ""}${metrics.nudgeTrend}%)

MEDIA CONSUMPTION:
- YouTube: ${metrics.mediaDiet.youtubeMinutes} min (${Math.round(metrics.mediaDiet.youtubePercentage)}%)
- Reading: ${metrics.mediaDiet.readingMinutes} min (${Math.round(metrics.mediaDiet.readingPercentage)}%)
- Audio: ${metrics.mediaDiet.audioMinutes} min (${Math.round(metrics.mediaDiet.audioPercentage)}%)

ATTENTION DISTRIBUTION:
- Entropy score: ${metrics.attentionEntropy.entropy}/100 (higher = more scattered)
- Unique domains: ${metrics.attentionEntropy.uniqueDomains}
- Top domains: ${metrics.attentionEntropy.topDomains.slice(0, 5).map((d) => `${d.domain} (${Math.round(d.percentage)}%)`).join(", ")}

Please:
1. Use the think_aloud tool multiple times to organize your analysis
2. Call additional tools if you need more context (analyze_sleep_patterns, analyze_focus_quality, analyze_media_balance, get_nudge_history)
3. Generate a comprehensive report following the structure in your instructions`;

  emitProgress("analysis", "Starting LLM analysis with tool access...");

  // Use the LLM with tools
  const provider = llmService.getProvider();

  let reportContent = "";
  let iterations = 0;
  const maxIterations = 10;

  type LLMMessageRole = "user" | "assistant";
  let messages: Array<{ role: LLMMessageRole; content: string }> = [
    { role: "user", content: initialPrompt },
  ];

  // Agentic loop - let the LLM call tools and think
  while (iterations < maxIterations) {
    iterations++;

    try {
      const response = await provider.generate({
        messages,
        tools,
        systemPrompt: HEALTH_REPORT_SYSTEM_PROMPT,
      });

      // If no tool calls, we have the final response
      if (!response.toolCalls || response.toolCalls.length === 0) {
        reportContent = response.content;
        emitProgress("complete", "Report generation complete");
        break;
      }

      // Process tool calls
      emitProgress("tools", `Processing ${response.toolCalls.length} tool calls...`);

      // Add assistant message with tool calls info
      messages.push({
        role: "assistant",
        content: response.content || `[Calling tools: ${response.toolCalls.map(t => t.toolName).join(", ")}]`,
      });

      // Execute each tool call and build results
      const toolResults: string[] = [];
      for (const toolCall of response.toolCalls) {
        const toolName = toolCall.toolName;
        const toolArgs = toolCall.args;

        emitProgress("tool_call", `Calling ${toolName}...`, toolName);

        try {
          // Get the tool
          const toolFn = tools[toolName as keyof typeof tools];
          if (!toolFn) {
            throw new Error(`Unknown tool: ${toolName}`);
          }

          // Execute the tool
          const result = await (toolFn as any).execute(toolArgs);
          emitProgress("tool_result", `${toolName} completed`, toolName, result);

          toolResults.push(`[Tool: ${toolName}]\n${JSON.stringify(result, null, 2)}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : "Tool execution failed";
          emitProgress("tool_error", `Error in ${toolName}: ${errorMsg}`, toolName);
          toolResults.push(`[Tool: ${toolName}]\nError: ${errorMsg}`);
        }
      }

      // Add tool results as a user message
      messages.push({
        role: "user",
        content: `Tool results:\n\n${toolResults.join("\n\n")}\n\nPlease continue your analysis or generate the final report if you have enough information.`,
      });
    } catch (error) {
      emitProgress("error", `LLM error: ${error instanceof Error ? error.message : "Unknown error"}`);
      break;
    }
  }

  // If we hit max iterations without a final response
  if (!reportContent && iterations >= maxIterations) {
    emitProgress("timeout", "Report generation reached maximum iterations, finalizing...");

    // Make one final call to get the report
    try {
      messages.push({
        role: "user",
        content: "Please finalize your report now based on all the analysis you've done. Output the complete report following the structure in your instructions.",
      });

      const finalResponse = await provider.generate({
        messages,
        systemPrompt: HEALTH_REPORT_SYSTEM_PROMPT,
      });

      reportContent = finalResponse.content;
      emitProgress("complete", "Report generation complete (after finalization)");
    } catch (error) {
      reportContent = "Unable to generate report due to an error. Please try again.";
      emitProgress("error", `Final generation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  const report: HealthReport = {
    id: reportId,
    userId,
    timeRange,
    metrics,
    report: reportContent,
    generationSteps,
    createdAt: new Date(),
  };

  return report;
}
