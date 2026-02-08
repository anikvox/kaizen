import type { HttpClient } from "../http.js";
import type {
  WebsiteVisit,
  WebsiteVisitOpenedRequest,
  WebsiteVisitActiveTimeRequest,
  WebsiteVisitClosedRequest,
} from "../types/index.js";

export class WebsiteVisitsEndpoint {
  constructor(private http: HttpClient) {}

  async opened(data: WebsiteVisitOpenedRequest): Promise<WebsiteVisit> {
    return this.http.post<WebsiteVisit>("/website-visits/opened", data, true);
  }

  async updateActiveTime(
    data: WebsiteVisitActiveTimeRequest,
  ): Promise<WebsiteVisit> {
    return this.http.post<WebsiteVisit>(
      "/website-visits/active-time",
      data,
      true,
    );
  }

  async closed(data: WebsiteVisitClosedRequest): Promise<WebsiteVisit> {
    return this.http.post<WebsiteVisit>("/website-visits/closed", data, true);
  }

  async list(): Promise<WebsiteVisit[]> {
    return this.http.get<WebsiteVisit[]>("/website-visits", true);
  }

  async get(id: string): Promise<WebsiteVisit> {
    return this.http.get<WebsiteVisit>(`/website-visits/${id}`, true);
  }
}
