"use client";

import { useEffect, useState, useCallback } from "react";
import {
  createApiClient,
  type CognitiveHealthSummary,
  type CognitiveHealthTimeRange,
  type CognitiveHealthReport,
  type CognitiveHealthNudge,
  type ReportGenerationStep,
} from "@kaizen/api-client";
import { Button } from "@kaizen/ui";
import {
  Activity,
  Moon,
  Target,
  AlertTriangle,
  BookOpen,
  Youtube,
  Headphones,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  FileText,
  Sparkles,
  Clock,
  Zap,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  GraduationCap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface HealthTabProps {
  apiUrl: string;
  getToken: () => Promise<string | null>;
}

function formatHour(hour: number | null): string {
  if (hour === null) return "N/A";
  const h = Math.floor(hour);
  const m = Math.round((hour % 1) * 60);
  const period = h >= 12 ? "PM" : "AM";
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${m.toString().padStart(2, "0")} ${period}`;
}

function TrendIndicator({ value, inverse = false }: { value: number; inverse?: boolean }) {
  // For some metrics, lower is better (like late night usage, nudges)
  const isPositive = inverse ? value < 0 : value > 0;
  const isNegative = inverse ? value > 0 : value < 0;

  if (Math.abs(value) < 5) {
    return (
      <span className="flex items-center text-muted-foreground text-xs">
        <Minus className="w-3 h-3 mr-1" />
        stable
      </span>
    );
  }

  if (isPositive) {
    return (
      <span className="flex items-center text-green-600 dark:text-green-400 text-xs">
        <TrendingUp className="w-3 h-3 mr-1" />
        +{Math.abs(value)}%
      </span>
    );
  }

  return (
    <span className="flex items-center text-amber-600 dark:text-amber-400 text-xs">
      <TrendingDown className="w-3 h-3 mr-1" />
      -{Math.abs(value)}%
    </span>
  );
}

function MetricCard({
  title,
  value,
  unit,
  trend,
  trendInverse,
  icon: Icon,
  description,
  className = "",
}: {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  trendInverse?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={`p-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-colors ${className}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="p-2 rounded-lg bg-secondary/10">
          <Icon className="w-4 h-4 text-secondary" />
        </div>
        {trend !== undefined && (
          <TrendIndicator value={trend} inverse={trendInverse} />
        )}
      </div>
      <div className="mt-3">
        <p className="text-2xl font-bold text-foreground">
          {value}
          {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
        </p>
        <p className="text-sm text-muted-foreground mt-1">{title}</p>
        {description && (
          <p className="text-xs text-muted-foreground/70 mt-1">{description}</p>
        )}
      </div>
    </div>
  );
}

function MediaDietBar({ youtube, reading, audio }: { youtube: number; reading: number; audio: number }) {
  const total = youtube + reading + audio;
  if (total === 0) {
    return (
      <div className="h-3 rounded-full bg-muted">
        <div className="h-full rounded-full bg-muted-foreground/30 flex items-center justify-center">
          <span className="text-[8px] text-muted-foreground">No data</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-3 rounded-full bg-muted overflow-hidden flex">
        {youtube > 0 && (
          <div
            className="h-full bg-red-500"
            style={{ width: `${(youtube / total) * 100}%` }}
            title={`YouTube: ${youtube}min`}
          />
        )}
        {reading > 0 && (
          <div
            className="h-full bg-blue-500"
            style={{ width: `${(reading / total) * 100}%` }}
            title={`Reading: ${reading}min`}
          />
        )}
        {audio > 0 && (
          <div
            className="h-full bg-green-500"
            style={{ width: `${(audio / total) * 100}%` }}
            title={`Audio: ${audio}min`}
          />
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          YouTube {youtube}m
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          Reading {reading}m
        </span>
        <span className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          Audio {audio}m
        </span>
      </div>
    </div>
  );
}

function NudgeItem({ nudge }: { nudge: CognitiveHealthNudge }) {
  const typeColors: Record<string, string> = {
    doomscroll: "bg-red-500/10 text-red-600 border-red-500/20",
    distraction: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    break: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    focus_drift: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    encouragement: "bg-green-500/10 text-green-600 border-green-500/20",
  };

  const typeLabels: Record<string, string> = {
    doomscroll: "Doomscroll",
    distraction: "Distraction",
    break: "Break",
    focus_drift: "Focus Drift",
    encouragement: "Encouragement",
  };

  return (
    <div className="p-3 rounded-lg border border-border/50 bg-card/30">
      <div className="flex items-center justify-between mb-2">
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${typeColors[nudge.type] || "bg-muted"}`}
        >
          {typeLabels[nudge.type] || nudge.type}
        </span>
        <span className="text-xs text-muted-foreground">
          {new Date(nudge.createdAt).toLocaleDateString()}
        </span>
      </div>
      <p className="text-sm text-foreground">{nudge.message}</p>
      {nudge.response && (
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          {nudge.response === "acknowledged" && (
            <>
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Acknowledged
            </>
          )}
          {nudge.response === "false_positive" && (
            <>
              <XCircle className="w-3 h-3 text-amber-500" />
              False positive
            </>
          )}
          {nudge.response === "dismissed" && (
            <>
              <Minus className="w-3 h-3" />
              Dismissed
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ReportProgress({ steps }: { steps: ReportGenerationStep[] }) {
  const [expanded, setExpanded] = useState(false);
  const visibleSteps = expanded ? steps : steps.slice(-3);

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {steps.length} steps
      </button>
      <div className="space-y-1">
        {visibleSteps.map((step, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
          >
            {step.toolName ? (
              <Zap className="w-3 h-3 text-secondary flex-shrink-0" />
            ) : (
              <Activity className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            )}
            <span className="truncate">
              {step.toolName ? (
                <span className="font-mono text-secondary">{step.toolName}</span>
              ) : (
                step.message
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HealthTab({ apiUrl, getToken }: HealthTabProps) {
  const [timeRange, setTimeRange] = useState<CognitiveHealthTimeRange>(7);
  const [summary, setSummary] = useState<CognitiveHealthSummary | null>(null);
  const [nudges, setNudges] = useState<CognitiveHealthNudge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Report generation state
  const [report, setReport] = useState<CognitiveHealthReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportProgress, setReportProgress] = useState<ReportGenerationStep[]>([]);
  const [showNudges, setShowNudges] = useState(false);

  const getTokenFn = useCallback(async () => {
    return getToken();
  }, [getToken]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const api = createApiClient(apiUrl, getTokenFn);
      const [summaryRes, nudgesRes] = await Promise.all([
        api.cognitiveHealth.getSummary(timeRange),
        api.cognitiveHealth.getNudges(10),
      ]);

      if (summaryRes.success) {
        setSummary(summaryRes.summary);
      }
      if (nudgesRes.success) {
        setNudges(nudgesRes.nudges);
      }
    } catch (err) {
      console.error("Failed to load health data:", err);
      setError("Failed to load health data");
    } finally {
      setLoading(false);
    }
  }, [apiUrl, getTokenFn, timeRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateReport = async () => {
    setReportLoading(true);
    setReportProgress([]);
    setReport(null);

    try {
      const api = createApiClient(apiUrl, getTokenFn);
      const res = await api.cognitiveHealth.generateReport(timeRange);

      if (res.success) {
        setReport(res.report);
        setReportProgress(res.report.generationSteps);
      }
    } catch (err) {
      console.error("Failed to generate report:", err);
      setError("Failed to generate report");
    } finally {
      setReportLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-secondary" />
      </div>
    );
  }

  if (error && !summary) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p>{error}</p>
        <Button onClick={loadData} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with time range selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Cognitive Health</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Understanding your digital wellness patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {([7, 14, 30, 90] as CognitiveHealthTimeRange[]).map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1.5 text-sm transition-colors ${
                  timeRange === days
                    ? "bg-secondary text-secondary-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {days}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {summary && (
        <>
          {/* Summary Cards - Bento Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              title="Daily Active Time"
              value={summary.activity.averageActiveMinutes}
              unit="min/day"
              trend={summary.activity.trend}
              icon={Activity}
              description="Average time actively browsing"
            />

            <MetricCard
              title="Focus Time"
              value={summary.focus.averageFocusMinutes}
              unit="min/day"
              trend={summary.focus.trend}
              icon={Target}
              description="Detected focus sessions"
            />

            <MetricCard
              title="Fragmentation"
              value={summary.focus.fragmentationRate}
              unit="%"
              trendInverse
              icon={AlertTriangle}
              description="Visits under 60 seconds"
            />

            <MetricCard
              title="Late Night Activity"
              value={summary.sleepProxy.lateNightMinutes}
              unit="min/day"
              trend={summary.sleepProxy.lateNightTrend}
              trendInverse
              icon={Moon}
              description="Activity between 11PM-5AM"
            />
          </div>

          {/* Second row of cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard
              title="Quiz Accuracy"
              value={summary.quizRetention.totalQuizzes > 0 ? summary.quizRetention.accuracy : "—"}
              unit={summary.quizRetention.totalQuizzes > 0 ? "%" : ""}
              trend={summary.quizRetention.totalQuizzes > 0 ? summary.quizRetention.trend : undefined}
              icon={GraduationCap}
              description={summary.quizRetention.totalQuizzes > 0
                ? `${summary.quizRetention.correctAnswers}/${summary.quizRetention.totalQuestions} correct`
                : "No quizzes taken"
              }
            />

            <div className="p-4 rounded-xl border border-border/50 bg-card/50 col-span-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 rounded-lg bg-secondary/10">
                  <Brain className="w-4 h-4 text-secondary" />
                </div>
                <h3 className="font-medium text-foreground">Knowledge Retention</h3>
              </div>
              {summary.quizRetention.totalQuizzes > 0 ? (
                <div className="grid grid-cols-3 gap-4 mt-3">
                  <div>
                    <p className="text-2xl font-bold text-foreground">{summary.quizRetention.totalQuizzes}</p>
                    <p className="text-xs text-muted-foreground">Quizzes completed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{summary.quizRetention.totalQuestions}</p>
                    <p className="text-xs text-muted-foreground">Questions answered</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full transition-all ${
                            summary.quizRetention.accuracy >= 70 ? "bg-green-500" :
                            summary.quizRetention.accuracy >= 50 ? "bg-amber-500" : "bg-red-500"
                          }`}
                          style={{ width: `${summary.quizRetention.accuracy}%` }}
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary.quizRetention.accuracy >= 70 ? "Strong retention" :
                         summary.quizRetention.accuracy >= 50 ? "Moderate retention" : "Needs attention"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">
                  Complete quizzes to track your knowledge retention from consumed content.
                </p>
              )}
            </div>
          </div>

          {/* Activity Timing */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/50 bg-card/50">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-4 h-4 text-secondary" />
                <h3 className="font-medium text-foreground">Activity Window</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">First activity</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatHour(summary.sleepProxy.avgFirstActivityHour)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last activity</p>
                  <p className="text-lg font-semibold text-foreground">
                    {formatHour(summary.sleepProxy.avgLastActivityHour)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Based on digital activity patterns. May indicate screen time boundaries.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-border/50 bg-card/50">
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-secondary" />
                <h3 className="font-medium text-foreground">Attention Distribution</h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground">Entropy Score</p>
                  <p className="text-lg font-semibold text-foreground">
                    {summary.attention.entropy}/100
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {summary.attention.entropy > 70
                      ? "Scattered attention"
                      : summary.attention.entropy > 40
                        ? "Balanced focus"
                        : "Concentrated focus"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Unique domains</p>
                  <p className="text-lg font-semibold text-foreground">
                    {summary.attention.uniqueDomains}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Media Diet */}
          <div className="p-4 rounded-xl border border-border/50 bg-card/50">
            <div className="flex items-center gap-2 mb-4">
              <BookOpen className="w-4 h-4 text-secondary" />
              <h3 className="font-medium text-foreground">Media Diet</h3>
            </div>
            <MediaDietBar
              youtube={summary.mediaDiet.youtube}
              reading={summary.mediaDiet.reading}
              audio={summary.mediaDiet.audio}
            />
          </div>

          {/* Nudges */}
          <div className="p-4 rounded-xl border border-border/50 bg-card/50">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-secondary" />
                <h3 className="font-medium text-foreground">Focus Guardian Nudges</h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {summary.nudges.averagePerDay.toFixed(1)} avg/day
                </span>
                <TrendIndicator value={summary.nudges.trend} inverse />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center p-2 rounded-lg bg-red-500/10">
                <p className="text-lg font-semibold text-red-600">{summary.nudges.breakdown.doomscroll}</p>
                <p className="text-xs text-muted-foreground">Doomscroll</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-500/10">
                <p className="text-lg font-semibold text-amber-600">{summary.nudges.breakdown.distraction}</p>
                <p className="text-xs text-muted-foreground">Distraction</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-blue-500/10">
                <p className="text-lg font-semibold text-blue-600">{summary.nudges.breakdown.break}</p>
                <p className="text-xs text-muted-foreground">Break</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-purple-500/10">
                <p className="text-lg font-semibold text-purple-600">{summary.nudges.breakdown.focusDrift}</p>
                <p className="text-xs text-muted-foreground">Focus Drift</p>
              </div>
            </div>

            {nudges.length > 0 && (
              <>
                <button
                  onClick={() => setShowNudges(!showNudges)}
                  className="flex items-center gap-1 text-sm text-secondary hover:underline"
                >
                  {showNudges ? "Hide" : "Show"} recent nudges
                  {showNudges ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
                {showNudges && (
                  <div className="mt-4 space-y-2 max-h-64 overflow-auto">
                    {nudges.map((nudge) => (
                      <NudgeItem key={nudge.id} nudge={nudge} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Generate Report Section */}
          <div className="p-6 rounded-xl border border-secondary/30 bg-secondary/5">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-secondary" />
                  <h3 className="text-lg font-medium text-foreground">Health Report</h3>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  Generate a comprehensive cognitive wellness report with personalized insights
                  and recommendations based on your activity patterns.
                </p>
              </div>
              <Button
                onClick={handleGenerateReport}
                disabled={reportLoading}
                className="gap-2"
              >
                {reportLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Report
                  </>
                )}
              </Button>
            </div>

            {/* Report Progress */}
            {reportLoading && reportProgress.length > 0 && (
              <div className="mt-6 p-4 rounded-lg bg-card/50 border border-border/50">
                <p className="text-sm font-medium text-foreground mb-3">Agent Progress</p>
                <ReportProgress steps={reportProgress} />
              </div>
            )}

            {/* Generated Report */}
            {report && !reportLoading && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  <span className="text-sm text-muted-foreground">
                    Generated on {new Date(report.createdAt).toLocaleString()}
                  </span>
                </div>

                {/* Agent Steps (collapsed by default) */}
                <details className="mb-4">
                  <summary className="cursor-pointer text-sm text-secondary hover:underline">
                    View agent reasoning ({report.generationSteps.length} steps)
                  </summary>
                  <div className="mt-2 p-4 rounded-lg bg-muted/50 max-h-64 overflow-auto">
                    <ReportProgress steps={report.generationSteps} />
                  </div>
                </details>

                {/* Report Content */}
                {report.content && report.content.trim() ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none p-6 rounded-lg bg-card border border-border">
                    <ReactMarkdown>{report.content}</ReactMarkdown>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 rounded-lg bg-muted/30 border border-border text-center">
                    <AlertTriangle className="w-10 h-10 text-amber-500/70 mb-3" />
                    <p className="text-sm font-medium text-foreground mb-1">
                      Unable to generate report
                    </p>
                    <p className="text-xs text-muted-foreground max-w-sm">
                      There may not be enough browsing data for the selected time range, or the AI model returned an empty response. Try selecting a longer time range or browsing more before generating a report.
                    </p>
                    <Button
                      onClick={handleGenerateReport}
                      className="mt-4"
                      variant="outline"
                      size="sm"
                    >
                      <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                      Try Again
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
