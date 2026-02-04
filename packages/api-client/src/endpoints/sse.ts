import type { HttpClient } from "../http.js";
import type { SSETickData, SSEDeviceTokenRevokedData, SSEDeviceListChangedData } from "../types/index.js";

export class SSEEndpoint {
  constructor(private http: HttpClient) {}

  subscribeTicks(
    onMessage: (data: SSETickData) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    return this.http.createSSE<SSETickData>("/sse", "tick", onMessage, onError, token);
  }

  subscribeDeviceTokenRevoked(
    onMessage: (data: SSEDeviceTokenRevokedData) => void,
    onError?: (error: Event) => void,
    deviceToken?: string
  ): EventSource {
    return this.http.createSSE<SSEDeviceTokenRevokedData>(
      "/sse/device-token",
      "device-token-revoked",
      onMessage,
      onError,
      deviceToken
    );
  }

  async subscribeDeviceListChanged(
    onMessage: (data: SSEDeviceListChangedData) => void,
    onError?: (error: Event) => void
  ): Promise<EventSource | null> {
    return this.http.createAuthenticatedSSE<SSEDeviceListChangedData>(
      "/sse/devices",
      "device-list-changed",
      onMessage,
      onError
    );
  }
}
