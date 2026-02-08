import type { HttpClient } from "../http.js";
import type {
  CognitiveHealthTimeRange,
  CognitiveHealthMetricsResponse,
  CognitiveHealthSummaryResponse,
  CognitiveHealthNudgesResponse,
  CognitiveHealthReportResponse,
} from "../types/index.js";

export class CognitiveHealthEndpoint {
  constructor(private http: HttpClient) {}

  /**
   * Get comprehensive health metrics for a time range.
   */
  async getMetrics(
    days: CognitiveHealthTimeRange = 7
  ): Promise<CognitiveHealthMetricsResponse> {
    return this.http.get<CognitiveHealthMetricsResponse>(
      `/cognitive-health/metrics?days=${days}`,
      true
    );
  }

  /**
   * Get a quick summary for card display.
   */
  async getSummary(
    days: CognitiveHealthTimeRange = 7
  ): Promise<CognitiveHealthSummaryResponse> {
    return this.http.get<CognitiveHealthSummaryResponse>(
      `/cognitive-health/summary?days=${days}`,
      true
    );
  }

  /**
   * Get recent nudge history.
   */
  async getNudges(limit: number = 20): Promise<CognitiveHealthNudgesResponse> {
    return this.http.get<CognitiveHealthNudgesResponse>(
      `/cognitive-health/nudges?limit=${limit}`,
      true
    );
  }

  /**
   * Generate a health report using the agent.
   * Progress is streamed via SSE.
   */
  async generateReport(
    days: CognitiveHealthTimeRange = 7
  ): Promise<CognitiveHealthReportResponse> {
    return this.http.post<CognitiveHealthReportResponse>(
      `/cognitive-health/report`,
      { days },
      true
    );
  }
}
