import type { HttpClient } from "../http.js";
import type { AgentNudgeResponse } from "../types/index.js";

export class AgentEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Respond to an agent nudge.
   */
  async respondToNudge(
    nudgeId: string,
    response: "acknowledged" | "false_positive" | "dismissed"
  ): Promise<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `/agent/nudges/${nudgeId}/respond`,
      { response },
      true
    );
  }
}
