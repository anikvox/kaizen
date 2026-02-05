import type { HttpClient } from "../http.js";
import type {
  UserSettings,
  UserSettingsUpdateRequest,
  SSESettingsConnectedData,
  SSESettingsChangedData,
} from "../types/index.js";

export class SettingsEndpoint {
  constructor(private http: HttpClient) {}

  async get(deviceToken?: string): Promise<UserSettings> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings`, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.get<UserSettings>("/settings", true);
  }

  async update(settings: UserSettingsUpdateRequest, deviceToken?: string): Promise<UserSettings> {
    if (deviceToken) {
      // Use device token auth
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${deviceToken}`,
      };
      const response = await fetch(`${this.http.getBaseUrl()}/settings`, {
        method: "POST",
        headers,
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return response.json();
    }
    return this.http.post<UserSettings>("/settings", settings, true);
  }

  subscribeSettings(
    onConnected: (data: SSESettingsConnectedData) => void,
    onSettingsChanged: (data: SSESettingsChangedData) => void,
    onError?: (error: Event) => void,
    deviceToken?: string
  ): EventSource {
    const url = new URL(`${this.http.getBaseUrl()}/sse/settings`);
    if (deviceToken) {
      url.searchParams.set("token", deviceToken);
    }

    const eventSource = new EventSource(url.toString());

    eventSource.addEventListener("connected", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onConnected(data);
    });

    eventSource.addEventListener("settings-changed", (e) => {
      const data = JSON.parse((e as MessageEvent).data);
      onSettingsChanged(data);
    });

    if (onError) {
      eventSource.onerror = onError;
    }

    return eventSource;
  }
}
