import type { HttpClient } from "../http.js";
import type {
  WebsiteActivityResponse,
  AttentionResponse,
} from "../types/index.js";

export interface ExportTimeRangeParams {
  from?: Date | string;
  to?: Date | string;
}

export class ExportEndpoint {
  constructor(private http: HttpClient) {}

  /**
   * Fetch website activity for a time range in a clean, aggregated format.
   * Data is grouped by domain with page-level details.
   *
   * @param params.from - Start of time range (default: 24 hours ago)
   * @param params.to - End of time range (default: now)
   */
  async getWebsiteActivity(
    params: ExportTimeRangeParams = {}
  ): Promise<WebsiteActivityResponse> {
    const queryParams = new URLSearchParams();
    if (params.from) {
      queryParams.set(
        "from",
        params.from instanceof Date ? params.from.toISOString() : params.from
      );
    }
    if (params.to) {
      queryParams.set(
        "to",
        params.to instanceof Date ? params.to.toISOString() : params.to
      );
    }

    const query = queryParams.toString();
    const url = `/export/website-activity${query ? `?${query}` : ""}`;
    return this.http.get<WebsiteActivityResponse>(url, true);
  }

  /**
   * Fetch all attention data for a time range in a clean, structured format.
   * Combines website visits with text, image, audio, and YouTube attention data.
   *
   * @param params.from - Start of time range (default: 24 hours ago)
   * @param params.to - End of time range (default: now)
   */
  async getAttention(
    params: ExportTimeRangeParams = {}
  ): Promise<AttentionResponse> {
    const queryParams = new URLSearchParams();
    if (params.from) {
      queryParams.set(
        "from",
        params.from instanceof Date ? params.from.toISOString() : params.from
      );
    }
    if (params.to) {
      queryParams.set(
        "to",
        params.to instanceof Date ? params.to.toISOString() : params.to
      );
    }

    const query = queryParams.toString();
    const url = `/export/attention${query ? `?${query}` : ""}`;
    return this.http.get<AttentionResponse>(url, true);
  }
}
