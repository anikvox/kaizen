// Statistics calculation utilities

import type { FocusWithParsedData, WinWithParsedData, StatsData } from '../types';

/**
 * Calculate comprehensive statistics from focus history and wins
 * @param focusHistory - Array of focus sessions
 * @param wins - Array of wins
 * @returns Calculated statistics data
 */
export function calculateStats(
    focusHistory: FocusWithParsedData[],
    wins: WinWithParsedData[]
): StatsData {
    // Calculate daily total (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const dailyFocus = focusHistory.filter((f) => f.last_updated >= oneDayAgo);
    const dailyTotal = dailyFocus.reduce((sum, f) => sum + (f.duration || 0), 0);

    // Calculate weekly total (last 7 days)
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyFocus = focusHistory.filter((f) => f.last_updated >= oneWeekAgo);
    const weeklyTotal = weeklyFocus.reduce((sum, f) => sum + (f.duration || 0), 0);

    // Calculate wins
    const dailyWins = wins.filter((w) => w.recorded_at >= oneDayAgo);
    const weeklyWins = wins.filter((w) => w.recorded_at >= oneWeekAgo);

    // Aggregate by focus item
    const activityMap = new Map<string, number>();
    weeklyFocus.forEach((focus) => {
        const itemName = focus.focus_item || focus.item;
        const current = activityMap.get(itemName) || 0;
        activityMap.set(itemName, current + (focus.duration || 0));
    });

    // Find top activities
    const topActivities = Array.from(activityMap.entries())
        .map(([name, time]) => ({ name, time }))
        .sort((a, b) => b.time - a.time)
        .slice(0, 5);

    // Determine prime activity
    const primeActivity = topActivities[0]
        ? {
            name: topActivities[0].name,
            totalTime: topActivities[0].time,
            percentage: weeklyTotal > 0 ? (topActivities[0].time / weeklyTotal) * 100 : 0,
        }
        : null;

    return {
        primeActivity,
        dailyTotal,
        weeklyTotal,
        topActivities,
        dailyWins: dailyWins.length,
        weeklyWins: weeklyWins.length,
    };
}
