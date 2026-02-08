import type { HttpClient } from "../http.js";
import type { QuizJobResponse, QuizHistoryResponse, QuizCurrentResponse, QuizAnswerResponse } from "../types/index.js";

export class QuizEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Get the current quiz for the user.
   * Returns null if no quiz exists or it's expired.
   */
  async getCurrent(): Promise<QuizCurrentResponse> {
    return this.http.get<QuizCurrentResponse>("/quiz/current", true);
  }

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
   * Submit an answer for a quiz question.
   */
  async submitAnswer(quizId: string, questionIndex: number, selectedIndex: number): Promise<QuizAnswerResponse> {
    return this.http.post<QuizAnswerResponse>(`/quiz/${quizId}/answer`, { questionIndex, selectedIndex }, true);
  }

  /**
   * Save a quiz result (legacy endpoint).
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
