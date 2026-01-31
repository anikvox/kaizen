import db, { type Focus } from "~db"

export type FocusWithParsedData = Focus & {
  focus_item: string
  total_time: number
}

/**
 * Calculate total time spent from time_spent array
 */
function calculateTotalTime(timeSpent: { start: number; end: number | null }[]): number {
  return timeSpent.reduce((total, period) => {
    const end = period.end || Date.now()
    return total + (end - period.start)
  }, 0)
}

/**
 * Parse Focus to FocusWithParsedData
 */
export function parseFocus(focus: Focus): FocusWithParsedData {
  return {
    ...focus,
    focus_item: focus.item,
    total_time: calculateTotalTime(focus.time_spent)
  }
}

/**
 * Fetch current focus data from the database
 */
export async function getCurrentFocusData(): Promise<FocusWithParsedData | null> {
  const allFocus = await db.table("focus").toArray() as Focus[]
  
  if (allFocus.length === 0) {
    return null
  }

  // Get the most recent focus item
  const currentFocus = allFocus.sort((a, b) => b.last_updated - a.last_updated)[0]
  
  // Check if it has an active session (last time_spent has no end)
  const lastSession = currentFocus.time_spent[currentFocus.time_spent.length - 1]
  if (lastSession && lastSession.end === null) {
    return parseFocus(currentFocus)
  }

  return null
}

/**
 * Fetch last 5 focus items from the database
 */
export async function getFocusHistory(): Promise<FocusWithParsedData[]> {
  const allFocus = await db.table("focus").toArray() as Focus[]

  // Return last 5 items, sorted by last_updated descending
  return allFocus
    .sort((a, b) => b.last_updated - a.last_updated)
    .slice(0, 5)
    .map(parseFocus)
}
