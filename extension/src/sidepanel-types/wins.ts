/**
 * Wins and achievements type definitions
 */

/**
 * Win item types
 */
export type WinType = 'milestone' | 'streak' | 'achievement';

/**
 * Represents a win/achievement item
 * Based on the Wins table from readme.md (Top 3 all time)
 */
export interface WinItem {
  id: string;
  focusItem: string;
  totalTimeSpent: number; // milliseconds
  text: string;
  timestamp: number;
  type: WinType;
}
