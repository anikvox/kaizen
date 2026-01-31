// Time formatting utilities

/**
 * Convert milliseconds to hours and minutes format
 * @param milliseconds - Time in milliseconds
 * @returns Formatted string like "2h 30m" or "45m"
 */
export function formatDuration(milliseconds: number): string {
    if (!milliseconds) return '0m';

    const totalMinutes = Math.floor(milliseconds / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    return `${minutes}m`;
}


/**
 * Convert milliseconds to decimal hours
 * @param milliseconds - Time in milliseconds
 * @returns Hours as decimal number
 */
export function millisecondsToHours(milliseconds: number): number {
    return milliseconds / (1000 * 60 * 60);
}

/**
 * Format timestamp as relative time (e.g., "2 hours ago", "just now")
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: number): string {
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (seconds < 60) {
        return 'just now';
    } else if (minutes < 60) {
        return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (hours < 24) {
        return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
    } else if (days < 7) {
        return `${days} ${days === 1 ? 'day' : 'days'} ago`;
    } else if (weeks < 4) {
        return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
    } else if (months < 12) {
        return `${months} ${months === 1 ? 'month' : 'months'} ago`;
    } else {
        return `${years} ${years === 1 ? 'year' : 'years'} ago`;
    }
}

/**
 * Format time for display (HH:MM format)
 * @param date - Date object
 * @returns Time string in HH:MM format
 */
export function formatTime(date: Date): string {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

/**
 * Check if current time is nighttime (after 8 PM)
 * @returns True if it's after 8 PM
 */
export function isNightTime(): boolean {
    const currentHour = new Date().getHours();
    return currentHour >= 20; // 8 PM or later
}

/**
 * Calculate elapsed time from a start timestamp
 * @param startTimestamp - Start time in milliseconds
 * @returns Elapsed time in milliseconds
 */
export function calculateElapsedTime(startTimestamp: number): number {
    return Date.now() - startTimestamp;
}
