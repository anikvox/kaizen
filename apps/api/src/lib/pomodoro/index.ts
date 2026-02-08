import { db } from "../index.js";
import { events } from "../events.js";

export type PomodoroState = "idle" | "running" | "paused" | "cooldown";

export interface PomodoroStatus {
  state: PomodoroState;
  elapsedSeconds: number;
  isPaused: boolean;
  lastActivityAt: string;
}

/**
 * Emit pomodoro status changed event.
 */
function emitStatusChanged(userId: string, status: PomodoroStatus) {
  events.emitPomodoroStatusChanged({ userId, status });
}

/**
 * Get current Pomodoro status for a user.
 * Calculates elapsed time based on state and timestamps.
 */
export async function getPomodoroStatus(
  userId: string,
): Promise<PomodoroStatus> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    include: { pomodoro: true },
  });

  if (!settings?.pomodoro) {
    return {
      state: "idle",
      elapsedSeconds: 0,
      isPaused: false,
      lastActivityAt: new Date().toISOString(),
    };
  }

  const session = settings.pomodoro;
  const now = new Date();

  // Check if cooldown has expired
  if (session.state === "cooldown" && session.cooldownStartedAt) {
    const cooldownMs = settings.pomodoroCooldownMs;
    const cooldownElapsed = now.getTime() - session.cooldownStartedAt.getTime();

    if (cooldownElapsed >= cooldownMs) {
      // Cooldown expired - reset timer
      await resetPomodoro(userId);
      return {
        state: "idle",
        elapsedSeconds: 0,
        isPaused: false,
        lastActivityAt: now.toISOString(),
      };
    }
  }

  // Calculate elapsed seconds
  let elapsedSeconds = session.accumulatedSeconds;

  // Timer keeps running during both "running" and "cooldown" states
  if (
    (session.state === "running" || session.state === "cooldown") &&
    session.startedAt
  ) {
    const runningMs = now.getTime() - session.startedAt.getTime();
    elapsedSeconds += Math.floor(runningMs / 1000);
  }

  return {
    state: session.state as PomodoroState,
    elapsedSeconds,
    isPaused: session.state === "paused",
    lastActivityAt: session.lastActivityAt.toISOString(),
  };
}

/**
 * Start or resume the Pomodoro timer.
 * Called when focus activity is detected.
 */
export async function startPomodoro(userId: string): Promise<PomodoroStatus> {
  const settings = await db.userSettings.findUnique({
    where: { userId },
    include: { pomodoro: true },
  });

  if (!settings) {
    throw new Error("User settings not found");
  }

  const now = new Date();

  if (!settings.pomodoro) {
    // Create new session
    await db.pomodoroSession.create({
      data: {
        userId,
        state: "running",
        accumulatedSeconds: 0,
        startedAt: now,
        lastActivityAt: now,
      },
    });
  } else {
    const session = settings.pomodoro;

    if (session.state === "idle") {
      // Start fresh
      await db.pomodoroSession.update({
        where: { userId },
        data: {
          state: "running",
          startedAt: now,
          cooldownStartedAt: null,
          lastActivityAt: now,
        },
      });
    } else if (session.state === "cooldown") {
      // Resume from cooldown - timer was already running, just clear cooldown
      await db.pomodoroSession.update({
        where: { userId },
        data: {
          state: "running",
          cooldownStartedAt: null,
          lastActivityAt: now,
        },
      });
    } else if (session.state === "paused") {
      // Resume from pause - keep accumulated time
      await db.pomodoroSession.update({
        where: { userId },
        data: {
          state: "running",
          startedAt: now,
          pausedAt: null,
          lastActivityAt: now,
        },
      });
    } else if (session.state === "running") {
      // Already running - just update activity timestamp
      await db.pomodoroSession.update({
        where: { userId },
        data: {
          lastActivityAt: now,
        },
      });
    }
  }

  const status = await getPomodoroStatus(userId);
  emitStatusChanged(userId, status);
  return status;
}

/**
 * Pause the Pomodoro timer manually.
 */
export async function pausePomodoro(userId: string): Promise<PomodoroStatus> {
  const session = await db.pomodoroSession.findUnique({
    where: { userId },
  });

  if (!session || session.state !== "running") {
    return getPomodoroStatus(userId);
  }

  const now = new Date();

  // Calculate accumulated time
  let accumulatedSeconds = session.accumulatedSeconds;
  if (session.startedAt) {
    const runningMs = now.getTime() - session.startedAt.getTime();
    accumulatedSeconds += Math.floor(runningMs / 1000);
  }

  await db.pomodoroSession.update({
    where: { userId },
    data: {
      state: "paused",
      accumulatedSeconds,
      startedAt: null,
      pausedAt: now,
      lastActivityAt: now,
    },
  });

  const status = await getPomodoroStatus(userId);
  emitStatusChanged(userId, status);
  return status;
}

