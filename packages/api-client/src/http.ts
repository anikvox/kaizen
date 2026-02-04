import type { ApiClientOptions } from "./types/index.js";

export class HttpClient {
  private baseUrl: string;
  private getToken?: () => Promise<string | null>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.getToken = options.getToken;
  }

  private async getHeaders(auth = false): Promise<HeadersInit> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (auth && this.getToken) {
      const token = await this.getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }

    return headers;
  }

  async get<T>(path: string, auth = false): Promise<T> {
    const headers = await this.getHeaders(auth);
    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async post<T>(path: string, body: unknown, auth = false): Promise<T> {
    const headers = await this.getHeaders(auth);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async put<T>(path: string, body: unknown, auth = false): Promise<T> {
    const headers = await this.getHeaders(auth);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  async delete<T>(path: string, auth = false): Promise<T> {
    const headers = await this.getHeaders(auth);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: "DELETE",
      headers,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return response.json();
  }

  createSSE<T>(
    path: string,
    event: string,
    onMessage: (data: T) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    const url = new URL(`${this.baseUrl}${path}`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener(event, (e) => {
      const data = JSON.parse(e.data);
      onMessage(data);
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
