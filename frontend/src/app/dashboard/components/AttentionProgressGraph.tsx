"use client";

import { TrendingUp } from "lucide-react"
import { useMemo, useState } from "react"

import type { BackendFocus } from "../types"

interface AttentionProgressGraphProps {
    focusHistory: BackendFocus[]
    isLoading?: boolean
}

interface DataPoint {
    time: string
    value: number
    timestamp: number
    cumulativeTime: number
    focusItem?: string
    color: string
}

const FOCUS_COLORS = [
    { gradient: "from-emerald-400 to-teal-500", solid: "#10b981", bg: "bg-emerald-500" },
    { gradient: "from-violet-400 to-purple-500", solid: "#8b5cf6", bg: "bg-violet-500" },
    { gradient: "from-rose-400 to-pink-500", solid: "#f43f5e", bg: "bg-rose-500" },
    { gradient: "from-amber-400 to-orange-500", solid: "#f59e0b", bg: "bg-amber-500" },
    { gradient: "from-cyan-400 to-blue-500", solid: "#06b6d4", bg: "bg-cyan-500" },
]

const getColorForItem = (_item: string, index: number): typeof FOCUS_COLORS[0] => {
    return FOCUS_COLORS[index % FOCUS_COLORS.length]
}

const formatTimeLabel = (minutes: number): string => {
    if (minutes < 1) return "0"
    if (minutes < 60) return `${Math.round(minutes)}m`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

const getItemInitial = (item: string): string => {
    const trimmed = item.trim()
    const emojiMatch = trimmed.match(/^[\p{Emoji}]/u)
    if (emojiMatch) return emojiMatch[0]
    return trimmed.charAt(0).toUpperCase()
}

export function AttentionProgressGraph({
    focusHistory,
    isLoading = false
}: AttentionProgressGraphProps) {
    const [hoveredPoint, setHoveredPoint] = useState<number | null>(null)

    const { chartData, topFocusItems, totalTime, maxValue, focusColorMap, timeRangeLabel } = useMemo(() => {
        if (!focusHistory.length) {
            return {
                chartData: [],
                topFocusItems: [],
                totalTime: 0,
                maxValue: 1,
                focusColorMap: new Map(),
                timeRangeLabel: "No data"
            }
        }

        // Convert BackendFocus to sessions based on time windows
        const allSessions: {
            start: number
            end: number
            duration: number
            focusItem: string
        }[] = []

        focusHistory.forEach((focus) => {
            const start = new Date(focus.windowStart).getTime();
            const end = new Date(focus.windowEnd).getTime();
            const duration = end - start;
            allSessions.push({
                start,
                end,
                duration,
                focusItem: focus.summary.slice(0, 50) // Use summary as focus item
            });
        });

        if (allSessions.length === 0) {
            return {
                chartData: [],
                topFocusItems: [],
                totalTime: 0,
                maxValue: 1,
                focusColorMap: new Map(),
                timeRangeLabel: "No data"
            }
        }

        allSessions.sort((a, b) => a.start - b.start)

        const focusItemTotals = new Map<string, number>()
        allSessions.forEach((session) => {
            const current = focusItemTotals.get(session.focusItem) || 0
            focusItemTotals.set(session.focusItem, current + session.duration)
        })

        const topItems = Array.from(focusItemTotals.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([item]) => item)

        const colorMap = new Map<string, typeof FOCUS_COLORS[0]>()
        topItems.forEach((item, index) => {
            colorMap.set(item, getColorForItem(item, index))
        })

        const firstSessionStart = allSessions[0].start
        const now = Date.now()
        const totalDuration = now - firstSessionStart

        const timeSinceFirst = Math.round(totalDuration / (60 * 60 * 1000))
        let rangeLabel = "Since first focus"
        if (timeSinceFirst < 1) {
            rangeLabel = "Last hour"
        } else if (timeSinceFirst < 24) {
            rangeLabel = `Last ${timeSinceFirst}h`
        } else {
            const days = Math.round(timeSinceFirst / 24)
            rangeLabel = days === 1 ? "Last day" : `Last ${days} days`
        }

        const numBuckets = Math.min(24, Math.max(6, Math.ceil(totalDuration / (60 * 60 * 1000))))
        const bucketSize = totalDuration / numBuckets

        const hourlyData: Map<number, { duration: number; focusItem?: string; maxDuration: number }> = new Map()

        for (let i = 0; i < numBuckets; i++) {
            const bucketStart = firstSessionStart + (i * bucketSize)
            hourlyData.set(bucketStart, {
                duration: 0,
                focusItem: undefined,
                maxDuration: 0
            })
        }

        allSessions.forEach((session) => {
            const bucketIndex = Math.min(
                numBuckets - 1,
                Math.floor((session.start - firstSessionStart) / bucketSize)
            )
            const bucketStart = firstSessionStart + (bucketIndex * bucketSize)

            if (hourlyData.has(bucketStart)) {
                const current = hourlyData.get(bucketStart)!
                const newDuration = current.duration + session.duration
                if (session.duration > current.maxDuration) {
                    hourlyData.set(bucketStart, {
                        duration: newDuration,
                        focusItem: session.focusItem,
                        maxDuration: session.duration
                    })
                } else {
                    hourlyData.set(bucketStart, { ...current, duration: newDuration })
                }
            }
        })

        const dataPoints: DataPoint[] = []
        let cumulativeTime = 0

        hourlyData.forEach((data, timestamp) => {
            const minutes = Math.round(data.duration / 60000)
            cumulativeTime += minutes

            const itemColor = data.focusItem
                ? (colorMap.get(data.focusItem) || FOCUS_COLORS[0])
                : FOCUS_COLORS[0]

            dataPoints.push({
                time: formatTimeLabel(cumulativeTime),
                value: minutes,
                timestamp,
                cumulativeTime,
                focusItem: data.focusItem,
                color: itemColor.solid
            })
        })

        const sortedData = dataPoints.sort((a, b) => a.timestamp - b.timestamp)
        const total = sortedData.reduce((acc, d) => acc + d.value, 0)
        const max = Math.max(...sortedData.map((d) => d.value), 1)

        return {
            chartData: sortedData,
            topFocusItems: topItems,
            totalTime: total,
            maxValue: max,
            focusColorMap: colorMap,
            timeRangeLabel: rangeLabel
        }
    }, [focusHistory])

    const xLabels = useMemo(() => {
        if (totalTime === 0) return ["0", "0", "0", "0", "0"]
        const step = totalTime / 4
        return [0, step, step * 2, step * 3, totalTime].map((t) => formatTimeLabel(t))
    }, [totalTime])

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                    <div className="h-40 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
            </div>
        )
    }

    const chartHeight = 120

    const generateSmoothPath = () => {
        if (chartData.length < 2) return ""
        const points = chartData.map((d, i) => ({
            x: (i / (chartData.length - 1)) * 100,
            y: chartHeight - (d.value / maxValue) * (chartHeight - 10) - 5
        }))
        let path = `M ${points[0].x},${points[0].y}`
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i - 1] || points[i]
            const p1 = points[i]
            const p2 = points[i + 1]
            const p3 = points[i + 2] || p2
            const tension = 0.3
            const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3
            const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3
            const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3
            const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3
            path += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
        }
        return path
    }

    const generateSmoothAreaPath = () => {
        if (chartData.length < 2) return ""
        const linePath = generateSmoothPath()
        const lastX = ((chartData.length - 1) / (chartData.length - 1)) * 100
        return `${linePath} L ${lastX},${chartHeight} L 0,${chartHeight} Z`
    }

    const significantPoints = chartData
        .map((d, i) => ({ ...d, index: i }))
        .filter((d) => d.value > maxValue * 0.3 && d.focusItem)
        .slice(0, 4)

    const yLabels = [maxValue, Math.round(maxValue / 2), 0]

    return (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-950 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                        <TrendingUp className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Attention Progress
                    </h3>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium">
                        {formatTimeLabel(totalTime)} total
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        {timeRangeLabel}
                    </span>
                </div>
            </div>

            {chartData.length === 0 || chartData.every((d) => d.value === 0) ? (
                <div className="text-center py-10">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center">
                        <TrendingUp className="w-7 h-7 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">No attention data yet</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start focusing to see your progress</p>
                </div>
            ) : (
                <div className="relative">
                    <div className="absolute left-0 top-0 bottom-8 w-10 flex flex-col justify-between text-xs text-gray-400 dark:text-gray-500 pr-2 text-right">
                        {yLabels.map((label, i) => (
                            <span key={i}>{label}m</span>
                        ))}
                    </div>

                    <div className="ml-12">
                        <svg
                            viewBox={`0 0 100 ${chartHeight}`}
                            preserveAspectRatio="none"
                            className="w-full h-40 overflow-visible">
                            <defs>
                                <pattern id="grid" width="10" height={chartHeight / 4} patternUnits="userSpaceOnUse">
                                    <path d={`M 10 0 L 0 0 0 ${chartHeight / 4}`} fill="none" stroke="currentColor" strokeWidth="0.2" className="text-gray-200 dark:text-gray-800" />
                                </pattern>
                                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
                                    <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.2" />
                                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                                </linearGradient>
                                <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#3b82f6" />
                                    <stop offset="50%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#8b5cf6" />
                                </linearGradient>
                                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="1" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            <rect width="100" height={chartHeight} fill="url(#grid)" opacity="0.5" />

                            {[0.25, 0.5, 0.75].map((ratio) => (
                                <line key={ratio} x1="0" y1={chartHeight * ratio} x2="100" y2={chartHeight * ratio} stroke="currentColor" strokeWidth="0.3" strokeDasharray="2,2" className="text-gray-300 dark:text-gray-700" />
                            ))}

                            <path d={generateSmoothAreaPath()} fill="url(#areaGradient)" className="transition-all duration-300" />

                            <path d={generateSmoothPath()} fill="none" stroke="url(#lineGradient)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" filter="url(#glow)" className="transition-all duration-300" />

                            {chartData.map((d, i) => {
                                const x = (i / (chartData.length - 1)) * 100
                                const y = chartHeight - (d.value / maxValue) * (chartHeight - 10) - 5
                                const isHovered = hoveredPoint === i
                                const isSignificant = significantPoints.some((p) => p.index === i)
                                if (d.value === 0) return null
                                return (
                                    <g key={i}>
                                        {isSignificant && (
                                            <>
                                                <circle cx={x} cy={y} r="4" fill="none" stroke={d.color} strokeWidth="1.5" opacity="0.4" />
                                                <circle cx={x} cy={y} r="6" fill="none" stroke={d.color} strokeWidth="0.5" opacity="0.2" />
                                            </>
                                        )}
                                        <circle
                                            cx={x}
                                            cy={y}
                                            r={isHovered ? "3" : isSignificant ? "2.5" : "1.5"}
                                            fill={d.color}
                                            className="transition-all duration-200 cursor-pointer"
                                            onMouseEnter={() => setHoveredPoint(i)}
                                            onMouseLeave={() => setHoveredPoint(null)}
                                        />
                                    </g>
                                )
                            })}
                        </svg>

                        <div className="relative h-9 mt-2">
                            {significantPoints.map((point) => {
                                const x = (point.index / (chartData.length - 1)) * 100
                                const itemColor = focusColorMap.get(point.focusItem || "") || FOCUS_COLORS[0]
                                return (
                                    <div key={point.index} className="absolute transform -translate-x-1/2 group" style={{ left: `${x}%` }}>
                                        <div className="absolute left-1/2 -translate-x-1/2 w-px h-1.5 -top-1.5" style={{ backgroundColor: itemColor.solid, opacity: 0.5 }} />
                                        <div className={`w-6 h-6 rounded-full bg-gradient-to-br ${itemColor.gradient} shadow-md flex items-center justify-center transition-transform duration-200 hover:scale-110 cursor-pointer border-2 border-white dark:border-gray-900`}>
                                            <span className="text-white text-[10px] font-semibold">{getItemInitial(point.focusItem || "")}</span>
                                        </div>
                                        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2.5 py-1.5 bg-gray-900 dark:bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 whitespace-nowrap pointer-events-none z-20">
                                            <div className="font-medium">{point.focusItem?.slice(0, 30)}{(point.focusItem?.length || 0) > 30 ? "..." : ""}</div>
                                            <div className="text-gray-400 text-[10px]">{point.value}m focused</div>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="flex justify-between mt-1 text-xs text-gray-400 dark:text-gray-500">
                            {xLabels.map((label, i) => (
                                <span key={i} className="font-medium">{label}</span>
                            ))}
                        </div>
                    </div>

                    {hoveredPoint !== null && chartData[hoveredPoint] && (
                        <div
                            className="absolute bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm pointer-events-none z-20 transform -translate-x-1/2"
                            style={{ left: `calc(${(hoveredPoint / (chartData.length - 1)) * 100}% + 48px)`, top: "20px" }}>
                            <div className="font-semibold text-gray-900 dark:text-gray-100">{chartData[hoveredPoint].value}m focused</div>
                            <div className="text-gray-500 dark:text-gray-400 text-xs">Cumulative: {chartData[hoveredPoint].time}</div>
                            {chartData[hoveredPoint].focusItem && (
                                <div className="text-purple-600 dark:text-purple-400 text-xs mt-1 max-w-[150px] truncate">{chartData[hoveredPoint].focusItem}</div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {topFocusItems.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
                    <div className="flex flex-wrap gap-2">
                        {topFocusItems.slice(0, 4).map((item, i) => {
                            const itemColor = focusColorMap.get(item) || FOCUS_COLORS[i % FOCUS_COLORS.length]
                            return (
                                <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 rounded-full bg-gray-100/80 dark:bg-gray-800/80 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-default">
                                    <div className={`w-5 h-5 rounded-full bg-gradient-to-br ${itemColor.gradient} flex items-center justify-center`}>
                                        <span className="text-white text-[10px] font-semibold">{getItemInitial(item)}</span>
                                    </div>
                                    <span className="max-w-[120px] truncate font-medium">{item}</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
