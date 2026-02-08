import type { HttpClient } from "../http.js";
import type {
  JourneyResponse,
  JourneyDomainDetailResponse,
} from "../types/index.js";

export class JourneyEndpoint {
  constructor(private http: HttpClient) {}

  async get(days: number = 7): Promise<JourneyResponse> {
    return this.http.get<JourneyResponse>(`/journey?days=${days}`, true);
  }

  async getDomain(domain: string, days: number = 30): Promise<JourneyDomainDetailResponse> {
    return this.http.get<JourneyDomainDetailResponse>(
      `/journey/${encodeURIComponent(domain)}?days=${days}`,
      true
    );
  }
}
