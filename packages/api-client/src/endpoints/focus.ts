import type { HttpClient } from "../http.js";
import type {
  Focus,
  FocusListResponse,
  FocusResponse,
} from "../types/index.js";

export class FocusEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Get user's focus history
   */
  async list(options?: {
    limit?: number;
    includeActive?: boolean;
  }): Promise<Focus[]> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set("limit", options.limit.toString());
    }
    if (options?.includeActive !== undefined) {
      params.set("includeActive", options.includeActive.toString());
    }

    const query = params.toString();
    const url = query ? `/focus?${query}` : "/focus";

    const response = await this.http.get<FocusListResponse>(url, true);
    return response.focuses;
  }

  /**
   * Get all current active focuses
   */
  async getActive(): Promise<Focus[]> {
    const response = await this.http.get<FocusListResponse>("/focus/active", true);
    return response.focuses;
  }

  /**
   * Get a specific focus by ID
   */
  async get(id: string): Promise<Focus | null> {
    const response = await this.http.get<FocusResponse>(`/focus/${id}`, true);
    return response.focus;
  }

  /**
   * Manually end the current active focus
   */
  async endActive(): Promise<Focus | null> {
    const response = await this.http.post<FocusResponse>("/focus/end", {}, true);
    return response.focus;
  }
}
