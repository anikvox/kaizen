"use client";

import { useState, useEffect } from 'react';
import { Activity, Lightbulb, Clock, TrendingUp, Zap } from 'lucide-react';
import type { Pulse } from '../types';
import { formatRelativeTime } from '../lib/time';

interface CompactPulseCardProps {
    pulses: Pulse[];
    isLoading?: boolean;
}

type PulseCategory = 'insight' | 'reminder' | 'recap' | 'trend';

function categorizePulse(message: string): PulseCategory {
    const lower = message.toLowerCase();
    if (lower.includes('insight') || lower.includes('notice')) return 'insight';
    if (lower.includes('remember') || lower.includes('reminder')) return 'reminder';
    if (lower.includes('trend') || lower.includes('pattern')) return 'trend';
    return 'recap';
}

function getCategoryIcon(category: PulseCategory) {
    const className = "w-4 h-4";
    switch (category) {
        case 'insight': return <Lightbulb className={className} />;
        case 'reminder': return <Clock className={className} />;
        case 'trend': return <TrendingUp className={className} />;
        case 'recap': return <Activity className={className} />;
    }
}

function getCategoryColor(category: PulseCategory) {
    switch (category) {
        case 'insight': return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400';
        case 'reminder': return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
        case 'trend': return 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
        case 'recap': return 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400';
    }
}

export function CompactPulseCard({ pulses, isLoading = false }: CompactPulseCardProps) {
    const recentPulses = pulses.slice(0, 5);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isVisible, setIsVisible] = useState(true);

    useEffect(() => {
        if (recentPulses.length <= 1) return;

        const interval = setInterval(() => {
            setIsVisible(false);
            setTimeout(() => {
                setCurrentIndex((prev) => (prev + 1) % recentPulses.length);
                setIsVisible(true);
            }, 300);
        }, 7000);

        return () => clearInterval(interval);
    }, [recentPulses.length]);

    if (isLoading) {
        return (
            <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800">
                <div className="animate-pulse space-y-4">
                    <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/3"></div>
                    <div className="h-20 bg-gray-200 dark:bg-gray-800 rounded"></div>
                </div>
            </div>
        );
    }

    const currentPulse = recentPulses[currentIndex];
    const category = currentPulse ? categorizePulse(currentPulse.message) : 'recap';
    const colorClass = currentPulse ? getCategoryColor(category) : '';

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl p-6 border border-gray-200 dark:border-gray-800 shadow-sm transition-all duration-300 hover:shadow-md">
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
                        <Zap className="w-5 h-5 text-orange-700 dark:text-orange-300" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Activity Pulse
                    </h3>
                </div>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                    {pulses.length} total
                </span>
            </div>

            {recentPulses.length === 0 ? (
                <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                        <Activity className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        No activity insights yet
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div
                        className={`flex gap-3 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
                    >
                        <div className="flex flex-col items-center">
                            <div className={`w-8 h-8 rounded-lg ${colorClass} flex items-center justify-center shrink-0`}>
                                {getCategoryIcon(category)}
                            </div>
                        </div>

                        <div className="flex-1">
                            <p className="text-sm text-gray-900 dark:text-gray-100 leading-relaxed mb-1">
                                {currentPulse?.message}
                            </p>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                {currentPulse && formatRelativeTime(currentPulse.timestamp)}
                            </span>
                        </div>
                    </div>

                    {recentPulses.length > 1 && (
                        <div className="flex items-center justify-center gap-1.5 pt-2">
                            {recentPulses.map((_, index) => (
                                <div
                                    key={index}
                                    className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${index === currentIndex
                                            ? 'bg-gray-700 dark:bg-gray-300'
                                            : 'bg-gray-300 dark:bg-gray-600'
                                        }`}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
