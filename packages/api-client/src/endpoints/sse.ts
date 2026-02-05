import type { HttpClient } from "../http.js";
import type { SSETickData, SSEDeviceTokenRevokedData, SSEDeviceListChangedData, SSEDeviceTokenConnectedData } from "../types/index.js";

export class SSEEndpoint {
  constructor(private http: HttpClient) {}

  subscribeTicks(
    onMessage: (data: SSETickData) => void,
    onError?: (error: Event) => void,
    token?: string
  ): EventSource {
    return this.http.createSSE<SSETickData>("/sse", "tick", onMessage, onError, token);
  }

  subscribeDeviceToken(
    onConnected: (data: SSEDeviceTokenConnectedData) => void,
    onRevoked: (data: SSEDeviceTokenRevokedData) => void,
    onError?: (error: Event) => void,
    deviceToken?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/device-token`);
    if (deviceToken) {
      url.searchParams.set("token", deviceToken);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onConnected(data);
    });

    eventSource.addEventListener("device-token-revoked", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onRevoked(data);
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
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
