/**
 * Pomodoro timer type definitions
 */

/**
 * Pomodoro timer state
 */
export type PomodoroStateType = 'idle' | 'focus' | 'break';

/**
 * Represents the current state of the Pomodoro timer
 */
export interface PomodoroState {
  id: string;
  isActive: boolean;
  remainingTime: number; // seconds
  state: PomodoroStateType;
  startTime: number | null; // timestamp when timer started
  totalPomodoros: number;
  lastUpdated: number;
}
