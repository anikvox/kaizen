import db, { type PastWin } from '~db'
import type { WinItem } from '../types/wins'

/**
 * Fetch recent wins from the database
 */
export async function getWinsData(): Promise<WinItem[]> {
  const wins = await db.table("pastWins").toArray() as PastWin[]
  
  // Sort by time spent and get top 3
  const topWins = wins
    .sort((a, b) => b.time_spent - a.time_spent)
    .slice(0, 3)
  
  return topWins.map((win) => ({
    id: win.id?.toString() || '',
    focusItem: win.focus_item,
    totalTimeSpent: win.time_spent,
    text: `Completed ${win.time_spent_hours} hours of focused work`,
    timestamp: win.recorded_at,
    type: 'milestone' as const,
  }))
}
