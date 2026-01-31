"use client";

/**
 * CompactFocusCard - Professional focus display
 */

import { Clock, Target } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import {
    determineFocusState,
    formatDuration,
    getCurrentFocusElapsedTime
} from "../lib"
import type { FocusWithParsedData } from "../types"

interface CompactFocusCardProps {
    currentFocus: FocusWithParsedData | null
    focusHistory: FocusWithParsedData[]
    isLoading?: boolean
}

export function CompactFocusCard({
    currentFocus,
    focusHistory,
    isLoading = false
}: CompactFocusCardProps) {
    const [elapsedTime, setElapsedTime] = useState(0)
    const focusState = determineFocusState(currentFocus, focusHistory)
    const formattedTime = useMemo(() => {
        return formatDuration(elapsedTime)
    }, [elapsedTime])

    useEffect(() => {
        setElapsedTime(getCurrentFocusElapsedTime(currentFocus))

        if (
            currentFocus &&
            currentFocus.time_spent[currentFocus.time_spent.length - 1].end === null
        ) {
            const interval = setInterval(() => {
                setElapsedTime(getCurrentFocusElapsedTime(currentFocus))
            }, 1000 * 60)
            return () => clearInterval(interval)
        }
    }, [currentFocus])

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                    <div className="h-12 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
            </div>
        )
    }

    const isActive = currentFocus?.time_spent.some((entry) => entry.end === null)

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 hover:shadow-md">
            {focusState === "no-focus" ? (
                <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Target className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        No Active Focus
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Start a focus session to track your progress
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                    {isActive ? "Current Focus" : "Last Session"}
                                </span>
                                {isActive && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                        <span className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span>
                                        Live
                                    </span>
                                )}
                            </div>
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 truncate">
                                {currentFocus?.focus_item || focusHistory[0]?.focus_item}
                            </h3>
                        </div>
                    </div>

                    {/* Timer */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-gray-400" />
                                <div>
                                    <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                        {formattedTime}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        {isActive ? "Elapsed time" : "Total time"}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Keywords */}
                    {currentFocus?.keywords && currentFocus.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {currentFocus.keywords.slice(0, 5).map((keyword, index) => (
                                <span
                                    key={index}
                                    className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium">
                                    {keyword}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
