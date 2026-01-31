// Focus state determination logic

import type { FocusWithParsedData, FocusState } from '../types';

/**
 * Calculate total daily focus time (last 24 hours)
 * @param focusHistory - Array of focus sessions
 * @returns Total time in milliseconds
 */
export function calculateDailyFocusTime(focusHistory: FocusWithParsedData[]): number {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    return focusHistory
        .filter((f) => f.last_updated >= oneDayAgo)
        .reduce((sum, f) => sum + (f.duration || 0), 0);
}

/**
 * Determine the current focus state based on activity and time
 * @param currentFocus - Current active focus session or null
 * @param focusHistory - Array of all focus sessions
 * @returns The current focus state
 */
export function determineFocusState(
    currentFocus: FocusWithParsedData | null,
    focusHistory: FocusWithParsedData[]
): FocusState {
    // If no current focus and no history, show no-focus state
    if (!currentFocus && focusHistory.length === 0) {
        return 'no-focus';
    }

    // Otherwise, show active focus state
    return 'active-focus';
}

/**
 * Get the elapsed time for the current focus session
 * @param currentFocus - Current active focus session
 * @returns Elapsed time in milliseconds, or 0 if no active session
 */
export function getCurrentFocusElapsedTime(currentFocus: FocusWithParsedData | null): number {
    if (!currentFocus || currentFocus.time_spent.length === 0) {
        return 0;
    }

    // Get the most recent time entry
    const latestEntry = currentFocus.time_spent[currentFocus.time_spent.length - 1];

    // If there's an active session (stop is null), calculate elapsed time
    if (latestEntry.end === null) {
        return Date.now() - latestEntry.start;
    }

    // Otherwise, return the total time
    return currentFocus.duration || 0;
}
