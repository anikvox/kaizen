import db, { type PomodoroState } from "~db"

const POMODORO_ID = "current"
const FOCUS_DURATION = 1500 // 25 minutes in seconds
const BREAK_DURATION = 300 // 5 minutes in seconds

/**
 * Get or create default pomodoro state
 */
async function getOrCreateState(): Promise<PomodoroState> {
  const state = await db.table("pomodoro").get(POMODORO_ID) as PomodoroState | undefined

  if (!state) {
    const defaultState: PomodoroState = {
      id: POMODORO_ID,
      isActive: false,
      remainingTime: FOCUS_DURATION,
      state: "idle",
      startTime: null,
      totalPomodoros: 0,
      lastUpdated: Date.now()
    }
    await db.table("pomodoro").put(defaultState)
    return defaultState
  }

  return state
}

/**
 * Update pomodoro state in database
 */
async function updateState(updates: Partial<PomodoroState>): Promise<PomodoroState> {
  const currentState = await getOrCreateState()
  const newState: PomodoroState = {
    ...currentState,
    ...updates,
    lastUpdated: Date.now()
  }
  await db.table("pomodoro").put(newState)
  return newState
}

/**
 * Fetch current Pomodoro state
 */
export async function getPomodoroState(): Promise<PomodoroState> {
  try {
    const state = await getOrCreateState()

    // If timer is active, calculate remaining time based on elapsed time
    if (state.isActive && state.startTime) {
      const elapsed = Math.floor((Date.now() - state.startTime) / 1000)
      // Calculate remaining time from when the timer was started/resumed
      // If this is a fresh start, remainingTime will be the full duration
      // If this is a resume, remainingTime will be what was left when paused
      const remaining = Math.max(0, state.remainingTime - elapsed)

      // If time is up, auto-transition
      if (remaining === 0) {
        if (state.state === "focus") {
          // Focus complete, switch to break
          return await updateState({
            isActive: false,
            state: "break",
            remainingTime: BREAK_DURATION,
            startTime: null,
            totalPomodoros: state.totalPomodoros + 1
          })
        } else {
          // Break complete, switch to focus
          return await updateState({
            isActive: false,
            state: "focus",
            remainingTime: FOCUS_DURATION,
            startTime: null
          })
        }
      }

      // Return state with calculated remaining time (don't update DB every second)
      return {
        ...state,
        remainingTime: remaining
      }
    }

    return state
  } catch (error) {
    console.error("Error getting pomodoro state:", error)
    throw error
  }
}

/**
 * Start Pomodoro timer
 */
export async function startPomodoro(): Promise<PomodoroState> {
  try {
    const currentState = await getOrCreateState()

    // If idle, start focus mode
    if (currentState.state === "idle") {
      return await updateState({
        isActive: true,
        state: "focus",
        remainingTime: FOCUS_DURATION,
        startTime: Date.now()
      })
    }

    // Resume current state - preserve the remaining time
    return await updateState({
      isActive: true,
      startTime: Date.now(),
      remainingTime: currentState.remainingTime // Keep the current remaining time
    })
  } catch (error) {
    console.error("Error starting pomodoro:", error)
    throw error
  }
}

/**
 * Stop Pomodoro timer
 */
export async function stopPomodoro(): Promise<PomodoroState> {
  try {
    const currentState = await getPomodoroState()

    // Save the current remaining time when pausing
    return await updateState({
      isActive: false,
      startTime: null,
      remainingTime: currentState.remainingTime
    })
  } catch (error) {
    console.error("Error stopping pomodoro:", error)
    throw error
  }
}

/**
 * Reset Pomodoro timer
 */
export async function resetPomodoro(): Promise<PomodoroState> {
  try {
    return await updateState({
      isActive: false,
      state: "idle",
      remainingTime: FOCUS_DURATION,
      startTime: null
    })
  } catch (error) {
    console.error("Error resetting pomodoro:", error)
    throw error
  }
}

/**
 * Toggle Pomodoro timer (start/stop)
 */
export async function togglePomodoro(): Promise<PomodoroState> {
  try {
    const currentState = await getPomodoroState()

    if (currentState.isActive) {
      return await stopPomodoro()
    } else {
      return await startPomodoro()
    }
  } catch (error) {
    console.error("Error toggling pomodoro:", error)
    throw error
  }
}
