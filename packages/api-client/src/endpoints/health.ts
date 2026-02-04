import type { HttpClient } from "../http.js";
import type { HealthResponse, MessageResponse } from "../types/index.js";

export class HealthEndpoint {
  constructor(private http: HttpClient) {}

  async check(): Promise<HealthResponse> {
    return this.http.get<HealthResponse>("/health");
  }

  async getMessage(): Promise<MessageResponse> {
    return this.http.get<MessageResponse>("/");
  }
}
