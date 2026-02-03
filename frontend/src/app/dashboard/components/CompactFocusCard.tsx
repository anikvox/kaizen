"use client";

/**
 * CompactFocusCard - Professional focus display
 */

import { Clock, Target } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { BackendFocus } from "../types"

interface CompactFocusCardProps {
    currentFocus: BackendFocus | null
    focusHistory: BackendFocus[]
    isLoading?: boolean
}

// Helper to calculate elapsed time from window
function getElapsedTime(windowStart: string, windowEnd: string): number {
    const start = new Date(windowStart).getTime();
    const end = new Date(windowEnd).getTime();
    return Math.floor((end - start) / 1000); // Return seconds
}

// Helper to format duration
function formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
        return `${hours}h`;
    }
    return `${minutes}m`;
}

// Helper to get category display info
function getCategoryInfo(category: string): { label: string; color: string; bgColor: string } {
    switch (category) {
        case 'deep_work':
            return { label: 'Deep Work', color: 'text-green-700 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-900/30' };
        case 'shallow_work':
            return { label: 'Shallow Work', color: 'text-blue-700 dark:text-blue-400', bgColor: 'bg-blue-100 dark:bg-blue-900/30' };
        case 'distraction':
            return { label: 'Distracted', color: 'text-orange-700 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-900/30' };
        case 'rest':
            return { label: 'Rest', color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' };
        default:
            return { label: category, color: 'text-gray-700 dark:text-gray-400', bgColor: 'bg-gray-100 dark:bg-gray-800' };
    }
}

export function CompactFocusCard({
    currentFocus,
    focusHistory,
    isLoading = false
}: CompactFocusCardProps) {
    const [elapsedTime, setElapsedTime] = useState(0)
    
    const formattedTime = useMemo(() => {
        return formatDuration(elapsedTime)
    }, [elapsedTime])

    useEffect(() => {
        if (currentFocus) {
            const elapsed = getElapsedTime(currentFocus.windowStart, currentFocus.windowEnd)
            setElapsedTime(elapsed)
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

    const isActive = currentFocus !== null
    const categoryInfo = currentFocus ? getCategoryInfo(currentFocus.category) : null

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm">
            {!currentFocus ? (
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
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                    Current Focus
                                </span>
                                {isActive && (
                                    <span className="flex items-center gap-1.5 px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                                        <span className="w-1.5 h-1.5 bg-green-600 dark:bg-green-400 rounded-full animate-pulse"></span>
                                        Live
                                    </span>
                                )}
                            </div>
                            <h3 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                                {currentFocus.summary}
                            </h3>
                        </div>
                    </div>

                    {/* Timer */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <Clock className="w-5 h-5 text-gray-400" />
                            <div>
                                <div className="text-3xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                    {formattedTime}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    Elapsed time
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Keywords/Tags */}
                    <div className="flex flex-wrap gap-2">
                        {currentFocus.textCount > 0 && (
                            <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium">
                                text
                            </span>
                        )}
                        {currentFocus.imageCount > 0 && (
                            <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium">
                                design
                            </span>
                        )}
                        {currentFocus.youtubeCount > 0 && (
                            <span className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium">
                                crypto
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
