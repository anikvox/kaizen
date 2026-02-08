import type { HttpClient } from "../http.js";
import type { UnifiedSSEData } from "../types/index.js";

export class SSEEndpoint {
  constructor(private http: HttpClient) {}

  /**
   * Subscribe to unified SSE stream that combines all event types.
   * This uses a single connection instead of multiple SSE connections,
   * avoiding browser connection limits.
   *
   * Event types:
   * - connected: Initial connection with all state (user, settings, focuses, pomodoro)
   * - settings-changed: User settings updated
   * - focus-changed: Focus session created/updated/ended
   * - pomodoro-tick: Timer tick every second (when active)
   * - pomodoro-status-changed: Timer state changed
   * - chat-session-created/updated/deleted: Chat session events
   * - chat-message-created/updated: Message events
   * - tool-call-started: Tool execution started
   * - device-token-revoked: Token was revoked
   * - active-tab-changed: Browser tab changed
   * - ping: Keep-alive
   */
  subscribeUnified(
    onMessage: (data: UnifiedSSEData) => void,
    onError?: (error: Event) => void,
    deviceToken?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/unified`);
    if (deviceToken) {
      url.searchParams.set("token", deviceToken);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("message", (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as UnifiedSSEData;
        onMessage(data);
      } catch (err) {
        console.error("Failed to parse unified SSE message:", err);
      }
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
  }
}