/**
 * Resume the Pomodoro timer from pause.
 */
export async function resumePomodoro(userId: string): Promise<PomodoroStatus> {
  const session = await db.pomodoroSession.findUnique({
    where: { userId },
  });

  if (!session || session.state !== "paused") {
    return getPomodoroStatus(userId);
  }

  const now = new Date();

  await db.pomodoroSession.update({
    where: { userId },
    data: {
      state: "running",
      startedAt: now,
      pausedAt: null,
      lastActivityAt: now,
    },
  });

  const status = await getPomodoroStatus(userId);
  emitStatusChanged(userId, status);
  return status;
}

/**
 * Enter cooldown state when no focus is active.
 * Timer keeps running during cooldown - only resets when cooldown expires.
 */
export async function enterCooldown(userId: string): Promise<PomodoroStatus> {
  const session = await db.pomodoroSession.findUnique({
    where: { userId },
  });

  if (!session || session.state !== "running") {
    return getPomodoroStatus(userId);
  }

  const now = new Date();

  // Keep startedAt so timer continues running during cooldown
  await db.pomodoroSession.update({
    where: { userId },
    data: {
      state: "cooldown",
      cooldownStartedAt: now,
      lastActivityAt: now,
    },
  });

  const status = await getPomodoroStatus(userId);
  emitStatusChanged(userId, status);
  return status;
}

/**
 * Reset the Pomodoro timer completely.
 */
export async function resetPomodoro(userId: string): Promise<PomodoroStatus> {
  await db.pomodoroSession.upsert({
    where: { userId },
    create: {
      userId,
      state: "idle",
      accumulatedSeconds: 0,
      lastActivityAt: new Date(),
    },
    update: {
      state: "idle",
      accumulatedSeconds: 0,
      startedAt: null,
      pausedAt: null,
      cooldownStartedAt: null,
      lastActivityAt: new Date(),
    },
  });

  const status = await getPomodoroStatus(userId);
  emitStatusChanged(userId, status);
  return status;
}

/**
 * Update activity timestamp - called when focus is active.
 * If in cooldown, resume the timer.
 */
export async function updateActivity(userId: string): Promise<PomodoroStatus> {
  const session = await db.pomodoroSession.findUnique({
    where: { userId },
  });

  if (!session) {
    return startPomodoro(userId);
  }

  const now = new Date();

  if (session.state === "cooldown") {
    // Focus resumed - exit cooldown and continue running (timer was already running)
    await db.pomodoroSession.update({
      where: { userId },
      data: {
        state: "running",
        cooldownStartedAt: null,
        lastActivityAt: now,
      },
    });
  } else if (session.state === "running") {
    await db.pomodoroSession.update({
      where: { userId },
      data: {
        lastActivityAt: now,
      },
    });
  } else if (session.state === "idle") {
    return startPomodoro(userId);
  }
  // If paused, don't auto-resume - user must manually resume

  return getPomodoroStatus(userId);
}

/**
 * Check if user has any active focus sessions.
 */
export async function hasActiveFocus(userId: string): Promise<boolean> {
  const activeFocus = await db.focus.findFirst({
    where: {
      userId,
      isActive: true,
    },
  });

  return activeFocus !== null;
}

/**
 * Handle focus change event.
 * Start timer when focus starts, enter cooldown when no focus.
 */
export async function handleFocusChange(
  userId: string,
  changeType: "created" | "updated" | "ended",
): Promise<PomodoroStatus> {
  const hasActive = await hasActiveFocus(userId);

  if (hasActive) {
    // There's active focus - ensure timer is running (unless paused)
    const session = await db.pomodoroSession.findUnique({
      where: { userId },
    });

    if (!session || session.state === "idle" || session.state === "cooldown") {
      return startPomodoro(userId);
    } else if (session.state === "running") {
      return updateActivity(userId);
    }
    // If paused, don't auto-resume
    return getPomodoroStatus(userId);
  } else {
    // No active focus - enter cooldown if running
    const session = await db.pomodoroSession.findUnique({
      where: { userId },
    });

    if (session?.state === "running") {
      return enterCooldown(userId);
    }

    return getPomodoroStatus(userId);
  }
}

/**
 * Initialize Pomodoro event listeners.
 * Call this once at server startup.
 */
export function initPomodoroListeners() {
  events.onFocusChanged(async (data) => {
    try {
      await handleFocusChange(data.userId, data.changeType);
    } catch (error) {
      console.error("[Pomodoro] Error handling focus change:", error);
    }
  });

  console.log("[Pomodoro] Event listeners initialized");
}
