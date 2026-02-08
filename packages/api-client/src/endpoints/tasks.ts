import type { HttpClient } from "../http.js";
import type {
  UserTaskQueueStatus,
  TaskQueueItem,
  TaskCreatedResponse,
  SSETaskQueueChangedData,
} from "../types/index.js";

export class TasksEndpoint {
  constructor(private http: HttpClient) {}

  /**
   * Get the current user's task queue status.
   * Includes pending tasks, processing tasks, and recent history.
   */
  async getStatus(): Promise<UserTaskQueueStatus> {
    return this.http.get<UserTaskQueueStatus>("/tasks", true);
  }

  /**
   * Get details of a specific task.
   */
  async getTask(taskId: string): Promise<TaskQueueItem> {
    return this.http.get<TaskQueueItem>(`/tasks/${taskId}`, true);
  }

  /**
   * Cancel a pending task.
   */
  async cancelTask(taskId: string): Promise<{ success: boolean; taskId: string }> {
    return this.http.delete<{ success: boolean; taskId: string }>(`/tasks/${taskId}`, true);
  }

  /**
   * Trigger a focus calculation task.
   */
  async triggerFocusCalculation(force?: boolean): Promise<TaskCreatedResponse> {
    return this.http.post<TaskCreatedResponse>("/tasks/focus", { force }, true);
  }

  /**
   * Trigger a quiz generation task.
   */
  async triggerQuizGeneration(options?: {
    answerOptionsCount?: number;
    activityDays?: number;
  }): Promise<TaskCreatedResponse> {
    return this.http.post<TaskCreatedResponse>("/tasks/quiz", options || {}, true);
  }

  /**
   * Trigger a summarization task.
   */
  async triggerSummarization(visitIds?: string[]): Promise<TaskCreatedResponse> {
    return this.http.post<TaskCreatedResponse>("/tasks/summarize", { visitIds }, true);
  }

  /**
   * Subscribe to task queue changes via SSE.
   */
  subscribeTasks(
    onConnected: (data: { pending: TaskQueueItem[]; processing: TaskQueueItem[]; stats: any }) => void,
    onTaskChanged: (data: SSETaskQueueChangedData) => void,
    onError: (error: Event) => void,
    token: string
  ): EventSource {
    const url = `${this.http.getBaseUrl()}/sse/tasks`;
    const eventSource = new EventSource(`${url}?token=${encodeURIComponent(token)}`);

    eventSource.addEventListener("connected", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        onConnected(data);
      } catch (e) {
        console.error("Failed to parse connected data:", e);
      }
    });

    eventSource.addEventListener("taskChanged", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data);
        onTaskChanged(data);
      } catch (e) {
        console.error("Failed to parse task changed data:", e);
      }
    });

    eventSource.onerror = onError;

    return eventSource;
  }
}
