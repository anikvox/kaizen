import type { HttpClient } from "../http.js";
import type { PomodoroStatusResponse } from "../types/index.js";

export class PomodoroEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Get current Pomodoro status.
   */
  async getStatus(): Promise<PomodoroStatusResponse> {
    return this.http.get<PomodoroStatusResponse>("/pomodoro", true);
  }

  /**
   * Pause the Pomodoro timer.
   */
  async pause(): Promise<PomodoroStatusResponse> {
    return this.http.post<PomodoroStatusResponse>("/pomodoro/pause", {}, true);
  }

  /**
   * Resume the Pomodoro timer.
   */
  async resume(): Promise<PomodoroStatusResponse> {
    return this.http.post<PomodoroStatusResponse>("/pomodoro/resume", {}, true);
  }

  /**
   * Reset the Pomodoro timer.
   */
  async reset(): Promise<PomodoroStatusResponse> {
    return this.http.post<PomodoroStatusResponse>("/pomodoro/reset", {}, true);
  }
}
