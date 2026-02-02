"use client";

/**
 * CompactStatsCard - Professional statistics with donut chart
 */

import { motion } from "framer-motion"
import { BarChart3, Clock } from "lucide-react"
import { useMemo } from "react"

import { formatDuration } from "../lib"
import type { BackendFocus, WinWithParsedData } from "../types"

interface CompactStatsCardProps {
    focusHistory: BackendFocus[]
    wins: WinWithParsedData[]
    isLoading?: boolean
}

// Helper to calculate stats from BackendFocus data
function calculateStatsFromBackendFocus(focusHistory: BackendFocus[], wins: WinWithParsedData[]) {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;

    // Filter today's focus records
    const todayFocus = focusHistory.filter(f => new Date(f.timestamp).getTime() >= oneDayAgo);
    const weekFocus = focusHistory.filter(f => new Date(f.timestamp).getTime() >= oneWeekAgo);

    // Calculate daily and weekly totals based on time windows
    const dailyTotal = todayFocus.reduce((sum, f) => {
        const duration = new Date(f.windowEnd).getTime() - new Date(f.windowStart).getTime();
        return sum + duration;
    }, 0);

    const weeklyTotal = weekFocus.reduce((sum, f) => {
        const duration = new Date(f.windowEnd).getTime() - new Date(f.windowStart).getTime();
        return sum + duration;
    }, 0);

    // Group by category for top activities
    const categoryTotals = todayFocus.reduce((acc, f) => {
        const duration = new Date(f.windowEnd).getTime() - new Date(f.windowStart).getTime();
        acc[f.category] = (acc[f.category] || 0) + duration;
        return acc;
    }, {} as Record<string, number>);

    const topActivities = Object.entries(categoryTotals)
        .map(([name, time]) => ({ name, time }))
        .sort((a, b) => b.time - a.time);

    const primeActivity = topActivities[0] ? {
        name: topActivities[0].name,
        totalTime: topActivities[0].time,
        percentage: (topActivities[0].time / dailyTotal) * 100
    } : null;

    return {
        dailyTotal,
        weeklyTotal,
        topActivities,
        primeActivity,
        dailyWins: wins.filter(w => w.recorded_at >= oneDayAgo).length,
        weeklyWins: wins.filter(w => w.recorded_at >= oneWeekAgo).length,
    };
}

// Donut chart component
function DonutChart({
    data
}: {
    data: Array<{ name: string; value: number; color: string }>
}) {
    const total = data.reduce((sum, item) => sum + item.value, 0)
    const size = 160
    const strokeWidth = 24
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const center = size / 2

    let currentAngle = -90 // Start from top

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="transform -rotate-90">
                {/* Background circle */}
                <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={strokeWidth}
                    className="text-gray-200 dark:text-gray-800"
                />

                {/* Data segments */}
                {data.map((item, index) => {
                    const percentage = (item.value / total) * 100
                    const segmentLength = (percentage / 100) * circumference

                    const startAngle = currentAngle
                    currentAngle += (percentage / 100) * 360

                    return (
                        <motion.circle
                            key={index}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke={item.color}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${segmentLength} ${circumference}`}
                            strokeDashoffset={-((startAngle + 90) / 360) * circumference}
                            strokeLinecap="round"
                            initial={{ strokeDasharray: `0 ${circumference}` }}
                            animate={{ strokeDasharray: `${segmentLength} ${circumference}` }}
                            transition={{ duration: 1, delay: index * 0.1, ease: "easeOut" }}
                        />
                    )
                })}
            </svg>

            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {data.length}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    Activities
                </div>
            </div>
        </div>
    )
}

export function CompactStatsCard({
    focusHistory,
    wins,
    isLoading = false
}: CompactStatsCardProps) {
    const stats = useMemo(
        () => calculateStatsFromBackendFocus(focusHistory, wins),
        [focusHistory, wins]
    )

    const chartData = useMemo(() => {
        const colors = [
            "#3b82f6", // blue
            "#8b5cf6", // purple
            "#10b981", // green
            "#f59e0b", // amber
            "#ef4444" // red
        ]

        return stats.topActivities.slice(0, 5).map((activity: any, index: number) => ({
            name: activity.name,
            value: activity.time,
            color: colors[index],
            percentage:
                stats.dailyTotal > 0 ? (activity.time / stats.dailyTotal) * 100 : 0
        }))
    }, [stats.topActivities, stats.dailyTotal])

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                    <div className="h-24 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
            </div>
        )
    }

    const hasData = stats.dailyTotal > 0

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 hover:shadow-md">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-lime-100 dark:bg-lime-700/30">
                        <BarChart3 className="w-5 h-5 text-lime-700 dark:text-lime-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Today's Stats
                    </h3>
                </div>
            </div>

            {!hasData ? (
                <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Clock className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No data yet - start focusing to see stats
                    </p>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* Total Time */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-gray-400" />
                            <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-0.5">
                                    Total Focus Time
                                </div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {formatDuration(stats.dailyTotal)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Donut Chart & Legend */}
                    {chartData.length > 0 && (
                        <div className="flex items-center gap-6">
                            {/* Donut Chart */}
                            <div className="shrink-0">
                                <DonutChart data={chartData} />
                            </div>

                            {/* Legend */}
                            <div className="flex-1 space-y-2.5">
                                {chartData.map((item: any, index: number) => (
                                    <motion.div
                                        key={item.name}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.1 }}
                                        className="flex items-center gap-2">
                                        <div
                                            className="w-3 h-3 rounded-sm shrink-0"
                                            style={{ backgroundColor: item.color }}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm text-gray-700 dark:text-gray-300 truncate pr-2">
                                                    {item.name}
                                                </span>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 font-medium tabular-nums">
                                                    {item.percentage.toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                                                {formatDuration(item.value)}
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Top Activity Highlight */}
                    {stats.primeActivity && (
                        <div className="border-t border-gray-200 dark:border-gray-800 pt-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                                    <span className="text-lg">🏆</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide font-medium mb-1">
                                        Top Activity
                                    </div>
                                    <div className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate mb-1">
                                        {stats.primeActivity.name}
                                    </div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        {formatDuration(stats.primeActivity.totalTime)} •{" "}
                                        {stats.primeActivity.percentage.toFixed(0)}% of total
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
