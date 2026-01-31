"use client";

import { useState } from "react";
import { Map, List, Grid, Info, Clock } from "lucide-react";

export function JourneyGraph() {
    const [viewMode, setViewMode] = useState<"date" | "group">("date");
    const [timeRange, setTimeRange] = useState("30m");

    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Journey Graph
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        Visualize your browsing patterns and navigation flow
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <div className="inline-flex bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
                        <button
                            onClick={() => setViewMode("date")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex items-center gap-2 ${viewMode === "date"
                                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                }`}
                        >
                            <List className="w-4 h-4" />
                            By date
                        </button>
                        <button
                            onClick={() => setViewMode("group")}
                            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200 flex items-center gap-2 ${viewMode === "group"
                                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                }`}
                        >
                            <Grid className="w-4 h-4" />
                            By group
                        </button>
                    </div>

                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value)}
                        className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="15m">Last 15 Minutes</option>
                        <option value="30m">Last 30 Minutes</option>
                        <option value="1h">Last Hour</option>
                        <option value="24h">Last 24 Hours</option>
                    </select>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center h-96 bg-gray-50 dark:bg-gray-800/50 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                    <Map className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500 dark:text-gray-400 font-medium">No browsing data available</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start browsing to see your journey visualization</p>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-800 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-600 dark:text-blue-400">
                        <Info className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Smart Grouping</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Automatically groups related tabs into semantic clusters.</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg text-purple-600 dark:text-purple-400">
                        <Map className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Navigation Context</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Shows how you moved between different pieces of content.</p>
                    </div>
                </div>
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg text-green-600 dark:text-green-400">
                        <Clock className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Time Tracking</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Visualize how much time you spent on each node of your journey.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
