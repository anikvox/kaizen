import type { HttpClient } from "../http.js";
import type { PomodoroStatusResponse, SSEPomodoroConnectedData, SSEPomodoroStatusChangedData, SSEPomodoroTickData } from "../types/index.js";

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

  /**
   * Subscribe to Pomodoro updates via SSE.
   * Receives tick events every second and status change events.
   */
  subscribePomodoro(
    onConnected: (data: SSEPomodoroConnectedData) => void,
    onTick: (data: SSEPomodoroTickData) => void,
    onStatusChanged?: (data: SSEPomodoroStatusChangedData) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/pomodoro`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onConnected(data);
    });

    eventSource.addEventListener("tick", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onTick(data);
    });

    if (onStatusChanged) {
      eventSource.addEventListener("status-changed", (e) => {
        const data = JSON.parse((e as MessageEvent).data);
        onStatusChanged(data);
      });
    }

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
  }
}
