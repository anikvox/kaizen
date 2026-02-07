import type { HttpClient } from "../http.js";
import type { QuizJobResponse, QuizHistoryResponse } from "../types/index.js";

export class QuizEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Start quiz generation - returns job ID immediately.
   * Use getJobStatus to poll for completion.
   */
  async generate(): Promise<{ jobId: string; status: string }> {
    return this.http.post<{ jobId: string; status: string }>("/quiz/generate", {}, true);
  }

  /**
   * Get the status of a quiz generation job.
   * Returns the quiz when completed.
   */
  async getJobStatus(jobId: string): Promise<QuizJobResponse> {
    return this.http.get<QuizJobResponse>(`/quiz/job/${jobId}`, true);
  }

  /**
   * Save a quiz result.
   */
  async saveResult(totalQuestions: number, correctAnswers: number): Promise<{ id: string; saved: boolean }> {
    return this.http.post<{ id: string; saved: boolean }>("/quiz/result", { totalQuestions, correctAnswers }, true);
  }

  /**
   * Get quiz history and stats.
   */
  async getHistory(): Promise<QuizHistoryResponse> {
    return this.http.get<QuizHistoryResponse>("/quiz/history", true);
  }
}
