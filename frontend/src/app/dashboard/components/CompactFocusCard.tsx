"use client";

/**
 * CompactFocusCard - Professional focus display
 */

import { Brain, Clock, Target, TrendingUp } from "lucide-react"
import { useEffect, useMemo, useState } from "react"

import type { BackendFocus } from "../types"

interface CompactFocusCardProps {
    currentFocus: BackendFocus | null
    focusHistory: BackendFocus[]
    isLoading?: boolean
}

// Helper to format duration from window
function formatWindowDuration(windowStart: string, windowEnd: string): string {
    const start = new Date(windowStart).getTime();
    const end = new Date(windowEnd).getTime();
    const duration = end - start;

    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
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
    const categoryInfo = currentFocus ? getCategoryInfo(currentFocus.category) : null;
    const duration = currentFocus ? formatWindowDuration(currentFocus.windowStart, currentFocus.windowEnd) : null;

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

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 hover:shadow-md">
            {!currentFocus ? (
                <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Target className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                        No Focus Data
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Focus tracking will appear here once you start using the app
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                    Latest Focus
                                </span>
                                {categoryInfo && (
                                    <span className={`flex items-center gap-1.5 px-2 py-0.5 ${categoryInfo.bgColor} ${categoryInfo.color} rounded-full text-xs font-medium`}>
                                        {categoryInfo.label}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-2">
                                {currentFocus.summary}
                            </p>
                        </div>
                    </div>

                    {/* Score and Duration */}
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Focus Score */}
                            <div className="flex items-center gap-3">
                                <Brain className="w-5 h-5 text-purple-500" />
                                <div>
                                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                        {Math.round(currentFocus.score)}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        Focus Score
                                    </div>
                                </div>
                            </div>

                            {/* Duration */}
                            <div className="flex items-center gap-3">
                                <Clock className="w-5 h-5 text-gray-400" />
                                <div>
                                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100 tabular-nums">
                                        {duration}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                        Window
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Activity Breakdown */}
                    {(currentFocus.textCount > 0 || currentFocus.imageCount > 0 || currentFocus.youtubeCount > 0 || currentFocus.audioCount > 0) && (
                        <div className="flex flex-wrap gap-2">
                            {currentFocus.textCount > 0 && (
                                <span className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-md text-xs font-medium">
                                    {currentFocus.textCount} text
                                </span>
                            )}
                            {currentFocus.imageCount > 0 && (
                                <span className="px-2.5 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-md text-xs font-medium">
                                    {currentFocus.imageCount} images
                                </span>
                            )}
                            {currentFocus.youtubeCount > 0 && (
                                <span className="px-2.5 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md text-xs font-medium">
                                    {currentFocus.youtubeCount} videos
                                </span>
                            )}
                            {currentFocus.audioCount > 0 && (
                                <span className="px-2.5 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-xs font-medium">
                                    {currentFocus.audioCount} audio
                                </span>
                            )}
                        </div>
                    )}

                    {/* Insights */}
                    {currentFocus.insights && (
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <div className="flex items-start gap-2">
                                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                                <p className="text-xs text-blue-900 dark:text-blue-100 leading-relaxed">
                                    {currentFocus.insights}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
