import type { HttpClient } from "../http.js";
import type { Focus, FocusListResponse, FocusResponse, SSEFocusConnectedData, SSEFocusChangedData } from "../types/index.js";

export class FocusEndpoints {
  constructor(private http: HttpClient) {}

  /**
   * Get user's focus history
   */
  async list(options?: { limit?: number; includeActive?: boolean }): Promise<Focus[]> {
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set("limit", options.limit.toString());
    }
    if (options?.includeActive !== undefined) {
      params.set("includeActive", options.includeActive.toString());
    }

    const query = params.toString();
    const url = query ? `/focus?${query}` : "/focus";

    const response = await this.http.get<FocusListResponse>(url);
    return response.focuses;
  }

  /**
   * Get all current active focuses
   */
  async getActive(): Promise<Focus[]> {
    const response = await this.http.get<FocusListResponse>("/focus/active");
    return response.focuses;
  }

  /**
   * Get a specific focus by ID
   */
  async get(id: string): Promise<Focus | null> {
    const response = await this.http.get<FocusResponse>(`/focus/${id}`);
    return response.focus;
  }

  /**
   * Manually end the current active focus
   */
  async endActive(): Promise<Focus | null> {
    const response = await this.http.post<FocusResponse>("/focus/end", {});
    return response.focus;
  }

  /**
   * Subscribe to focus changes via SSE
   */
  subscribeFocus(
    onConnected: (data: SSEFocusConnectedData) => void,
    onFocusChanged: (data: SSEFocusChangedData) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/focus`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onConnected(data);
    });

    eventSource.addEventListener("focus-changed", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onFocusChanged(data);
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
  }
}
