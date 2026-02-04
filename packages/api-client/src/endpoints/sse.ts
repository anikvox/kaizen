import type { HttpClient } from "../http.js";
import type { SSETickData } from "../types/index.js";

export class SSEEndpoint {
  constructor(private http: HttpClient) {}

  subscribeTicks(
    onMessage: (data: SSETickData) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    return this.http.createSSE<SSETickData>("/sse", "tick", onMessage, onError, token);
  }
}
